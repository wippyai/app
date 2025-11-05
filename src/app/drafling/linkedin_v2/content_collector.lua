local json = require("json")
local funcs = require("funcs")

local function run(inputs)
    local context = inputs.context or {}
    local draft = inputs.draft or {}
    local assessment = inputs.assessment or {}

    local entry_id = context.entry_id
    local status = assessment.approved and "approved" or "review"

    local new_history = {}
    for _, fb in ipairs(context.feedback_history or {}) do
        table.insert(new_history, fb)
    end
    if not assessment.approved and assessment.feedback then
        table.insert(new_history, assessment.feedback)
    end

    if not entry_id then
        local create_result, create_err = funcs.new():call(
            "userspace.drafling.traits:create_entry",
            {
                category = "Content Creation",
                entry_type = context.post_type,
                title = draft.title or "Untitled Post",
                content = draft.content,
                status = "Drafting"
            }
        )

        if create_err then
            return {
                state = {
                    content_prompt = context.content_prompt,
                    min_score = context.min_score,
                    post_type = context.post_type,
                    feedback_history = new_history
                },
                result = {
                    error = "Failed to create entry: " .. create_err,
                    approved = false
                },
                continue = false
            }
        end

        entry_id = create_result.entry_id
    else
        local _, update_err = funcs.new():call(
            "userspace.drafling.traits:update_entry",
            {
                entry_id = entry_id,
                title = draft.title,
                content = draft.content,
                status = status
            }
        )

        if update_err then
            return {
                state = {
                    entry_id = entry_id,
                    content_prompt = context.content_prompt,
                    min_score = context.min_score,
                    post_type = context.post_type,
                    feedback_history = new_history
                },
                result = {
                    error = "Failed to update entry: " .. update_err,
                    approved = false
                },
                continue = false
            }
        end
    end

    return {
        state = {
            entry_id = entry_id,
            content_prompt = context.content_prompt,
            min_score = context.min_score,
            post_type = context.post_type,
            feedback_history = new_history
        },
        result = {
            entry_id = entry_id,
            content = draft.content,
            title = draft.title,
            approved = assessment.approved,
            score = assessment.score,
            feedback = assessment.feedback,
            issues = assessment.issues or {}
        },
        continue = not assessment.approved
    }
end

return {run = run}
