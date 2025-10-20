local json = require("json")
local flow = require("flow")
local ctx = require("ctx")

local function handler(args)
    local task = args.task

    if not task or task == "" then
        return nil, "Task required"
    end

    if not ctx.get("overlay_branch") then
        return nil, "Working branch not set."
    end

    return flow.create()
        :with_input({ task = task })
        :to("router")
        :to("context", "task", "input.task")
        :to("dev", "task", "input.task")

        :func("keeper.agents.keeper_v2.develop:router", {
            metadata = { title = "Specialist Router" }
        })
        :as("router")
        :to("context", "routing")
        :to("dev", "routing")
        :error_to("@fail")

        :agent("", {
            inputs = { required = { "task", "routing" } },
            input_transform = {
                agent_id = "inputs.routing.context_agent_id",
                task = "inputs.task"
            },
            arena = {
                prompt = "Find relevant examples and API docs for the given task.",
                max_iterations = 25
            },
            metadata = { title = "Context Gatherer" }
        })
        :as("context")
        :to("dev", "gathered_context")
        :error_to("@fail")

        :agent("", {
            inputs = { required = { "task", "gathered_context", "routing" } },
            input_transform = {
                agent_id = "inputs.routing.dev_agent_id",
                task = "inputs.task",
                gathered_context = "inputs.gathered_context"
            },
            arena = {
                prompt = "Implement the given task using the provided context.",
                max_iterations = 8
            },
            metadata = { title = "Developer" }
        })
        :as("dev")
        :error_to("@fail")

        :run()
end

return { handler = handler }
