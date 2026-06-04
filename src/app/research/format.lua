local llm = require("llm")
local prompt = require("prompt")
local security = require("security")

-- Final node of the research workflow: turn the agent's raw notes into a clean
-- answer with a direct llm.generate call, then push it to the user live. Runs
-- under the current security actor, so it resolves the user's relay hub itself.
local USER_HUB_PREFIX = "user."
local TOPIC = "research:answer"

local SYSTEM = [[You turn raw web-research notes into a final answer for the user.
Write 2-4 plain sentences in Markdown. Be factual and concise. Do not include a
sources list — the UI shows sources separately.]]

type Answer = {
    answer: string,
}

-- The agent node forwards its final text verbatim, so notes is a plain string.
type Params = {
    notes: string,
}

local function notify(payload: Answer)
    local actor = security.actor()
    if actor == nil then return end
    local hub_pid = process.registry.lookup(USER_HUB_PREFIX .. actor:id())
    if hub_pid ~= nil then
        process.send(hub_pid, TOPIC, payload)
    end
end

local function handler(params: Params): Answer
    local notes = params.notes

    local p = prompt.new()
    p:add_system(SYSTEM)
    p:add_user("Research notes:\n\n" .. notes)

    local answer = notes
    local resp, err = llm.generate(p, { model = "class:fast", max_tokens = 800 })
    if err == nil and resp ~= nil and resp.result ~= nil and resp.result ~= "" then
        answer = resp.result :: string
    end

    notify({ answer = answer })
    return { answer = answer }
end

return { handler = handler }
