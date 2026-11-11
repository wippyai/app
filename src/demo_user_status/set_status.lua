-- demo.user_status:set_user_status is the function of the action demo.user_status:set_status.
-- The engine calls it as the viewer with { args, action_id, idempotency_key }, after it has
-- checked the page, the permission, the arguments and the idempotency record.
--
-- It refuses the caller's own account (error code self_target), changes the status through
-- the userspace repository and sends the signal dash.users.changed through the existing
-- publisher. Errors carry a code in their details; the engine shows only that code.
local security = require("security")
local funcs = require("funcs")
local user_repo = require("user_repo")
local logger = require("logger"):named("demo.user_status")

local PERMISSION_ACTION = "dash.users.set_status"
local PERMISSION_RESOURCE = "demo.user_status:users"

local function refuse(code, message)
    return nil, errors.new({
        kind = errors.INVALID,
        message = message,
        retryable = false,
        details = { code = code },
    })
end

local function set_status(input)
    local args = input and input.args or {}
    local user_id, status = args.user_id, args.status
    if type(user_id) ~= "string" or user_id == "" or (status ~= "active" and status ~= "inactive") then
        return refuse("invalid_args", "user_id and status (active or inactive) are required")
    end

    -- The function checks the permission itself, because a schema cannot say who may change whom.
    if not security.can(PERMISSION_ACTION, PERMISSION_RESOURCE) then
        return refuse("denied", "The caller may not set a user status")
    end

    local actor = security.actor()
    local caller_id = actor and actor:id() or ""
    if caller_id == "" then
        return refuse("denied", "No caller")
    end
    if caller_id:lower() == user_id:lower() then
        logger:info("set_status refused: own account", { caller = caller_id })
        return refuse("self_target", "A user cannot change their own status")
    end

    local target = user_repo.get(user_id)
    if not target then
        return refuse("user_not_found", "No such user")
    end

    local _, err = user_repo.update(user_id, { status = status })
    if err then
        logger:error("set_status failed", { user_id = user_id, error = tostring(err) })
        return nil, "cannot update the user: " .. tostring(err)
    end
    logger:info("set_status ran", { caller = caller_id, user_id = user_id, status = status, key = input.idempotency_key })

    -- The data is changed. A signal that cannot be sent only delays the tiles' next read.
    local _, serr = funcs.new():call("demo.user_status:publish_signal")
    if serr then
        logger:warn("set_status: the signal was not sent", { error = tostring(serr) })
    end

    return { user_id = user_id, status = status }
end

return { set_status = set_status }
