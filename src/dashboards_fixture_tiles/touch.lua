-- Endpoints that the fixture components of this module call (the artifact tile tests, RC1-21).
--
--   POST /api/v1/dashboards-fixtures/touch       a change of data: counts calls. Admin only.
--   GET  /api/v1/dashboards-fixtures/restricted  an API that a regular viewer may not use.
--
-- Both check the permission of the caller. The shown component runs with the viewer's rights, so a
-- viewer without it gets 403 (policy deny_fixture_touch in _index.yaml).
local http = require("http")
local security = require("security")

local calls = 0

local function guard(res)
    if security.can("dashboards_fixtures.touch", "app.dashboards_fixture_tiles:touch") then
        return true
    end
    res:set_status(http.STATUS.FORBIDDEN)
    res:write_json({ error = { code = "denied", message = "You may not use this API." } })
    return false
end

local function touch_handler()
    local res = http.response()
    res:set_content_type(http.CONTENT.JSON)
    if not guard(res) then
        return
    end
    calls = calls + 1
    res:set_status(http.STATUS.OK)
    res:write_json({ touched = true, calls = calls })
end

local function restricted_handler()
    local res = http.response()
    res:set_content_type(http.CONTENT.JSON)
    if not guard(res) then
        return
    end
    res:set_status(http.STATUS.OK)
    res:write_json({ ok = true, calls = calls })
end

return { touch_handler = touch_handler, restricted_handler = restricted_handler }
