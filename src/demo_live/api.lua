-- Test endpoints of the live demo, for the browser tests (e2e/dashboards-live.spec.ts).
--   POST /api/v1/demo/live/push-me          { value }   pushes my_load to the calling user only
--   POST /api/v1/demo/live/signal           { }         a signal to the viewers of queue_length (admin)
--   POST /api/v1/demo/live/restart-service  { }         ends the subscription service, so the app restarts it (admin)
--   POST /api/v1/demo/live/withdraw         { on }      sets the effect of the policy withdraw_view to deny or allow (admin)
local http = require("http")
local json = require("json")
local security = require("security")
local registry = require("registry")
local live = require("live")
local values = require("values")
local logger = require("logger"):named("demo.live")

local MY_LOAD = "demo.live:my_load"
local QUEUE_LENGTH = "demo.live:queue_length"
local SERVICE = "wippy.dashboards.live"
local WITHDRAW_ID = "demo.live:withdraw_view"
local ADMIN_ACTION, ADMIN_RESOURCE = "demo.live.admin", "demo.live:service"

local function body_table(req)
    local raw = req:body()
    if raw == nil or raw == "" then
        return {}
    end
    local decoded = json.decode(raw)
    return type(decoded) == "table" and decoded or {}
end

local function reply(res, status, body)
    res:set_status(status)
    res:write_json(body)
end

local function admin_only(res)
    if security.can(ADMIN_ACTION, ADMIN_RESOURCE) then
        return true
    end
    reply(res, http.STATUS.FORBIDDEN, { error = { code = "denied", message = "Admin only" } })
    return false
end

local function push_me()
    local req, res = http.request(), http.response()
    res:set_content_type(http.CONTENT.JSON)
    local value = body_table(req).value
    if type(value) ~= "number" then
        return reply(res, http.STATUS.BAD_REQUEST, { error = { code = "invalid_args", message = "value must be a number" } })
    end
    local actor = security.actor()
    local result, err = live.push(MY_LOAD, {}, values.frame(value), { user = actor and actor:id() })
    if not result then
        logger:warn("push-me refused", { code = err.code, message = err.message })
        return reply(res, http.STATUS.BAD_REQUEST, { error = { code = err.code, message = err.message } })
    end
    reply(res, http.STATUS.OK, { pushed = true, seq = result.seq, delivered = result.delivered })
end

local function signal()
    local res = http.response()
    res:set_content_type(http.CONTENT.JSON)
    if not admin_only(res) then
        return
    end
    local result, err = live.signal(QUEUE_LENGTH, { queue = "mail" })
    if not result then
        return reply(res, http.STATUS.BAD_REQUEST, { error = { code = err.code, message = err.message } })
    end
    reply(res, http.STATUS.OK, { delivered = result.delivered })
end

local function restart_service()
    local res = http.response()
    res:set_content_type(http.CONTENT.JSON)
    if not admin_only(res) then
        return
    end
    local pid = process.registry.lookup(SERVICE)
    if not pid then
        return reply(res, http.STATUS.SERVICE_UNAVAILABLE, { error = { code = "not_running", message = "The subscription service is not running" } })
    end
    local ok, err = process.terminate(pid)
    if not ok then
        return reply(res, http.STATUS.INTERNAL_ERROR, { error = { code = "terminate_failed", message = tostring(err) } })
    end
    reply(res, http.STATUS.OK, { terminated = true })
end

-- Regular users lose the right to view the live page while the policy withdraw_view has the effect deny.
-- The entry exists from the start with the effect allow, and this endpoint updates its effect.
local function withdraw()
    local req, res = http.request(), http.response()
    res:set_content_type(http.CONTENT.JSON)
    if not admin_only(res) then
        return
    end
    local on = body_table(req).on == true
    local entry = registry.get(WITHDRAW_ID)
    if not entry then
        return reply(res, http.STATUS.NOT_FOUND, { error = { code = "registry", message = "the policy " .. WITHDRAW_ID .. " is missing" } })
    end
    local effect = on and "deny" or "allow"
    local data = entry.data or {}
    if data.policy and data.policy.effect == effect then
        return reply(res, http.STATUS.OK, { withdrawn = on })
    end
    local policy = {}
    for k, v in pairs(data.policy or {}) do
        policy[k] = v
    end
    policy.effect = effect
    local new_data = {}
    for k, v in pairs(data) do
        new_data[k] = v
    end
    new_data.policy = policy

    local snap, serr = registry.snapshot()
    if serr then
        return reply(res, http.STATUS.INTERNAL_ERROR, { error = { code = "registry", message = tostring(serr) } })
    end
    local changes, cerr = snap:changes()
    if cerr then
        return reply(res, http.STATUS.INTERNAL_ERROR, { error = { code = "registry", message = tostring(cerr) } })
    end
    local _, uerr = changes:update({ id = WITHDRAW_ID, kind = entry.kind, meta = entry.meta, data = new_data })
    if uerr then
        return reply(res, http.STATUS.INTERNAL_ERROR, { error = { code = "registry", message = tostring(uerr) } })
    end
    local _, aerr = changes:apply()
    if aerr then
        return reply(res, http.STATUS.INTERNAL_ERROR, { error = { code = "registry", message = tostring(aerr) } })
    end
    -- Check what the registry holds now, so a change that did not happen is an error.
    local now = registry.get(WITHDRAW_ID)
    if not now or not now.data or not now.data.policy or now.data.policy.effect ~= effect then
        return reply(res, http.STATUS.INTERNAL_ERROR, { error = { code = "registry", message = "the policy effect did not change" } })
    end
    reply(res, http.STATUS.OK, { withdrawn = on })
end

return { push_me = push_me, signal = signal, restart_service = restart_service, withdraw = withdraw }
