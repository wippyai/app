local json = require("json")
local flow = require("flow")

local function handler(args)
    local custom_prompt = args.custom_prompt or ""

    return flow.create()
        :with_input({custom_prompt = custom_prompt})
        :as("workflow_input")
        :to("file_filter")

        -- Filter writing sample files
        :agent("app.drafling.linkedin_v2:file_filter", {
            arena = {
                prompt = "Find all writing_sample_file IDs from source_materials",
                max_iterations = 5,
                tool_calling = "any",
                exit_schema = {
                    type = "object",
                    properties = {
                        file_ids = {
                            type = "array",
                            items = {type = "string"}
                        }
                    },
                    required = {"file_ids"}
                }
            },
            metadata = {title = "Filter Writing Samples"}
        })
        :as("file_filter")
        :transform('{"upload_ids": input.file_ids}')
        :func("userspace.uploads.traits:view_files", {
            metadata = {title = "Load Writing Sample Content"}
        })
        :as("file_content")
        :to("gpt_analyzer", "files")
        :to("claude_analyzer", "files")
        :to("consolidator", "original_input")

        -- GPT analyzer
        :agent("app.drafling.linkedin_v2:tone_analyzer", {
            inputs = {required = {"files"}},
            model = "gpt-5",
            arena = {
                prompt = "Analyze writing samples for tone and voice patterns. " .. custom_prompt,
                max_iterations = 10,
                tool_calling = "auto"
            },
            metadata = {title = "GPT Tone Analysis"}
        })
        :as("gpt_analyzer")
        :to("consolidator", "gpt_analysis")
        :error_to("consolidator", "gpt_analysis")

        -- Claude analyzer
        :agent("app.drafling.linkedin_v2:tone_analyzer", {
            inputs = {required = {"files"}},
            model = "claude-4-5-sonnet",
            arena = {
                prompt = "Analyze writing samples for tone and voice patterns. " .. custom_prompt,
                max_iterations = 10,
                tool_calling = "auto"
            },
            metadata = {title = "Claude Tone Analysis"}
        })
        :as("claude_analyzer")
        :to("consolidator", "claude_analysis")
        :error_to("consolidator", "claude_analysis")

        -- Consolidate
        :agent("app.drafling.linkedin_v2:tone_consolidator", {
            inputs = {required = {"gpt_analysis", "claude_analysis", "original_input"}},
            arena = {
                prompt = "Merge both tone analyses into unified voice guide. Create entry in analysis category with entry_type tone_guide.",
                max_iterations = 8,
                tool_calling = "auto"
            },
            metadata = {title = "Consolidate Tone"}
        })
        :as("consolidator")

        :run()
end

return {handler = handler}
