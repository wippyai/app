local json = require("json")
local llm = require("llm")
local prompt = require("prompt")
local agent_registry = require("agent_registry")

local function handler(input)
    local task = input.task

    if not task or task == "" then
        return nil, "Task required"
    end

    local agents, err = agent_registry.list_by_class("dev_specialist_v2")
    if err then
        return nil, "Failed to fetch dev specialists: " .. err
    end

    if not agents or #agents == 0 then
        return nil, "No dev_specialist_v2 agents found"
    end

    local agent_options = {}
    for _, agent in ipairs(agents) do
        local meta = agent.meta or {}
        local context_agent_id = meta.context_agent_id

        if not context_agent_id then
            goto continue
        end

        table.insert(agent_options, {
            id = agent.id,
            title = agent.title or agent.name,
            comment = meta.comment or "",
            context_agent_id = context_agent_id,
        })

        ::continue::
    end

    if #agent_options == 0 then
        return nil, "No dev specialists with context_agent_id found"
    end

    local p = prompt.new()
    p:add_system([[Select development specialist based on task description.

Available specialists:]])

    for _, opt in ipairs(agent_options) do
        p:add_system(string.format("\n- %s\n  %s",
            opt.id,
            opt.comment
        ))

        print(string.format("Specialist: %s - %s", opt.id, opt.comment))
    end

    p:add_user(string.format("Task: %s\n\nSelect dev_agent_id.", task))

    local agent_enum = {}
    for _, opt in ipairs(agent_options) do
        table.insert(agent_enum, opt.id)
    end

    local schema = {
        type = "object",
        properties = {
            dev_agent_id = {
                type = "string",
                enum = agent_enum
            },
            reasoning = {
                type = "string"
            }
        },
        required = {"dev_agent_id", "reasoning"},
        additionalProperties = false
    }

    local result, llm_err = llm.structured_output(schema, p, {
        model = "gpt-5-nano",
        temperature = 0.2,
        max_tokens = 1500
    })

    if llm_err then
        return nil, "Router error: " .. llm_err
    end

    local selected_id = result.result.dev_agent_id
    local context_agent_id = nil

    for _, opt in ipairs(agent_options) do
        if opt.id == selected_id then
            context_agent_id = opt.context_agent_id
            break
        end
    end

    return {
        dev_agent_id = selected_id,
        context_agent_id = context_agent_id,
        reasoning = result.result.reasoning
    }
end

return {handler = handler}