local json = require("json")
local agent_registry = require("agent_registry")

local function handler(input)
    local agents, err = agent_registry.list_by_class("design_review_2")

    if err then
        return nil, "Failed to fetch design agents: " .. err
    end

    if not agents or #agents == 0 then
        return nil, "No design_review_2 agents found in registry"
    end

    local agent_list = {}
    for _, agent in ipairs(agents) do
        table.insert(agent_list, {
            id = agent.id,
            title = agent.title or agent.name,
            description = agent.description or ""
        })
    end

    return {agents = agent_list, count = #agent_list}
end

return {handler = handler}