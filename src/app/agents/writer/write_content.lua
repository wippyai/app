local json = require("json")
local flow = require("flow")

local function handler(args)
    local topic = args.topic
    local style = args.style or "engaging"
    local min_score = args.min_score or 8.0

    if not topic or topic == "" then
        return nil, "Topic required"
    end

    return flow.create()
        :with_input({topic = topic, style = style, min_score = min_score})
        :cycle({
            func_id = "app.agents.writer:write_cycle",
            max_iterations = 4,
            initial_state = {
                topic = topic,
                style = style,
                min_score = min_score,
                feedback_history = {},
                last_content = nil
            },
            metadata = {title = "Content Refinement Loop"}
        })
        :run()
end

return {handler = handler}