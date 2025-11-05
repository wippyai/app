local json = require("json")
local flow = require("flow")

local function handler(args)
    local content_prompt = args.content_prompt
    local entry_id = args.entry_id
    local max_iterations = args.max_iterations or 3
    local min_score = args.min_score or 8.0
    local post_type = args.post_type or "main_post"

    if not content_prompt or content_prompt == "" then
        return nil, "content_prompt required"
    end

    return flow.create()
        :with_input({
            entry_id = entry_id,
            content_prompt = content_prompt,
            max_iterations = max_iterations,
            min_score = min_score,
            post_type = post_type
        })
        :cycle({
            func_id = "app.drafling.linkedin_v2:content_cycle",
            max_iterations = max_iterations,
            initial_state = {
                entry_id = entry_id,
                content_prompt = content_prompt,
                min_score = min_score,
                post_type = post_type,
                feedback_history = {}
            }
        })
        :run()
end

return {handler = handler}
