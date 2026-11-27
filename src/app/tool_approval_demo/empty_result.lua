-- Keep explicit JSON null separate from an empty string.
local json = require("json")
local function empty_result(params: any)
    if params.kind == "null" then return json.null end
    return ""
end
return { empty_result = empty_result }
