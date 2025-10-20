local json = require("json")
local llm = require("llm")
local prompt = require("prompt")

local function run(task)
    if not task or not task.description then
        return nil, "Task with description required"
    end

    local p = prompt.new()
    p:add_system("You route tasks to specialized agents based on task requirements.")
    p:add_user(string.format([[Task: %s

    Route to:
    - analyst_agent: data analysis, evaluation, structured insights
    - creative_agent: design, content creation, visual concepts
    - researcher_agent: literature review, competitive scan, references
    - technical_agent: infrastructure, deployment, monitoring, CI/CD

    Select agent ID.]], task.description))

    local schema = {
        type = "object",
        properties = {
            agent_id = {
                type = "string",
                enum = {
                    "app.agents.distribute:analyst_agent",
                    "app.agents.distribute:creative_agent",
                    "app.agents.distribute:researcher_agent",
                    "app.agents.distribute:technical_agent"
                }
            }
        },
        required = { "agent_id" },
        additionalProperties = false
    }

    local result, err = llm.structured_output(schema, p, {
        model = "gpt-4o-mini",
        temperature = 0.2,
        max_tokens = 500
    })

    if err then
        return nil, "Routing LLM error: " .. err
    end

    return {
        agent_id = result.result.agent_id,
        task = task
    }
end

return {run = run}