local json = require("json")
local flow = require("flow")

local function handler(args)
    local custom_prompt = args.custom_prompt or ""

    return flow.create()
        :with_input({
            custom_prompt = custom_prompt
        })
        :as("workflow_input")
        :to("guideline_filter")
        :to("project_overview")
        :to("file_guidelines_extractor", "original_input")
        :to("kb_guidelines_extractor", "original_input")
        :to("consolidator", "original_input")

        -- Filter for guideline files
        :agent("app.drafling.linkedin_v2:file_filter", {
            arena = {
                prompt = "Find all guideline_file IDs from source_materials category",
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
            metadata = {title = "Filter Guideline Files"}
        })
        :as("guideline_filter")
        :to("load_guideline_files"):when("len(output.file_ids) > 0")
        :to("skip_file_guidelines"):when("len(output.file_ids) == 0")

        -- Load guideline files (only if files exist)
        :transform('{"upload_ids": input.file_ids}')
        :func("userspace.uploads.traits:view_files", {
            metadata = {title = "Load Guideline Files"}
        })
        :as("load_guideline_files")
        :to("file_guidelines_extractor", "files")

        -- Skip file guidelines (no files found)
        :transform('{"message": "No guideline files found in project"}')
        :as("skip_file_guidelines")
        :to("consolidator", "file_guidelines")

        -- Get high-level project view for KB agent context
        :transform('{"categories": ["source_materials"], "format": "markdown", "include_metadata": false}')
        :func("userspace.drafling.traits:view_project", {
            metadata = {title = "Load Project Overview"}
        })
        :as("project_overview")
        :to("kb_guidelines_extractor", "project_context")

        -- Extract guidelines from files
        :agent("app.drafling.linkedin_v2:file_guidelines_extractor", {
            inputs = {required = {"files", "original_input"}},
            arena = {
                prompt = "Extract comprehensive LinkedIn posting guidelines from provided files. Focus on content structure, writing style, quality standards, and platform best practices.",
                max_iterations = 8,
                tool_calling = "auto"
            },
            metadata = {title = "File Guidelines Extractor"}
        })
        :as("file_guidelines_extractor")
        :to("consolidator", "file_guidelines")
        :error_to("consolidator", "file_guidelines")

        -- Extract guidelines from knowledge base
        :agent("app.drafling.linkedin_v2:kb_guidelines_extractor", {
            inputs = {required = {"project_context", "original_input"}},
            arena = {
                prompt = "Query knowledge bases for LinkedIn posting guidelines, Content Bible standards, and writing requirements. Search for content quality criteria, format guidelines, and best practices.",
                max_iterations = 10,
                tool_calling = "auto"
            },
            metadata = {title = "KB Guidelines Extractor"}
        })
        :as("kb_guidelines_extractor")
        :to("consolidator", "kb_guidelines")
        :error_to("consolidator", "kb_guidelines")

        -- Consolidate all guidelines
        :agent("app.drafling.linkedin_v2:guidelines_consolidator", {
            inputs = {required = {"file_guidelines", "kb_guidelines", "original_input"}},
            arena = {
                prompt = "Merge file-based and knowledge base guidelines into comprehensive content_guidelines entry. Project files take precedence. If no file guidelines provided, use KB guidelines exclusively. Create entry in content_strategy category with entry_type content_guidelines.",
                max_iterations = 8,
                tool_calling = "auto"
            },
            metadata = {title = "Guidelines Consolidator"}
        })
        :as("consolidator")

        :run()
end

return {handler = handler}
