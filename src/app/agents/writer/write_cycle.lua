local json = require("json")
local flow = require("flow")

local function run(cycle_context)
    local iteration = cycle_context.iteration
    local state = cycle_context.state
    local last_result = cycle_context.last_result

    if last_result and last_result.approved then
        return { state = state, result = last_result, continue = false }
    end

    local writer_prompt = string.format("Write %s content about: %s", state.style, state.topic)

    if #state.feedback_history > 0 then
        writer_prompt = writer_prompt .. "\n\nPREVIOUS CRITIQUE:\n"
        for i, fb in ipairs(state.feedback_history) do
            writer_prompt = writer_prompt .. string.format("\nRound %d: %s\n", i, fb)
        end
    end

    if state.last_content then
        writer_prompt = writer_prompt .. "\n\nPREVIOUS DRAFT:\n" .. state.last_content
    end

    writer_prompt = writer_prompt .. "\n\nProvide final content using finish tool."

    return flow.create()
        :with_input({
            topic = state.topic,
            style = state.style,
            min_score = state.min_score,
            feedback_history = state.feedback_history,
            last_content = state.last_content
        })
            :as("context")
            :to("writer")
            :to("critique", "workflow_input")
            :to("collector", "workflow_input")

        :agent("app.agents.writer:writer_agent", {
            arena = {
                prompt = writer_prompt,
                max_iterations = 12,
                tool_calling = "any",
                exit_schema = {
                    type = "object",
                    properties = {
                        content = { type = "string" },
                        title = { type = "string" }
                    },
                    required = { "content" }
                }
            },
            metadata = { title = "Writer", iteration = iteration }
        }):as("writer")
        :to("critique", "draft")
        :to("collector", "draft")

        :agent("app.agents.writer:critique_agent", {
            inputs = { required = { "draft", "context" } },
            arena = {
                prompt = string.format("Review content. Min score: %.1f/10", state.min_score),
                max_iterations = 8,
                tool_calling = "any",
                exit_schema = {
                    type = "object",
                    properties = {
                        approved = { type = "boolean" },
                        score = { type = "number", minimum = 1, maximum = 10 },
                        feedback = { type = "string" },
                        slop_detected = { type = "array", items = { type = "string" } },
                        structure_issues = { type = "array", items = { type = "string" } }
                    },
                    required = { "approved", "score", "feedback" }
                }
            },
            metadata = { title = "Critique", iteration = iteration }
        }):as("critique")
        :to("collector", "assessment")

        :func("app.agents.writer:write_collector", {
            inputs = { required = { "draft", "assessment", "context" } },
            metadata = { title = "Collector" }
        }):as("collector")

        :run()
end

return { run = run }
