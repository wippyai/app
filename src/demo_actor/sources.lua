-- Sources of the mock actor: plain functions that run one SQL query against app:db and return
-- raw rows. They know nothing about tiles or frames; a declared mapper (src/mock_mappers) turns
-- the rows into the format a tile needs. The engine calls a source as the viewer with
-- { args, point_id, point_meta } and expects a list of rows, or nil and a message.
--
-- The SQL runs on SQLite and on PostgreSQL (the database seam of wippy/dashboards): `?` placeholders,
-- a timestamp column is read as text (CAST ... AS TEXT, since SQLite stores text and PostgreSQL a
-- timestamp), a parameter that only meets IS NULL is cast, and a derived table has an alias.
local sql = require("sql")
local database = require("database")

local M = {}

local function query(text, params)
    local db, derr = database.open("app:db")
    if derr then
        return nil, "database unavailable"
    end
    local rows, qerr = db:query(text, params or {})
    db:release()
    if qerr then
        return nil, "query failed: " .. tostring(qerr)
    end
    return rows
end

-- A missing argument filters nothing. A Lua nil cannot sit inside a parameter
-- list, so it becomes an SQL NULL.
local function opt(value)
    if value == nil then
        return sql.NULL
    end
    return value
end

local function args_of(input)
    return type(input) == "table" and type(input.args) == "table" and input.args or {}
end

function M.usage_models()
    return query([[
        SELECT model_id AS value, model_id || ' (' || CAST(COUNT(*) AS TEXT) || ' calls)' AS label
        FROM token_usage GROUP BY model_id ORDER BY model_id
    ]])
end

-- No call matches the filter: no row, so the point is empty, never a zero.
function M.usage_tokens(input)
    local model = opt(args_of(input).model)
    return query([[
        SELECT SUM(prompt_tokens + completion_tokens) AS tokens, COUNT(*) AS calls
        FROM token_usage WHERE (CAST(? AS TEXT) IS NULL OR model_id = ?) HAVING COUNT(*) > 0
    ]], { model, model })
end

function M.usage_by_day(input)
    local model = opt(args_of(input).model)
    return query([[
        SELECT substr(CAST(timestamp AS TEXT), 1, 10) AS day, model_id, SUM(prompt_tokens + completion_tokens) AS tokens
        FROM token_usage WHERE (CAST(? AS TEXT) IS NULL OR model_id = ?) GROUP BY 1, 2 ORDER BY 1, 2
    ]], { model, model })
end

function M.usage_by_model(input)
    local args = args_of(input)
    local model, day = opt(args.model), opt(args.day)
    return query([[
        SELECT model_id, COUNT(*) AS calls, SUM(prompt_tokens + completion_tokens) AS tokens
        FROM token_usage
        WHERE (CAST(? AS TEXT) IS NULL OR model_id = ?) AND (CAST(? AS TEXT) IS NULL OR substr(CAST(timestamp AS TEXT), 1, 10) = ?)
        GROUP BY 1 ORDER BY 3 DESC
    ]], { model, model, day, day })
end

-- One row with one sentence, which is what an agent analysis page would write.
function M.usage_summary()
    local rows, err = query([[
        SELECT model_id, COUNT(*) AS calls, SUM(prompt_tokens + completion_tokens) AS tokens
        FROM token_usage GROUP BY 1 ORDER BY 3 DESC
    ]])
    if not rows then
        return nil, err
    end
    if #rows == 0 then
        return {}
    end
    local total, calls = 0, 0
    for _, r in ipairs(rows) do
        total = total + r.tokens
        calls = calls + r.calls
    end
    local top = rows[1]
    local share = math.floor(top.tokens / total * 1000 + 0.5) / 10
    return { { text = calls .. " calls used " .. total .. " tokens. " .. top.model_id .. " used " .. share .. "% of them." } }
end

function M.app_sessions()
    return query("SELECT COUNT(*) AS sessions FROM sessions")
end

function M.app_messages()
    return query("SELECT COUNT(*) AS messages FROM messages")
end

function M.sessions_by_month()
    return query("SELECT substr(CAST(start_date AS TEXT), 1, 7) AS month, COUNT(*) AS sessions FROM sessions GROUP BY 1 ORDER BY 1")
end

function M.message_types()
    return query("SELECT type, COUNT(*) AS messages FROM messages GROUP BY 1 ORDER BY 2 DESC")
end

function M.messages_by_day()
    return query([[SELECT substr(CAST("date" AS TEXT), 1, 10) AS day, COUNT(*) AS messages FROM messages GROUP BY 1 ORDER BY 1]])
end

function M.calls_by_day(input)
    local model = opt(args_of(input).model)
    return query([[
        SELECT substr(CAST(timestamp AS TEXT), 1, 10) AS day, COUNT(*) AS calls
        FROM token_usage WHERE (CAST(? AS TEXT) IS NULL OR model_id = ?) GROUP BY 1 ORDER BY 1
    ]], { model, model })
end

-- One row per kind of token that has a count, in a fixed order.
function M.tokens_by_kind(input)
    local model = opt(args_of(input).model)
    return query([[
        SELECT kind, tokens FROM (
            SELECT 1 AS ord, 'Prompt' AS kind, COALESCE(SUM(prompt_tokens), 0) AS tokens FROM token_usage WHERE (CAST(? AS TEXT) IS NULL OR model_id = ?)
            UNION ALL
            SELECT 2, 'Completion', COALESCE(SUM(completion_tokens), 0) FROM token_usage WHERE (CAST(? AS TEXT) IS NULL OR model_id = ?)
            UNION ALL
            SELECT 3, 'Thinking', COALESCE(SUM(thinking_tokens), 0) FROM token_usage WHERE (CAST(? AS TEXT) IS NULL OR model_id = ?)
            UNION ALL
            SELECT 4, 'Cache read', COALESCE(SUM(cache_read_tokens), 0) FROM token_usage WHERE (CAST(? AS TEXT) IS NULL OR model_id = ?)
            UNION ALL
            SELECT 5, 'Cache write', COALESCE(SUM(cache_write_tokens), 0) FROM token_usage WHERE (CAST(? AS TEXT) IS NULL OR model_id = ?)
        ) AS kinds WHERE tokens > 0 ORDER BY ord
    ]], { model, model, model, model, model, model, model, model, model, model })
end

function M.recent_sessions()
    return query([[
        SELECT COALESCE(NULLIF(s.title, ''), '(untitled)') AS session, COALESCE(s.status, '') AS status,
               substr(CAST(s.start_date AS TEXT), 1, 10) AS started,
               replace(COALESCE(substr(CAST(s.last_message_date AS TEXT), 1, 16), ''), 'T', ' ') AS last_message,
               COUNT(m.message_id) AS messages
        FROM sessions s LEFT JOIN messages m ON m.session_id = s.session_id
        GROUP BY s.session_id ORDER BY s.last_message_date DESC NULLS LAST LIMIT 20
    ]])
end

function M.app_users()
    return query("SELECT COUNT(*) AS users FROM app_users")
end

-- The rows of the open point: one row per LLM call. The query also returns thinking_tokens, which
-- the point's rows_schema does not list, so the engine drops it before any mapper sees it.
-- At most 10,000 rows, the most that a mapper takes by default.
function M.usage_rows(input)
    local model = opt(args_of(input).model)
    local rows, err = query([[
        SELECT CAST(timestamp AS TEXT) AS timestamp, substr(CAST(timestamp AS TEXT), 1, 10) AS day, model_id,
               COALESCE(prompt_tokens, 0) AS prompt_tokens, COALESCE(completion_tokens, 0) AS completion_tokens,
               COALESCE(prompt_tokens, 0) + COALESCE(completion_tokens, 0) AS total_tokens,
               COALESCE(thinking_tokens, 0) AS thinking_tokens
        FROM token_usage
        WHERE timestamp IS NOT NULL AND model_id IS NOT NULL AND (CAST(? AS TEXT) IS NULL OR model_id = ?)
        ORDER BY timestamp DESC LIMIT 10000
    ]], { model, model })
    -- PostgreSQL writes a timestamp as "2026-06-16 20:43:42.395"; the mappers read RFC 3339.
    for _, row in ipairs(rows or {}) do
        if type(row.timestamp) == "string" then
            row.timestamp = row.timestamp:gsub("^(%d%d%d%d%-%d%d%-%d%d) ", "%1T")
        end
    end
    return rows, err
end

return M
