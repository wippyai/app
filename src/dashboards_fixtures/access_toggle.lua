-- POST /api/v1/dashboards-fixtures/access { "allow": true | false }
-- Test fixture of the access tests (RC1-08): sets the effect of the policy
-- app.dashboards_fixtures:reads_toggle to allow or deny, so a test can withdraw the right of a regular
-- user to view the page reads_toggle at run time. Only a user who may publish dashboard pages (an admin)
-- may call it.
local http = require("http")
local json = require("json")
local security = require("security")
local registry = require("registry")

local POLICY_ID = "app.dashboards_fixtures:reads_toggle"

local function fail(res, status, message)
    res:set_status(status)
    res:write_json({ error = { message = message } })
end

local function handler()
    local req = http.request()
    local res = http.response()
    res:set_content_type(http.CONTENT.JSON)

    if not security.can("dashboards.publish", "wippy.dashboards:pages") then
        return fail(res, http.STATUS.FORBIDDEN, "admin only")
    end
    local body = json.decode(req:body() or "")
    if type(body) ~= "table" or type(body.allow) ~= "boolean" then
        return fail(res, http.STATUS.BAD_REQUEST, "send { allow: true | false }")
    end

    local entry = registry.get(POLICY_ID)
    if not entry then
        return fail(res, http.STATUS.NOT_FOUND, "the toggle policy is missing")
    end
    local data = entry.data or {}
    local policy = {}
    for k, v in pairs(data.policy or {}) do
        policy[k] = v
    end
    policy.effect = body.allow and "allow" or "deny"
    local new_data = {}
    for k, v in pairs(data) do
        new_data[k] = v
    end
    new_data.policy = policy

    local snap, serr = registry.snapshot()
    if serr then
        return fail(res, http.STATUS.INTERNAL_ERROR, "snapshot failed")
    end
    local changes, cerr = snap:changes()
    if cerr then
        return fail(res, http.STATUS.INTERNAL_ERROR, "changeset failed")
    end
    local _, uerr = changes:update({ id = POLICY_ID, kind = entry.kind, meta = entry.meta, data = new_data })
    if uerr then
        return fail(res, http.STATUS.INTERNAL_ERROR, "update failed")
    end
    local _, aerr = changes:apply()
    if aerr then
        return fail(res, http.STATUS.INTERNAL_ERROR, "apply failed")
    end

    res:set_status(http.STATUS.OK)
    res:write_json({ effect = policy.effect })
end

return { handler = handler }
