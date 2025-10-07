local http = require("http")
local env = require("env")

local function handler()
    -- Get response object
    local res = http.response()
    local req = http.request()
    if not res or not req then
        return nil, "Failed to get HTTP context"
    end

    -- Get all environment variables
    local all_env_vars, err = env.get_all()
    if err then
        res:set_content_type("text/javascript")
        res:set_status(http.STATUS.INTERNAL_SERVER_ERROR)
        res:write("const __WIPPY_ENV__ = {}; // Error loading environment variables")
        return nil, "Failed to get environment variables: " .. err
    end

    -- Filter for PUBLIC_ prefixed variables
    local public_vars = {}
    for var_name, var_value in pairs(all_env_vars) do
        if string.match(var_name, "^PUBLIC_") then
            public_vars[var_name] = var_value
        end
    end

    -- Build JavaScript ES6 module with default export
    local js_lines = {
        "// Wippy Environment Variables Module",
        "const __WIPPY_ENV__ = {"
    }
    
    local var_count = 0
    local total_vars = 0
    for _ in pairs(public_vars) do
        total_vars = total_vars + 1
    end
    
    for name, value in pairs(public_vars) do
        var_count = var_count + 1
        -- Escape single quotes and backslashes in the value
        local escaped_value = string.gsub(value, "\\", "\\\\")
        escaped_value = string.gsub(escaped_value, "'", "\\'")
        escaped_value = string.gsub(escaped_value, "\"", "\\\"")
        escaped_value = string.gsub(escaped_value, "\n", "\\n")
        escaped_value = string.gsub(escaped_value, "\r", "\\r")
        escaped_value = string.gsub(escaped_value, "\t", "\\t")
        
        table.insert(js_lines, "  " .. name .. ": \"" .. escaped_value .. "\"" .. (var_count < total_vars and "," or ""))
    end
    
    table.insert(js_lines, "};")
    table.insert(js_lines, "")
    table.insert(js_lines, "// ES6 Module Export")
    table.insert(js_lines, "export default __WIPPY_ENV__;")
    table.insert(js_lines, "export { __WIPPY_ENV__ };")

    local js_content = table.concat(js_lines, "\n")

    -- Set response headers
    res:set_content_type("text/javascript")
    res:set_status(http.STATUS.OK)
    res:write(js_content)
end

return {
    handler = handler
}
