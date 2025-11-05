local json = require("json")
local flow = require("flow")

local function handler(args)
    local custom_prompt = args.custom_prompt or ""

    return flow.create()
        :with_input({custom_prompt = custom_prompt})
        :as("workflow_input")
        :to("load_analysis")
        :to("load_guidelines")
        :to("filter_transcripts")
        :to("consolidator", "original_input")

        -- Load analysis (clusters, tone)
        :transform('{"categories": ["analysis"], "format": "markdown", "include_metadata": false}')
        :func("userspace.drafling.traits:view_project", {
            metadata = {title = "Load Analysis"}
        })
        :as("load_analysis")
        :to("gpt_planner", "analysis")
        :to("claude_planner", "analysis")

        -- Load guidelines
        :transform('{"categories": ["content_strategy"], "entry_types": ["content_guidelines"], "format": "markdown", "include_metadata": false}')
        :func("userspace.drafling.traits:view_project", {
            metadata = {title = "Load Guidelines"}
        })
        :as("load_guidelines")
        :to("gpt_planner", "strategy")
        :to("claude_planner", "strategy")

        -- Filter transcripts
        :agent("app.drafling.linkedin_v2:file_filter", {
            arena = {
                prompt = "Find all transcript_file IDs from source_materials",
                max_iterations = 5,
                tool_calling = "any",
                exit_schema = {
                    type = "object",
                    properties = {
                        file_ids = {type = "array", items = {type = "string"}}
                    },
                    required = {"file_ids"}
                }
            },
            metadata = {title = "Filter Transcripts"}
        })
        :as("filter_transcripts")
        :to("load_transcripts")

        -- Load transcripts
        :transform('{"upload_ids": input.file_ids}')
        :func("userspace.uploads.traits:view_files", {
            metadata = {title = "Load Transcripts"}
        })
        :as("load_transcripts")
        :to("gpt_planner", "transcripts")
        :to("claude_planner", "transcripts")

        -- GPT planner
        :agent("app.drafling.linkedin_v2:content_planner", {
            inputs = {required = {"analysis", "strategy", "transcripts"}},
            model = "gpt-5",
            arena = {
                prompt = "Create content plan using provided context. " .. custom_prompt,
                max_iterations = 10,
                tool_calling = "auto"
            },
            metadata = {title = "GPT Content Planning"}
        })
        :as("gpt_planner")
        :to("consolidator", "gpt_plan")
        :error_to("consolidator", "gpt_plan")

        -- Claude planner
        :agent("app.drafling.linkedin_v2:content_planner", {
            inputs = {required = {"analysis", "strategy", "transcripts"}},
            model = "claude-4-5-sonnet",
            arena = {
                prompt = "Create content plan using provided context. " .. custom_prompt,
                max_iterations = 10,
                tool_calling = "auto"
            },
            metadata = {title = "Claude Content Planning"}
        })
        :as("claude_planner")
        :to("consolidator", "claude_plan")
        :error_to("consolidator", "claude_plan")

        -- Consolidate
        :agent("app.drafling.linkedin_v2:planning_consolidator", {
            inputs = {required = {"gpt_plan", "claude_plan", "original_input"}},
            arena = {
                prompt = "Merge both content plans into unified outline. Create entry in content_strategy category with entry_type content_outline.",
                max_iterations = 8,
                tool_calling = "auto"
            },
            metadata = {title = "Consolidate Plans"}
        })
        :as("consolidator")

        :run()
end

return {handler = handler}
