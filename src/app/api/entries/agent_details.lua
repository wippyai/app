local http = require("http")
local json = require("json")
local registry = require("registry")

local function is_agent_id(str)
    return str:find(":")
end

local function get_agent_details(identifier)
    local entry, err

    if is_agent_id(identifier) then
        -- Get by ID
        entry, err = registry.get(identifier)
        if not entry then
            return nil, err or "Agent not found"
        end
    else
        -- Get by name
        local entries
        entries, err = registry.find({
            [".kind"] = "registry.entry",
            ["meta.type"] = "agent.gen1",
            ["meta.name"] = identifier
        })

        if err or not entries or #entries == 0 then
            return nil, err or "Agent not found"
        end

        entry = entries[1]
    end

    -- Validate it's a gen1 agent
    if not (entry.meta and entry.meta.type == "agent.gen1") then
        return nil, "Not a gen1 agent"
    end

    -- Extract title and start_prompts
    local result = {
        title = entry.meta.title or entry.meta.name or "Untitled Agent",
        start_prompts = (entry.data and entry.data.start_prompts) or {}
    }

    return result
end

local function handler()
    local res = http.response()
    local req = http.request()
    if not res or not req then
        return nil, "Failed to get HTTP context"
    end

    local agent_param = req:query("agent")
    if not agent_param or agent_param == "" then
        res:set_status(http.STATUS.BAD_REQUEST)
        res:set_content_type(http.CONTENT.JSON)
        res:write_json({
            success = false,
            error = "Missing 'agent' query parameter"
        })
        return
    end

    local agent_details, err = get_agent_details(agent_param)

    if not agent_details then
        res:set_status(http.STATUS.NOT_FOUND)
        res:set_content_type(http.CONTENT.JSON)
        res:write_json({
            success = false,
            error = err or "Agent not found"
        })
        return
    end

    res:set_content_type(http.CONTENT.JSON)
    res:set_status(http.STATUS.OK)
    res:write_json({
        success = true,
        agent = agent_details
    })
end

return {
    handler = handler
}
