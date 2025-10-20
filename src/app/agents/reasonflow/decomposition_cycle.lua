local json = require("json")
local flow = require("flow")

local function handler(cycle_context)
    local iteration = cycle_context.iteration
    local state = cycle_context.state
    local last_result = cycle_context.last_result
    local input = cycle_context.input

    if iteration == 1 and input then
        state.task = input.task or state.task
        state.threshold = input.decomposition_threshold or state.threshold
        state.reasoning_threshold = input.reasoning_threshold or 8.0
    end

    if last_result and last_result.approved then
        return {state = state, result = last_result, continue = false}
    end

    local task = state.task
    local threshold = state.threshold

    if not task or task == "" then
        return nil, "Task required"
    end

    return flow.create()
        :with_input({
            task = task,
            feedback_history = state.feedback_history,
            threshold = threshold
        })
        :as("context")
        :to("decomposer", "work_input")
        :to("qa", "context")
        :to("collector", "work_input")

        :agent("app.agents.reasonflow:decomposer_agent", {
            inputs = {required = {"work_input"}},
            arena = {
                prompt = "Break task into 2-8 logical pieces for independent reasoning. Each needs unique ID, clear scope, key question, dependencies. Address QA feedback if exists. Call finish with decomposition.",
                max_iterations = 12,
                tool_calling = "any",
                exit_schema = {
                    type = "object",
                    properties = {
                        pieces = {
                            type = "array",
                            items = {
                                type = "object",
                                properties = {
                                    id = {type = "string"},
                                    scope = {type = "string"},
                                    question = {type = "string"},
                                    dependencies = {type = "array", items = {type = "string"}}
                                },
                                required = {"id", "scope", "question"}
                            }
                        }
                    },
                    required = {"pieces"}
                }
            },
            metadata = {title = "Decomposer", iteration = iteration}
        })
        :as("decomposer")
        :to("qa", "decomposition")
        :to("collector", "decomposition")

        :agent("app.agents.reasonflow:decomposition_qa_agent", {
            inputs = {required = {"decomposition", "context"}},
            arena = {
                prompt = "Review decomposition completeness and logical coverage. Check all aspects covered, no gaps, pieces independent, scope clear. Be strict. Call finish with assessment.",
                max_iterations = 8,
                tool_calling = "any",
                exit_schema = {
                    type = "object",
                    properties = {
                        approved = {type = "boolean"},
                        score = {type = "number", minimum = 1, maximum = 10},
                        feedback = {type = "string"},
                        gaps = {type = "array", items = {type = "string"}}
                    },
                    required = {"approved", "score", "feedback"}
                }
            },
            metadata = {title = "QA", iteration = iteration}
        })
        :as("qa")
        :to("collector", "assessment")

        :func("app.agents.reasonflow:decomposition_collector", {
            inputs = {required = {"context", "decomposition", "assessment"}},
            metadata = {title = "Validator"}
        })
        :as("collector")

        :run()
end

return {handler = handler}