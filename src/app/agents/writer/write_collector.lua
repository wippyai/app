local json = require("json")

local function run(inputs)
    local context = inputs.context or {}
    local draft = inputs.draft or {}
    local assessment = inputs.assessment or {}

    local result = {
        content = draft.content,
        title = draft.title,
        approved = assessment.approved,
        score = assessment.score,
        feedback = assessment.feedback,
        slop_detected = assessment.slop_detected or {},
        structure_issues = assessment.structure_issues or {}
    }

    local new_history = {}
    for _, fb in ipairs(context.feedback_history or {}) do
        table.insert(new_history, fb)
    end
    if not assessment.approved and assessment.feedback then
        table.insert(new_history, assessment.feedback)
    end

    return {
        state = {
            topic = context.topic,
            style = context.style,
            min_score = context.min_score,
            feedback_history = new_history,
            last_content = draft.content
        },
        result = result,
        continue = not assessment.approved
    }
end

return {run = run}