local http = require("http")
local registry = require("registry")

local AGENT_TYPE = "agent.gen1"

local function is_agent_id(str: string): boolean
    return str:find(":", 1, true) ~= nil
end

-- Finds a gen1 agent entry by registry id ("ns:name") or by meta.name.
local function find_agent(identifier: string)
    if is_agent_id(identifier) then
        local entry, err = registry.get(identifier)
        if not entry then
            return nil, err or "Not found"
        end
        if not (entry.meta and entry.meta.type == AGENT_TYPE) then
            return nil, "Not a gen1 agent"
        end
        return entry
    end

    local entries, err = registry.find({
        [".kind"] = "registry.entry",
        ["meta.type"] = AGENT_TYPE,
        ["meta.name"] = identifier
    })
    if err or not entries or #entries == 0 then
        return nil, err or "Not found"
    end
    return entries[1]
end

-- Start prompts are declared next to `prompt` in the agent entry. The Web Host
-- renders them as text chips, so only strings are returned.
local function start_prompts_of(entry): {string}
    local prompts: {string} = {}
    local declared = entry.data and entry.data.start_prompts
    if type(declared) == "table" then
        for _, item in ipairs(declared) do
            if type(item) == "string" and item ~= "" then
                prompts[#prompts + 1] = item
            end
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

    local entry = find_agent(agent_param)
    -- A private agent is hidden from /agents/list, so it is hidden here too.
    if not entry or entry.meta.private then
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
            id = entry.id,
            name = entry.meta.name or "",
            title = entry.meta.title or entry.meta.name or "",
            start_prompts = start_prompts_of(entry)
        }
    })
end

return {
    handler = handler
}
