local list_agents = require("list_agents")

local PUBLIC_CLASS = "public"
local AGENTS_LIST_HEADER = "## Available Public Agents"

local function handler()
    local response = list_agents.handler({
        class = PUBLIC_CLASS,
        limit = 50
    })

    if not response.success then
        return nil, "Error loading \"" .. PUBLIC_CLASS .. "\" agents"
    end

    if response.count == 0 then
        return nil, "No \"" .. PUBLIC_CLASS .. "\" agents available"
    end

    local agent_lines = { AGENTS_LIST_HEADER }

    for _, agent in ipairs(response.agents) do
        local title = agent.title or "Untitled Agent"
        local description = agent.comment or "No description available"

        local line = "- **" .. agent.id .. "** - " .. title .. ": " .. description
        table.insert(agent_lines, line)
    end

    table.insert(agent_lines, "")
    table.insert(agent_lines, "Use the RedirectTo tool with agent_id parameter to redirect to a specific agent.")

    return table.concat(agent_lines, "\n")
end

return { handler = handler }
