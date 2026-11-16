-- wippy.dashboards.agent:publish_page publishes one page spec (JSON text) with
-- the actor and scope it is called with. The BuildDashboard tool calls it with
-- the chat user's identity. It returns { ok = true, result } or { ok = false, error }.
local publish_lib = require("publish")

local function publish(raw)
    local result, err = publish_lib.publish(raw)
    if not result then
        return { ok = false, error = { code = err.code, message = err.message } }
    end
    return { ok = true, result = result }
end

return { publish = publish }
