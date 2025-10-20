local json = require("json")

local function run(inputs)
    local reasoner_context = inputs.reasoner_context or {}
    local qa_context = inputs.qa_context or {}
    local work = inputs.work or {}
    local assessment = inputs.assessment or {}

    local result = {
        piece = qa_context.piece,
        reasoning = work.reasoning,
        conclusion = work.conclusion,
        evidence = work.evidence or {},
        approved = assessment.approved,
        score = assessment.score,
        feedback = assessment.feedback,
        weaknesses = assessment.weaknesses or {}
    }

    local new_history = {}
    for _, fb in ipairs(reasoner_context.feedback_history or {}) do
        table.insert(new_history, fb)
    end
    if not assessment.approved and assessment.feedback then
        table.insert(new_history, assessment.feedback)
    end

    return {
        state = {
            piece = qa_context.piece,
            threshold = qa_context.threshold,
            feedback_history = new_history
        },
        result = result,
        continue = not assessment.approved
    }
end

return {run = run}