local json = require("json")

local function run(inputs)
    local context = inputs.context or {}
    local decomposition = inputs.decomposition or {}
    local assessment = inputs.assessment or {}

    local result = {
        pieces = decomposition.pieces or {},
        approved = assessment.approved,
        score = assessment.score,
        feedback = assessment.feedback,
        gaps = assessment.gaps or {}
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
            task = context.task,
            threshold = context.threshold,
            feedback_history = new_history
        },
        result = result,
        continue = not assessment.approved
    }
end

return {run = run}