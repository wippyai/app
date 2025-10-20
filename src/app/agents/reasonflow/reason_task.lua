-- reason_task.lua
local json = require("json")
local flow = require("flow")

local function handler(args)
    local task = args.task
    local decomposition_threshold = args.decomposition_threshold or 8.5
    local reasoning_threshold = args.reasoning_threshold or 8.0

    if not task or task == "" then
        return nil, "Task required"
    end

    return flow.create()
        :with_input({
            task = task,
            decomposition_threshold = decomposition_threshold,
            reasoning_threshold = reasoning_threshold
        })
        :as("workflow_input")
        :to("decomposition_loop")
        :to("synthesis", "workflow_input")

        :cycle({
            func_id = "app.agents.reasonflow:decomposition_cycle",
            max_iterations = 4,
            initial_state = {
                task = task,
                threshold = decomposition_threshold,
                feedback_history = {}
            },
            metadata = {title = "Decomposition Loop"}
        })
        :as("decomposition_loop")

        :map_reduce({
            source_array_key = "pieces",
            batch_size = 4,
            failure_strategy = "collect_errors",
            template = flow.template()
                :cycle({
                    func_id = "app.agents.reasonflow:reasoning_cycle",
                    max_iterations = 3,
                    initial_state = {
                        piece = {},
                        threshold = reasoning_threshold,
                        feedback_history = {}
                    },
                    metadata = {title = "Reasoning Loop"}
                }),
            metadata = {title = "Parallel Reasoning"}
        })
        :as("parallel_reasoning")
        :to("synthesis", "reasoning_results")

        :agent("app.agents.reasonflow:synthesis_agent", {
            inputs = {
                required = {"workflow_input", "reasoning_results"}
            },
            arena = {
                prompt = "Synthesize all reasoning pieces into final coherent answer. Call finish with synthesis.",
                max_iterations = 10,
            },
            metadata = {title = "Synthesis"}
        })
        :as("synthesis")
        :run()
end

return {handler = handler}