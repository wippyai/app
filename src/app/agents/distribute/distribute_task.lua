-- distribute_task.lua
local json = require("json")
local flow = require("flow")

local function handler(args)
    local task = args.task

    if not task or task == "" then
        return nil, "Task required"
    end

    return flow.create()
        :with_input({task = task})
        :agent("app.agents.distribute:decomposer_agent", {
            arena = {
                prompt = "Break task into 2-8 independent subtasks. Each needs id, description. Call finish with tasks.",
                max_iterations = 10,
                tool_calling = "any",
                exit_schema = {
                    type = "object",
                    properties = {
                        tasks = {
                            type = "array",
                            items = {
                                type = "object",
                                properties = {
                                    id = {type = "string"},
                                    description = {type = "string"}
                                },
                                required = {"id", "description"}
                            }
                        }
                    },
                    required = {"tasks"}
                }
            }
        })
        :as("decomposition")
        :to("distribute")

        :map_reduce({
            source_array_key = "tasks",
            batch_size = 4,
            failure_strategy = "collect_errors",
            template = flow.template()
                :func("app.agents.distribute:router")
                :transform({
                    agent_id = "input.agent_id",
                    task = "input.task"
                })
                :agent("app.agents.distribute:analyst_agent", {
                    arena = {
                        prompt = "Complete assigned task. Call finish with result.",
                        max_iterations = 12,
                        tool_calling = "any",
                        exit_schema = {
                            type = "object",
                            properties = {
                                result = {type = "string"}
                            },
                            required = {"result"}
                        }
                    }
                }),
            reduction_extract = "successes"
        })
        :as("distribute")
        :to("synthesis", "results")

        :agent("app.agents.distribute:synthesis_agent", {
            arena = {
                prompt = "Synthesize all task results into final response. Call finish with synthesis.",
                max_iterations = 10,
                tool_calling = "any",
                exit_schema = {
                    type = "object",
                    properties = {
                        synthesis = {type = "string"}
                    },
                    required = {"synthesis"}
                }
            }
        })
        :as("synthesis")
        :run()
end

return {handler = handler}