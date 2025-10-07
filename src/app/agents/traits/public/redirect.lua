local registry = require("registry")

local PUBLIC_CLASS = "public"

local function handler(params)
    if not params.agent_id or type(params.agent_id) ~= "string" or params.agent_id == "" then
        return nil, "Missing agent_id parameter"
    end

    local agent_entry, err = registry.get(params.agent_id)
    if err then
        return nil, "Registry error: " .. err
    end

    if not agent_entry then
        return nil, "Agent not found: " .. params.agent_id
    end

    if not agent_entry.meta or agent_entry.meta.type ~= "agent.gen1" then
        return nil, "Invalid agent type: " .. params.agent_id
    end

    -- Check if agent has public class
    local is_public = false
    if agent_entry.meta.class then
        if type(agent_entry.meta.class) == "string" then
            is_public = agent_entry.meta.class == PUBLIC_CLASS
        elseif type(agent_entry.meta.class) == "table" then
            for _, cls in ipairs(agent_entry.meta.class) do
                if cls == PUBLIC_CLASS then
                    is_public = true
                    break
                end
            end
        end
    end

    if not is_public then
        return nil, "Agent is not public: " .. params.agent_id
    end

    -- Return control structure for redirection
    return {
        _control = {
            config = {
                agent = agent_entry.meta.name or params.agent_id
            }
        }
    }
end

return { handler = handler }
