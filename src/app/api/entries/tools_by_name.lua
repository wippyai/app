local http = require("http")
local registry = require("registry")
local tools = require("tools")

local function split_string(str: string, sep: string): {string}
    local fields: {string} = {}
    local pattern = string.format("([^%s]+)", sep)
    str:gsub(pattern, function(c) fields[#fields + 1] = c end)
    return fields
end

local function handler()
    local res = http.response()
    local req = http.request()
    if not res or not req then
        return nil, "Failed to get HTTP context"
    end

    local tools_param = req:query("tools")
    if not tools_param or tools_param == "" then
        res:set_status(http.STATUS.BAD_REQUEST)
        res:set_content_type(http.CONTENT.JSON)
        res:write_json({
            success = false,
            error = "Missing 'tools' query parameter. Expected comma-separated list of tool names."
        })
        return
    end

    local entries, err = registry.find({
        [".kind"] = "function.*",
        ["meta.type"] = "tool"
    })
    if err then
        res:set_status(http.STATUS.INTERNAL_ERROR)
        res:set_content_type(http.CONTENT.JSON)
        res:write_json({ success = false, error = tostring(err) })
        return
    end

    -- A tool call carries the name the model used: meta.llm_alias, or the
    -- sanitized id name when there is no alias. The registry id also matches.
    local by_name = {}
    for _, entry in ipairs(entries or {}) do
        local llm_name = tools.get_tool_name(entry)
        local found = {
            name = llm_name,
            title = (entry.meta and entry.meta.title) or llm_name
        }
        if by_name[llm_name] == nil then
            by_name[llm_name] = found
        end
        by_name[entry.id] = found
    end

    -- Unknown names are left out. The Web Host then shows the raw name.
    local result = {}
    for _, name in ipairs(split_string(tools_param, ",")) do
        if by_name[name] then
            result[name] = by_name[name]
        end
    end

    res:set_content_type(http.CONTENT.JSON)
    res:set_status(http.STATUS.OK)
    res:write_json({
        success = true,
        tools = result
    })
end

return {
    handler = handler
}
