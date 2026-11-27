-- Same slow fixture behavior, with its time import scoped to its own entry.
local time = require("time")
local function slow_record(params: any)
    time.sleep("20s")
    local value = type(params) == "table" and params.record or nil
    return { ran = true, tool = "slow_record", record = value, wait_seconds = 20 }
end
return { slow_record = slow_record }
