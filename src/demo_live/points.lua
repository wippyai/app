-- Functions of the live demo points.
local security = require("security")
local values = require("values")

-- The queue length now. A backend loop (ticker.lua) pushes the same number each second.
local function queue_length()
    return values.frame(values.queue_length(os.time()))
end

-- The calling viewer's own number: the same for a viewer on every read, different between viewers.
local function my_load()
    local actor = security.actor()
    local id = actor and actor:id() or "anonymous"
    return values.frame(values.base_for(tostring(id)))
end

return { queue_length = queue_length, my_load = my_load }
