local json = require("json")
local flow = require("flow")

local function run(cycle_context)
    local iteration = cycle_context.iteration
    local state = cycle_context.state
    local last_result = cycle_context.last_result

    if last_result and last_result.approved then
        return {state = state, result = last_result, continue = false}
    end

    return flow.create()
        :with_input({
            entry_id = state.entry_id,
            content_prompt = state.content_prompt,
            min_score = state.min_score,
            post_type = state.post_type,
            feedback_history = state.feedback_history,
            iteration = iteration
        })
        :as("context")
        :to("load_plan")
        :to("load_analysis")
        :to("load_guidelines")
        :to("filter_transcripts")
        :to("writer", "context")
        :to("qa", "context")
        :to("collector", "context")

        :transform('{"categories": ["content_strategy"], "entry_types": ["content_outline"], "format": "markdown", "include_metadata": false}')
        :func("userspace.drafling.traits:view_project", {
            metadata = {title = "Load Content Plan"}
        })
        :as("load_plan")
        :to("writer", "content_plan")

        :transform('{"categories": ["analysis"], "format": "markdown", "include_metadata": false}')
        :func("userspace.drafling.traits:view_project", {
            metadata = {title = "Load Analysis"}
        })
        :as("load_analysis")
        :to("writer", "analysis")
        :to("qa", "tone_guide")

        :transform('{"categories": ["content_strategy"], "entry_types": ["content_guidelines"], "format": "markdown", "include_metadata": false}')
        :func("userspace.drafling.traits:view_project", {
            metadata = {title = "Load Guidelines"}
        })
        :as("load_guidelines")
        :to("qa", "guidelines")

        :agent("app.drafling.linkedin_v2:file_filter", {
            arena = {
                prompt = "Find all transcript_file IDs",
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
        :transform('{"upload_ids": input.file_ids}')
        :func("userspace.uploads.traits:view_files", {
            metadata = {title = "Load Transcripts"}
        })
        :as("load_transcripts")
        :to("writer", "transcripts")

        :agent("app.drafling.linkedin_v2:content_writer", {
            inputs = {required = {"context", "content_plan", "analysis", "transcripts"}},
            arena = {
                prompt = state.content_prompt .. (#state.feedback_history > 0 and "\n\nAddress QA feedback while maintaining voice authenticity." or ""),
                max_iterations = 12,
                tool_calling = "any",
                exit_schema = {
                    type = "object",
                    properties = {
                        content = {type = "string"},
                        title = {type = "string"}
                    },
                    required = {"content", "title"}
                }
            },
            metadata = {title = "Content Writer", iteration = iteration}
        })
        :as("writer")
        :to("qa", "draft")
        :to("collector", "draft")

        :agent("app.drafling.linkedin_v2:qa_agent", {
            inputs = {required = {"draft", "context", "guidelines", "tone_guide"}},
            arena = {
                prompt = string.format("Review %s. Minimum score: %.1f/10", state.post_type, state.min_score),
                max_iterations = 8,
                tool_calling = "any",
                exit_schema = {
                    type = "object",
                    properties = {
                        approved = {type = "boolean"},
                        score = {type = "number", minimum = 1, maximum = 10},
                        feedback = {type = "string"},
                        issues = {type = "array", items = {type = "string"}}
                    },
                    required = {"approved", "score", "feedback"}
                }
            },
            metadata = {title = "QA Review", iteration = iteration}
        })
        :as("qa")
        :to("collector", "assessment")

        :func("app.drafling.linkedin_v2:content_collector", {
            inputs = {required = {"context", "draft", "assessment"}},
            metadata = {title = "Update Entry"}
        })
        :as("collector")

        :run()
end

return {run = run}
