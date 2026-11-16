-- DELETE /api/v1/dashboards/pages/{id}: removes a published page, its stored
-- row and its view.page entry, so its route and nav item go away and the
-- restore on start does not bring it back. Same permission as publishing.
local http = require("http")
local security = require("security")
local sql = require("sql")
local logger = require("logger")
local spec_lib = require("spec")
local generator = require("generator")

local function fail(res, status, code, message)
    res:set_status(status)
    res:write_json({ error = { code = code, message = message } })
end

local function handler()
    local req = http.request()
    local res = http.response()
    res:set_content_type(http.CONTENT.JSON)

    if not security.can("dashboards.publish", "wippy.dashboards:pages") then
        return fail(res, http.STATUS.FORBIDDEN, "denied", "You may not remove dashboard pages")
    end
    local id = req:param("id")
    if not spec_lib.is_page_id(id) then
        return fail(res, http.STATUS.NOT_FOUND, "not_found", "Unknown page")
    end

    local db, derr = sql.get("app:db")
    if derr then
        return fail(res, http.STATUS.INTERNAL_ERROR, "internal", "Database unavailable")
    end
    local rows, qerr = db:query("SELECT page_id FROM dash_pages WHERE page_id = ?", { id })
    if qerr then
        db:release()
        return fail(res, http.STATUS.INTERNAL_ERROR, "internal", "Cannot read the page")
    end
    if not rows or not rows[1] then
        db:release()
        return fail(res, http.STATUS.NOT_FOUND, "not_found", "Unknown page")
    end

    -- Entry first: if the registry refuses, the row stays and nothing changed.
    local _, gerr = generator.remove(id)
    if gerr then
        db:release()
        logger:warn("dashboards: page entry not removed", { page = id, error = tostring(gerr) })
        return fail(res, http.STATUS.INTERNAL_ERROR, "internal", "Cannot remove the page entry")
    end
    local _, xerr = db:execute("DELETE FROM dash_pages WHERE page_id = ?", { id })
    db:release()
    if xerr then
        logger:warn("dashboards: page row not removed", { page = id, error = tostring(xerr) })
        return fail(res, http.STATUS.INTERNAL_ERROR, "internal", "Cannot remove the stored page")
    end

    logger:info("dashboards: page removed", { page = id })
    res:set_status(http.STATUS.OK)
    res:write_json({ id = id, removed = true })
end

return { handler = handler }
