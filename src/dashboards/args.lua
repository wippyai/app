-- Binding of request arguments to the arguments a page declares (contracts section 4).
-- Shared by the read endpoint and the action endpoint.
local M = {}

-- True when a value holds a { "$param": name } reference at any depth.
local function holds_param(value, depth)
    if type(value) ~= "table" or depth > 8 then
        return false
    end
    if value["$param"] ~= nil then
        return true
    end
    for _, v in pairs(value) do
        if holds_param(v, depth + 1) then
            return true
        end
    end
    return false
end

-- True for exactly { "$param": name }.
local function is_whole_param(value)
    if type(value) ~= "table" or type(value["$param"]) ~= "string" then
        return false
    end
    for k in pairs(value) do
        if k ~= "$param" then
            return false
        end
    end
    return true
end

-- Splits the page's declared args into constants (key -> value) and bound keys
-- (keys the page binds to a $param, which the request supplies). Publication
-- allows only these two forms. A stored page that still holds a $param inside
-- something else fails closed: the result is nil, nil, "mixed".
function M.classify(page_args)
    local constants, bound = {}, {}
    for key, value in pairs(page_args or {}) do
        if is_whole_param(value) then
            bound[key] = true
        elseif holds_param(value, 1) then
            return nil, nil, "mixed"
        else
            constants[key] = value
        end
    end
    return constants, bound
end

return M
