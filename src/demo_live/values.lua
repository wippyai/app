-- The numbers of the live demo points. The point functions and the backend loop compute the
-- same value from the same time, so a read and a pushed message agree.
local M = {}

local FRAME = "wippy.dashboard_frame/v1"

-- A running count that rises by 5 each second and starts again every 20 seconds (0 to 95).
function M.queue_length(t)
    return (t % 20) * 5
end

-- A viewer's own base number, from the user id: 100 to 199.
function M.base_for(user)
    local sum = 0
    for i = 1, #user do
        sum = (sum * 31 + user:byte(i)) % 1000003
    end
    return 100 + sum % 100
end

-- A frame with one number, as the kpi tile reads it.
function M.frame(n)
    return {
        schema = FRAME,
        fields = { { name = "value", type = "number", role = "measure", nullable = false } },
        rows = { { n } },
    }
end

return M
