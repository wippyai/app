local json = require("json")
local flow = require("flow")

local function handler(params)
    local prompt = params.prompt

    if not prompt or prompt == "" then
        return nil, "Design prompt required"
    end

    return flow.create()
        :with_input({prompt = prompt})
        :to("fetch_agents")
        :to("consolidator", "original_prompt", "input.prompt")
        :to("decomposer", "task_prompt", "input.prompt")

        :func("app.agents.keeper_v2.design:fetch_agents", {
            metadata = {title = "Fetch Design Agents"}
        })
        :as("fetch_agents")
        :to("decomposer", "available_agents", "output.agents")

        :agent("app.agents.keeper_v2.design:decomposer_agent", {
            inputs = {required = {"task_prompt", "available_agents"}},
            arena = {
                prompt = "Analyze design request and create specialist assignments based on available agents.",
                max_iterations = 10,
                tool_calling = "any",
                exit_schema = {
                    type = "object",
                    properties = {
                        assignments = {
                            type = "array",
                            items = {
                                type = "object",
                                properties = {
                                    agent_id = {
                                        type = "string",
                                        description = "Agent ID from available_agents list"
                                    },
                                    sub_task = {
                                        type = "string",
                                        description = "Specific design task for this agent"
                                    }
                                },
                                required = {"agent_id", "sub_task"}
                            }
                        }
                    },
                    required = {"assignments"}
                }
            },
            metadata = {title = "Task Decomposition"}
        })
        :as("decomposer")
        :to("distributed_design")

        :map_reduce({
            source_array_key = "assignments",
            batch_size = 4,
            failure_strategy = "collect_errors",
            template = flow.template()
                :agent("app.agents.keeper_v2.design:pattern_matcher", {
                    input_transform = {
                        agent_id = "input.agent_id",
                        sub_task = "input.sub_task"
                    },
                    arena = {
                        prompt = "Complete assigned design sub-task. Provide specific guidance without implementation details.",
                        max_iterations = 25,
                        tool_calling = "auto"
                    },
                    metadata = {title = "Design Specialist"}
                }),
            reduction_extract = "successes",
            metadata = {title = "Distributed Design"}
        })
        :as("distributed_design")
        :to("consolidator", "design_outputs")

        :agent("app.agents.keeper_v2.design:design_consolidator", {
            inputs = {required = {"design_outputs", "original_prompt"}},
            arena = {
                prompt = "Synthesize all design outputs with original prompt context into cohesive specification.",
                max_iterations = 6,
                tool_calling = "auto"
            },
            metadata = {title = "Design Consolidation"}
        })
        :as("consolidator")

        :run()
end

return {handler = handler}