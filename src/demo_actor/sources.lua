-- Sources of the mock actor: plain functions that run one SQL query against
-- app:db and return the raw rows. They know nothing about tiles or frames.
-- A recipe names its source in meta.source (see _index.yaml).
local sql = require("sql")

local M = {}

local function query(text, params)
    local db, derr = sql.get("app:db")
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

function M.usage_models()
    return query("SELECT model_id, COUNT(*) AS calls FROM token_usage GROUP BY model_id ORDER BY model_id")
end

function M.usage_tokens(args)
    local model = opt(args.model)
    return query([[
        SELECT SUM(prompt_tokens + completion_tokens) AS tokens, COUNT(*) AS calls
        FROM token_usage WHERE (? IS NULL OR model_id = ?)
    ]], { model, model })
end

function M.usage_by_day(args)
    local model = opt(args.model)
    return query([[
        SELECT substr(timestamp, 1, 10) AS day, model_id, SUM(prompt_tokens + completion_tokens) AS tokens
        FROM token_usage WHERE (? IS NULL OR model_id = ?) GROUP BY 1, 2 ORDER BY 1, 2
    ]], { model, model })
end

function M.usage_by_model(args)
    local model, day = opt(args.model), opt(args.day)
    return query([[
        SELECT model_id, COUNT(*) AS calls, SUM(prompt_tokens + completion_tokens) AS tokens
        FROM token_usage
        WHERE (? IS NULL OR model_id = ?) AND (? IS NULL OR substr(timestamp, 1, 10) = ?)
        GROUP BY 1 ORDER BY 3 DESC
    ]], { model, model, day, day })
end

function M.app_sessions()
    return query("SELECT COUNT(*) AS sessions FROM sessions")
end

function M.app_messages()
    return query("SELECT COUNT(*) AS messages FROM messages")
end

function M.sessions_by_month()
    return query("SELECT substr(start_date, 1, 7) AS month, COUNT(*) AS sessions FROM sessions GROUP BY 1 ORDER BY 1")
end

function M.message_types()
    return query("SELECT type, COUNT(*) AS messages FROM messages GROUP BY 1 ORDER BY 2 DESC")
end

return M
