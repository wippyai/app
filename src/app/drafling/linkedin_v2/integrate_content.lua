-- integrate_content.lua
local json = require("json")
local flow = require("flow")

local function handler(args)
    local file_ids = args.file_ids

    if not file_ids or #file_ids == 0 then
        return nil, "file_ids required"
    end

    local result = flow.create()
        :with_input({files = file_ids})

        :parallel({
            source_array_key = "files",
            batch_size = 25,
            failure_strategy = "collect_errors",
            template = flow.template()
                :agent("app.drafling.linkedin_v2:file_classifier", {
                    arena = {
                        prompt = "Classify file and create source_materials entry",
                        max_iterations = 8,
                        tool_calling = "any",
                        exit_schema = {
                            type = "object",
                            properties = {
                                file_id = {type = "string"},
                                file_type = {
                                    type = "string",
                                    enum = {"transcript", "writing_sample", "guideline", "reference"}
                                },
                                summary = {type = "string"},
                                entry_created = {type = "boolean"}
                            },
                            required = {"file_id", "file_type", "summary", "entry_created"}
                        }
                    }
                }),
            reduction_extract = "successes"
        })

        :run()

    if not result then
        return nil, "Classification failed"
    end

    return result
end

return {handler = handler}
