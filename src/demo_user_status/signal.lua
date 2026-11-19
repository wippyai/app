-- The live signal of the users point (real-time contract, sections 3 and 4).
--
-- The point declares `live.signal` with `audience: all` and the fixed topic
-- dash:users:changed. The engine's live library sends it to every connected
-- user through wippy.central. The message carries no data: a tile reads the
-- point again through the engine, which checks the viewer's access on every
-- read, so a user who may not view the page gets a denied read and nothing leaks.
--
-- publish() is called by the admin test endpoint (signal_handler below) and by
-- the set_status action after it changed a user.
local http = require("http")
local security = require("security")
local logger = require("logger"):named("demo.user_status")
local live = require("live")

local POINT = "demo.user_status:users"

-- Sends the signal once. Returns { sent = true, topic }, or nil plus a reason.
local function publish()
    local ok, err = live.signal(POINT, {})
    if not ok then
        return nil, "cannot send the users signal: " .. tostring(err)
    end
    return { sent = true, topic = live.topic(POINT, {}) }
end

-- POST /api/v1/demo/signal/users. Admin only (policy deny_signal_users).
local function signal_handler()
    local res = http.response()
    res:set_content_type(http.CONTENT.JSON)

    if not security.can("demo.signal_users", "demo.user_status:signal") then
        res:set_status(http.STATUS.FORBIDDEN)
        res:write_json({ error = { code = "denied", message = "Admin only" } })
        return
    end

    local result, err = publish()
    if not result then
        logger:error("signal not sent", { error = tostring(err) })
        res:set_status(http.STATUS.SERVICE_UNAVAILABLE)
        res:write_json({ error = { code = "relay_unavailable", message = "The signal could not be sent" } })
        return
    end

    res:set_status(http.STATUS.OK)
    res:write_json(result)
end

return { publish = publish, signal_handler = signal_handler }
