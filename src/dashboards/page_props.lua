-- GET /api/v1/dashboards/pages/{id}/props (contracts sections 3 and 6).
local http = require("http")
local json = require("json")
local security = require("security")
local sql = require("sql")
local registry = require("registry")
local spec_lib = require("spec")
local compile = require("compile")

local function fail(res, status, code, message)
    res:set_status(status)
    res:write_json({ error = { code = code, message = message } })
end

local function handler()
    local req = http.request()
    local res = http.response()
    res:set_content_type(http.CONTENT.JSON)

    local id = req:param("id")
    if not spec_lib.is_page_id(id) then
        return fail(res, http.STATUS.NOT_FOUND, "not_found", "Unknown page")
    end

    -- A stored page without its registry entry (after a restart) is not served.
    local entry_id = spec_lib.entry_id(id)
    local entry = registry.get(entry_id)
    if not entry then
        return fail(res, http.STATUS.NOT_FOUND, "not_found", "Unknown page")
    end

    if not security.can("view", "page:" .. entry_id) then
        return fail(res, http.STATUS.FORBIDDEN, "denied", "You may not view this page")
    end

    local db, derr = sql.get("app:db")
    if derr then
        return fail(res, http.STATUS.INTERNAL_ERROR, "internal", "Database unavailable")
    end
    local rows, qerr = db:query(
        "SELECT spec, revision FROM dash_pages WHERE page_id = ? AND published = 1", { id })
    db:release()
    if qerr then
        return fail(res, http.STATUS.INTERNAL_ERROR, "internal", "Cannot read the page")
    end
    if not rows or not rows[1] then
        return fail(res, http.STATUS.NOT_FOUND, "not_found", "Unknown page")
    end

    local spec, jerr = json.decode(rows[1].spec)
    if jerr or type(spec) ~= "table" then
        return fail(res, http.STATUS.INTERNAL_ERROR, "internal", "Stored page is unreadable")
    end

    local props, cerr = compile.compile(spec, id, rows[1].revision)
    if not props then
        return fail(res, http.STATUS.INTERNAL_ERROR, "page_broken", "The page names a declaration that is gone")
    end

    res:set_status(http.STATUS.OK)
    res:write_json(props)
end

return { handler = handler }
