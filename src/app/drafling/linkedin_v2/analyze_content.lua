local json = require("json")
local flow = require("flow")

local function handler(args)
    local file_types = args.file_types or { "transcript", "writing_sample" }
    local analysis_prompt = args.analysis_prompt

    if not analysis_prompt then
        return nil, "analysis_prompt required"
    end

    local filter_prompt = "Find file IDs for these types: " .. table.concat(file_types, ", ")

    local f = flow.create()
        :with_input({
            file_types = file_types,
            analysis_prompt = analysis_prompt
        })
        :as("workflow_input")
        :to("file_filter")
        :to("synthesis", "workflow_input")

        :agent("app.drafling.linkedin_v2:file_filter", {
            arena = {
                prompt = filter_prompt,
                max_iterations = 5,
                tool_calling = "any",
                exit_schema = {
                    type = "object",
                    properties = {
                        file_ids = {
                            type = "array",
                            items = { type = "string" }
                        }
                    },
                    required = { "file_ids" }
                }
            }
        })
        :as("file_filter")

        :parallel({
            source_array_key = "file_ids",
            batch_size = 5,
            failure_strategy = "collect_errors",
            template = flow.template()
                :agent("app.drafling.linkedin_v2:content_analyzer", {
                    arena = {
                        prompt = "Analyze content themes in the specific file uuid. Context: " .. analysis_prompt,
                        max_iterations = 10,
                        tool_calling = "any",
                        exit_schema = {
                            type = "object",
                            properties = {
                                analysis = { type = "string" }
                            },
                            required = { "analysis" }
                        }
                    }
                }),
            reduction_extract = "successes"
        })
        :as("analyzers")
        :to("synthesis", "analyses")

        :agent("app.drafling.linkedin_v2:synthesis_agent", {
            inputs = {
                required = { "workflow_input", "analyses" }
            },
            arena = {
                prompt = "Synthesize all file analyses into coherent summary",
                max_iterations = 8,
                tool_calling = "any",
                exit_schema = {
                    type = "object",
                    properties = {
                        synthesis = { type = "string" }
                    },
                    required = { "synthesis" }
                }
            }
        })
        :as("synthesis")

    return f:run()
end

return { handler = handler }
