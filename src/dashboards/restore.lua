-- Restores the view.page entry of every published page when the app starts.
-- Entries created at runtime are lost on restart, while their specs stay in
-- dash_pages (spec section 9.1), so a page built in chat would lose its route.
-- This is the POC's reconcile step: it re-writes each entry through the same
-- generator that publication uses, then waits until the service is stopped.
local sql = require("sql")
local json = require("json")
local logger = require("logger")
local generator = require("generator")

local function restore()
    local db, derr = sql.get("app:db")
    if derr then
        logger:error("dashboards: restore: database unavailable", { error = tostring(derr) })
        return
    end
    local rows, qerr = db:query("SELECT page_id, spec FROM dash_pages WHERE published = 1 ORDER BY page_id")
    db:release()
    if qerr then
        logger:error("dashboards: restore: cannot read pages", { error = tostring(qerr) })
        return
    end
    local restored, failed = 0, 0
    for _, row in ipairs(rows or {}) do
        local spec, jerr = json.decode(row.spec)
        if jerr or type(spec) ~= "table" or type(spec.id) ~= "string" or type(spec.route) ~= "string" then
            failed = failed + 1
            logger:warn("dashboards: restore: unreadable spec", { page = row.page_id })
        else
            local ok, werr = generator.write(spec)
            if ok then
                restored = restored + 1
            else
                failed = failed + 1
                logger:warn("dashboards: restore: entry not written", { page = row.page_id, error = tostring(werr) })
            end
        end
    end
    logger:info("dashboards: pages restored", { restored = restored, failed = failed })
end

local function main()
    restore()
    local events = process.events()
    while true do
        local event = events:receive()
        if not event or event.kind == process.event.CANCEL then
            return true
        end
    end
end

return { main = main }
