-- The backend loop of the live demo: once a second it pushes the queue length to every viewer
-- who has the point open (audience page), with live.push of wippy/dashboards.
local live = require("live")
local values = require("values")
local time = require("time")
local logger = require("logger"):named("demo.live")

local POINT = "demo.live:queue_length"
local ARGS = { queue = "mail" }

local function main()
    local events = process.events()
    local timer = time.after("1s")
    while true do
        local picked = channel.select({ events:case_receive(), timer:case_receive() })
        if picked.channel == events then
            local event = picked.value
            if not event or event.kind == process.event.CANCEL then
                return true
            end
        else
            local sent, err = live.push(POINT, ARGS, values.frame(values.queue_length(os.time())))
            -- No subscription service yet (the app is starting) is not worth a log line each second.
            if not sent and err and err.code ~= "unavailable" then
                logger:warn("push refused", { code = err.code, message = err.message })
            end
            timer = time.after("1s")
        end
    end
end

return { main = main }
