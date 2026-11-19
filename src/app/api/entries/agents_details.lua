local http = require("http")
local agent_registry = require("agent_registry")

-- Finds a gen1 agent by registry id ("ns:name") or by meta.name.
local function find_agent(identifier: string)
    if identifier:find(":", 1, true) then
        return agent_registry.get_by_id(identifier)
    end
    return agent_registry.get_by_name(identifier)
end

-- The Web Host renders start prompts as text chips, so only strings are returned.
local function start_prompts_of(spec): {string}
    local prompts: {string} = {}
    for _, item in ipairs(spec.start_prompts) do
        if type(item) == "string" and item ~= "" then
            prompts[#prompts + 1] = item
        end
    end
    return prompts
end

local function handler()
    local res = http.response()
    local req = http.request()
    if not res or not req then
        return nil, "Failed to get HTTP context"
    end

    res:set_content_type(http.CONTENT.JSON)

    local agent_param = req:query("agent")
    if not agent_param or agent_param == "" then
        res:set_status(http.STATUS.BAD_REQUEST)
        res:write_json({
            success = false,
            error = "Missing 'agent' query parameter"
        })
        return
    end

    local spec = find_agent(agent_param)
    -- A private agent is hidden from /agents/list, so it is hidden here too.
    if not spec or spec.meta.private then
        res:set_status(http.STATUS.NOT_FOUND)
        res:write_json({
            success = false,
            error = "Agent not found"
        })
        return
    end

    res:set_status(http.STATUS.OK)
    res:write_json({
        success = true,
        agent = {
            id = spec.id,
            name = spec.name,
            title = spec.meta.title or spec.name,
            start_prompts = start_prompts_of(spec)
        }
    })
end

return {
    handler = handler
}