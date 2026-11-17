-- Dev fixture tools for the two-round phrases in generate.lua. They belong to
-- the app.session_forms_demo namespace, which a release removes, and only the
-- fixture agents offer them. Do not add them to a production agent.
local time = require("time")

-- How long slow_job runs, long enough for a test to stop the runtime or press
-- Stop while the call is still running.
local SLOW_JOB_DELAY = "25s"

local function slow_job(_params: any)
    time.sleep(SLOW_JOB_DELAY)
    return { message = "The slow job is done." }
end

local function quick_job(_params: any)
    return { message = "The quick job is done." }
end

-- Returns an inline artifact, which the session stores through the generic
-- artifacts control. Nothing is written to a shared record, so every call
-- creates a new artifact.
local function make_note(_params: any)
    return {
        message = "Saved a note.",
        _control = {
            artifacts = {
                {
                    title = "Fixture note",
                    content = "A short note written by the Session Forms fixture.",
                    preview = "A short fixture note.",
                },
            },
        },
    }
end

return {
    slow_job = slow_job,
    quick_job = quick_job,
    make_note = make_note,
}
