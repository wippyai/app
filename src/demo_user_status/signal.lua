-- The live signal of the users point (contracts section 9).
--
-- Topic dash.users.changed. The message carries no data: the payload is an
-- empty table. A tile that subscribes with on() reads the point again through
-- the engine, which checks the viewer's access on every read.
--
-- wippy.central forwards any message that is not a relay control topic to the
-- hub of every connected user, and each user hub fans it out to that user's
-- clients. It cannot pick recipients. A user who may not view the page gets a
-- content-free signal and a denied read, so nothing leaks.
--
-- publish() is called by the admin test endpoint (signal_handler below) and,
-- in stage E3, by the set_status action after it changed a user.
local http = require("http")
local security = require("security")
local logger = require("logger"):named("demo.user_status")

local TOPIC = "dash.users.changed"
local CENTRAL_HUB = "wippy.central"

-- Sends the signal once. Returns { sent = true }, or nil plus a reason.
local function publish()
    local central = process.registry.lookup(CENTRAL_HUB)
    if not central then
        return nil, "the relay hub " .. CENTRAL_HUB .. " is not running"
    end
    local ok, err = process.send(central, TOPIC, {})
    if not ok then
        return nil, "cannot send " .. TOPIC .. ": " .. tostring(err)
    end
    return { sent = true, topic = TOPIC }
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
