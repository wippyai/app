local json = require("json")
local flow = require("flow")

local function run(cycle_context)
    local iteration = cycle_context.iteration
    local state = cycle_context.state
    local last_result = cycle_context.last_result
    local input = cycle_context.input

    if iteration == 1 and input then
        state.piece = input
        state.threshold = input.threshold or state.threshold
    end

    if last_result and last_result.approved then
        return { state = state, result = last_result, continue = false }
    end

    return flow.create()
        :with_input({
            piece = state.piece,
            threshold = state.threshold,
            feedback_history = state.feedback_history
        })
        :as("context")
        :to("reasoner", "reasoner_input")
        :to("qa", "qa_input")
        :to("collector", "workflow_input")

        :agent("app.agents.reasonflow:reasoning_agent", {
            inputs = {
                prompt_key = "reasoner_input"
            },
            arena = {
                prompt =
                "Reason deeply about your piece. Think through core problem, approaches, evidence, logic, constraints, and conclusion. If feedback exists, strengthen weak areas. Call finish with reasoning.",
                max_iterations = 15,
                tool_calling = "any",
                exit_schema = {
                    type = "object",
                    properties = {
                        reasoning = { type = "string" },
                        conclusion = { type = "string" },
                        evidence = { type = "array", items = { type = "string" } }
                    },
                    required = { "reasoning", "conclusion" }
                }
            },
            metadata = { title = "Reasoner", iteration = iteration }
        })
        :as("reasoner")
        :to("collector", "work")
        :to("qa", "work")

        :agent("app.agents.reasonflow:reasoning_qa_agent", {
            inputs = {
                required = { "work", "qa_input" }
            },
            arena = {
                prompt =
                "Review reasoning quality and depth. Reject shallow or incomplete reasoning. Call finish with assessment.",
                max_iterations = 8,
                tool_calling = "any",
                exit_schema = {
                    type = "object",
                    properties = {
                        approved = { type = "boolean" },
                        score = { type = "number", minimum = 1, maximum = 10 },
                        feedback = { type = "string" },
                        weaknesses = { type = "array", items = { type = "string" } }
                    },
                    required = { "approved", "score", "feedback" }
                }
            },
            metadata = { title = "QA", iteration = iteration }
        })
        :as("qa")
        :to("collector", "assessment")

        :func("app.agents.reasonflow:reasoning_collector", {
            inputs = {
                required = { "context", "work", "assessment" }
            },
            metadata = { title = "Validator" }
        })
        :as("collector")

        :run()
end

return { run = run }
