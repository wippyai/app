-- Admin-only: raw data for the browser tests. GET /api/v1/demo/raw/usage-rows returns
--   rows    the rows of the source of the open point usage_rows, every column included
--           (thinking_tokens too, which rows_schema leaves out);
--   counts  sessions, messages, users, sessions per month and messages per type, from queries
--           that are not the sources of the points.
-- The tests compute their expected values from this data, not from a mapped output, and check
-- that the columns left out of rows_schema never show in a point read.
local http = require("http")
local security = require("security")
local funcs = require("funcs")
local sql = require("sql")

local function query(text)
    local db, derr = sql.get("app:db")
    if derr then
        return nil
    end
    local rows, qerr = db:query(text)
    db:release()
    if qerr then
        return nil
    end
    return rows
end

local function handler()
    local res = http.response()
    res:set_content_type(http.CONTENT.JSON)

    if not security.can("demo.actor.raw_usage", "demo.actor:raw_usage") then
        res:set_status(http.STATUS.FORBIDDEN)
        res:write_json({ error = { code = "denied", message = "Admin only" } })
        return
    end

    local rows, err = funcs.new():call("demo.actor:source.usage_rows", { args = {} })
    local sessions = query("SELECT COUNT(*) AS n FROM sessions")
    local messages = query("SELECT COUNT(*) AS n FROM messages")
    local users = query("SELECT COUNT(*) AS n FROM app_users")
    local months = query("SELECT substr(start_date, 1, 7) AS month, COUNT(*) AS n FROM sessions GROUP BY 1 ORDER BY 1")
    local types = query("SELECT type, COUNT(*) AS n FROM messages GROUP BY 1 ORDER BY 1")
    if err ~= nil or type(rows) ~= "table" or not sessions or not messages or not users or not months or not types then
        res:set_status(http.STATUS.INTERNAL_ERROR)
        res:write_json({ error = { code = "source_failed", message = "A query failed" } })
        return
    end

    res:set_status(http.STATUS.OK)
    res:write_json({
        rows = rows,
        counts = {
            sessions = sessions[1].n,
            messages = messages[1].n,
            users = users[1].n,
            sessions_by_month = months,
            messages_by_type = types,
        },
    })
end

return { handler = handler }
