local http = require("http")
local json = require("json")
local registry = require("registry")

local function split_string(str, sep)
    local fields = {}
    local pattern = string.format("([^%s]+)", sep)
    str:gsub(pattern, function(c) fields[#fields + 1] = c end)
    return fields
end

local function is_agent_id(str)
    return str:find(":")
end

local function get_agent_by_id(agent_id)
    local entry, err = registry.get(agent_id)
    if not entry then
        return nil, err
    end

    if not (entry.meta and entry.meta.type == "agent.gen1") then
        return nil, "Not a gen1 agent"
    end

    return entry.meta.title or entry.meta.name
end

local function get_agent_by_name(name)
    local entries, err = registry.find({
        [".kind"] = "registry.entry",
        ["meta.type"] = "agent.gen1",
        ["meta.name"] = name
    })

    if err or not entries or #entries == 0 then
        return nil, err or "Not found"
    end

    return entries[1].meta.title or entries[1].meta.name
end

local function handler()
    local res = http.response()
    local req = http.request()
    if not res or not req then
        return nil, "Failed to get HTTP context"
    end

    local agents_param = req:query("agents")
    if not agents_param or agents_param == "" then
        res:set_status(http.STATUS.BAD_REQUEST)
        res:set_content_type(http.CONTENT.JSON)
        res:write_json({
            success = false,
            error = "Missing 'agents' query parameter"
        })
        return
    end

    local agent_identifiers = split_string(agents_param, ",")
    local result = {}

    for _, identifier in ipairs(agent_identifiers) do
        if is_agent_id(identifier) then
            result[identifier] = get_agent_by_id(identifier)
        else
            result[identifier] = get_agent_by_name(identifier)
        end
    end

    res:set_content_type(http.CONTENT.JSON)
    res:set_status(http.STATUS.OK)
    res:write_json({
        success = true,
        agents = result
    })
end

return {
    handler = handler
}