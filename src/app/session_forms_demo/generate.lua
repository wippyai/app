-- Dev fixture: a scripted model for the Session Forms demo and e2e tests. It
-- makes no network calls and replies the same way every run. Do not wire it to
-- a production agent. The README lists the phrases it reacts to.
local json = require("json")
local time = require("time")

type AnswersBlock = {
    answers: {[string]: any},
    order: {string},
    late: boolean,
}

local FIXTURE_PROVIDER = "app.session_forms_demo:provider"
local ASK_USER_TOOL = "wippy.session.forms:ask_user_tool"
local READ_FORM_TOOL = "wippy.session.forms:read_form_tool"
local READ_FORM_TOOL_NAME = "read_form"
-- The fixture tools in jobs.lua. Their names are the llm_alias values in _index.yaml.
local SLOW_JOB_TOOL = "app.session_forms_demo:slow_job_tool"
local QUICK_JOB_TOOL = "app.session_forms_demo:quick_job_tool"
local NOTE_TOOL = "app.session_forms_demo:note_tool"
local SLOW_JOB_TOOL_NAME = "slow_job"
local QUICK_JOB_TOOL_NAME = "quick_job"
local NOTE_TOOL_NAME = "make_note"
-- Must match the element that wippy/session's forms/answer_text.lua writes,
-- with the record in a single-quoted attribute.
local ANSWERS_OPEN = "<wippy-form-answers record='"
local ANSWERS_CLOSE = "</wippy-form-answers>"
local READ_FORM_PREFIX = "read form"
local NO_FORMS_HERE_TEXT = "I can't create forms here."
local NO_JOBS_HERE_TEXT = "I can't run jobs here."
local PROPOSE_ACTION_TEXT = "I plan to book a courier pickup. I will only do it after you confirm."
local WORK_SLOWLY_TEXT = "Done working."
local SLOW_JOB_START_TEXT = "Starting the slow job."
local SLOW_JOB_DONE_TEXT = "Slow job finished."
local FAIL_START_TEXT = "Starting the quick job."
local LIMIT_START_TEXT = "Starting the quick job again."
local QUICK_JOB_DONE_TEXT = "Quick job finished."
local PROVIDER_FAILURE_TEXT = "Session Forms fixture: scripted provider failure after the quick job."
local LATE_ANSWER_TEXT = "This answer arrived after the conversation moved on. Please confirm again before I act on it."
local CHECKPOINT_SUMMARY_TEXT = "Summary: deterministic Session Forms fixture checkpoint. Recent activity "
    .. "has been condensed for this test session; consult the session's own form and message records for "
    .. "exact details."
local READ_FORM_RESULT_MAX_CHARS = 1000
local CHECKPOINT_TOKENS_TRIGGER = "checkpoint now"
local LIST_FORMS_TRIGGER = "list forms"
-- Must match the opening of HEADING in wippy/session's forms/form_index.lua.
local FORM_INDEX_HEADING = "Session forms (index;"
-- Above the token_threshold of 5000 on the fixture agents in _index.yaml.
local CHECKPOINT_ELEVATED_PROMPT_TOKENS = 6000
-- How long "work slowly" waits before it replies, long enough for a test to
-- stop the runtime first.
local SLOW_DELAY = "25s"

-- Must match phrases in the system prompts in wippy/session's
-- funcs/checkpoint.lua (PROMPTS.initial and PROMPTS.update). The token budget
-- that follows "in at most" changes with the model window, so the initial
-- marker stops before it.
local CHECKPOINT_INITIAL_MARKER = "Create comprehensive checkpoint in at most"
local CHECKPOINT_UPDATE_MARKER = "Merge previous checkpoint with new events"

-- Two-round phrases. The first model round writes text and calls a fixture
-- tool; the round after the tool result is scripted by the same phrase.
local PHRASE_SLOW_TOOL = "slow tool"
local PHRASE_FAIL_AFTER_TEXT = "fail after text"
local PHRASE_LIMIT_AFTER_TEXT = "limit after text"
local PHRASE_ARTIFACT_AND_ASK = "artifact and ask"

-- "ask me": one required single-choice question.
local ASK_USER_ARGUMENTS = {
    title = "Delivery preference",
    answered_message = "Answered a question about delivery.",
    fields = {
        {
            id = "delivery",
            type = "choice",
            label = "How should the parcel be delivered?",
            required = true,
            options = { "Courier", "Pickup point", "Locker" },
        },
    },
}

-- "ask me many": object options, multiple, allow_other, Unicode labels, and a
-- required question with allow_other.
local ASK_USER_MANY_ARGUMENTS = {
    title = "Order details",
    answered_message = "Answered questions about my order.",
    fields = {
        {
            id = "delivery",
            type = "choice",
            label = "How should the parcel be delivered?",
            required = true,
            options = {
                { value = "courier", label = "Courier", description = "A courier drops it at your door." },
                { value = "pickup_point", label = "Pickup point", description = "Collect it from a nearby pickup point." },
                { value = "locker", label = "Locker", description = "Collect it from a self-service locker." },
            },
        },
        {
            id = "extras",
            type = "choice",
            label = "Any extras for this order?",
            multiple = true,
            allow_other = true,
            options = {
                { value = "gift_wrap", label = "Gift wrap" },
                { value = "insurance", label = "Insurance" },
                { value = "express_handling", label = "Express handling" },
            },
        },
        {
            id = "when",
            type = "choice",
            label = "When works best for delivery?",
            options = {
                { value = "cafe_morning", label = "Café ☕ morning" },
                { value = "gogo_afternoon", label = "午後 afternoon" },
                { value = "evening", label = "Évening 🌙" },
            },
        },
        {
            id = "contact",
            type = "choice",
            label = "How should we contact you?",
            required = true,
            allow_other = true,
            options = {
                { value = "email", label = "Email" },
                { value = "phone", label = "Phone" },
            },
        },
    },
}

local function content_texts(content)
    if type(content) == "string" then
        return { content }
    end
    if type(content) ~= "table" then
        return {}
    end

    local texts = {}
    for _, part in ipairs(content) do
        if type(part) == "string" then
            table.insert(texts, part)
        elseif type(part) == "table" then
            local text = part.text or part.content
            if type(text) == "string" then
                table.insert(texts, text)
            end
        end
    end
    return texts
end

local function latest_user_index(messages)
    for index = #messages, 1, -1 do
        if messages[index].role == "user" then
            return index
        end
    end
    return nil
end

local function last_find(text: string, needle: string, before: integer?): integer?
    local found = nil
    local search_from = 1
    while true do
        local at = string.find(text, needle, search_from, true)
        if not at or (before and at >= before) then break end
        found = at
        search_from = at + 1
    end
    return found
end

-- The newest input of the latest user message: its text, plus the answer
-- record's JSON when that input is a form answer. wippy/llm merges
-- consecutive user messages into one text joined by a blank line, so after
-- an interrupted turn the prompt ends with the unanswered request followed by
-- a form answer. The last record is the newest input unless text was typed
-- after it.
local function latest_input(messages): (string, string?)
    local index = latest_user_index(messages)
    if not index then
        return "", nil
    end
    local message = messages[index]
    if not message then
        return "", nil
    end
    local text = table.concat(content_texts(message.content), "\n")
    local close_at = last_find(text, ANSWERS_CLOSE)
    if not close_at then
        return text, nil
    end
    local after = string.sub(text, close_at + #ANSWERS_CLOSE)
    if string.find(after, "%S") then
        return (string.gsub(after, "^%s+", "")), nil
    end
    local open_at = last_find(text, ANSWERS_OPEN, close_at)
    if not open_at then
        return text, nil
    end
    -- The server escapes "'" inside the record, so the first one ends it.
    local value_end = string.find(text, "'", open_at + #ANSWERS_OPEN, true)
    if not value_end or value_end > close_at then
        return text, nil
    end
    return text, string.sub(text, open_at + #ANSWERS_OPEN, value_end - 1)
end

local function finish(content: string, tool_calls: {any}?, tokens: any?): any
    return {
        success = true,
        result = {
            content = content,
            tool_calls = tool_calls or {},
        },
        tokens = tokens or {
            prompt_tokens = 1,
            completion_tokens = 1,
            total_tokens = 2,
        },
        finish_reason = tool_calls and #tool_calls > 0 and "tool_call" or "stop",
        metadata = {
            fixture_provider = FIXTURE_PROVIDER,
        },
    }
end

local function find_tool(tools, registry_id)
    for _, tool in ipairs(tools or {}) do
        if tool.registry_id == registry_id then
            return tool
        end
    end
    return nil
end

local function next_call_id(messages)
    local count = 1
    for _, message in ipairs(messages or {}) do
        if message.role == "function_call" then
            count = count + 1
        end
    end
    return string.format("session-forms-fixture-call-%d", count)
end

-- id_suffix tells apart two calls of one round, which share next_call_id.
local function tool_call(messages, tools, registry_id, arguments, id_suffix)
    local tool = find_tool(tools, registry_id)
    if not tool then
        return nil, "SESSION_FORMS_FIXTURE_TOOL_MISSING: " .. registry_id
    end
    return {
        id = next_call_id(messages) .. (id_suffix or ""),
        name = tool.name,
        registry_id = tool.registry_id,
        arguments = arguments,
    }
end

-- A checkpoint summary request carries one of two fixed system prompts from
-- wippy/session's funcs/checkpoint.lua, never the agent's own prompt.
local function is_checkpoint_summary_request(messages)
    for _, message in ipairs(messages or {}) do
        if message.role == "system" then
            for _, text in ipairs(content_texts(message.content)) do
                if string.find(text, CHECKPOINT_INITIAL_MARKER, 1, true)
                    or string.find(text, CHECKPOINT_UPDATE_MARKER, 1, true) then
                    return true
                end
            end
        end
    end
    return false
end

local function is_read_form_result(message)
    if type(message) ~= "table" or message.role ~= "function_result" then
        return false
    end
    local name = message.name or message.tool_name or message.function_name
    return name == READ_FORM_TOOL_NAME
end

local function function_result_name(message)
    if type(message) ~= "table" or message.role ~= "function_result" then
        return nil
    end
    return message.name or message.tool_name or message.function_name
end

local JOB_PHRASES = { PHRASE_SLOW_TOOL, PHRASE_FAIL_AFTER_TEXT, PHRASE_LIMIT_AFTER_TEXT, PHRASE_ARTIFACT_AND_ASK }

-- The two-round phrase that `lower` (lowercased text) holds, or nil.
local function job_phrase(lower: string): string?
    for _, phrase in ipairs(JOB_PHRASES) do
        if string.find(lower, phrase, 1, true) then
            return phrase
        end
    end
    return nil
end

local function read_form_result_text(message)
    local text = table.concat(content_texts(message.content), "\n")
    if #text > READ_FORM_RESULT_MAX_CHARS then
        text = string.sub(text, 1, READ_FORM_RESULT_MAX_CHARS)
    end
    return text
end

-- "read form <uuid>" -> the uuid, or nil when the text doesn't start with
-- that phrase (case-insensitive, arbitrary leading/trailing whitespace).
local function read_form_id(user_text)
    local lower = string.lower(user_text)
    local _, prefix_end = string.find(lower, "^%s*" .. READ_FORM_PREFIX .. "%s+")
    if not prefix_end then
        return nil
    end
    local after = string.sub(user_text, prefix_end + 1)
    return string.match(after, "^(%S+)")
end

-- One answer from the server's record, reduced to what the fixture echoes:
-- the option value, "value (note: …)", {other = …}, or a list of those; nil
-- for a question left unanswered.
local function simple_value(answer: any): any
    if type(answer) ~= "table" then return nil end
    if answer.other ~= nil then return { other = answer.other } end
    if answer.value ~= nil then
        return type(answer.note) == "string" and (answer.value .. " (note: " .. answer.note .. ")") or answer.value
    end
    local list = {}
    for _, item in ipairs(answer) do table.insert(list, simple_value(item)) end
    return list
end

-- Decodes the record that wippy/session's forms/answer_text.lua writes.
local function parse_answers_block(json_text: string): (AnswersBlock?, string?)
    local decoded, decode_err = json.decode(json_text)
    if type(decoded) ~= "table" or type(decoded.answers) ~= "table" then
        return nil, "SESSION_FORMS_FIXTURE_ANSWERS_JSON_INVALID: " .. tostring(decode_err)
    end

    -- The record holds {question, answer} per question id; the fixture only
    -- needs the answers, in the order the server wrote them.
    local order: {string} = {}
    for id in string.gmatch(json_text, '"([%w_]+)":{"question"') do table.insert(order, id) end
    local answers: {[string]: any} = {}
    for id, entry in pairs(decoded.answers) do
        local value = type(entry) == "table" and simple_value(entry.answer) or nil
        if value ~= nil then answers[id] = value end
    end
    return { answers = answers, order = order, late = decoded.late == true }, nil
end

local function answers_key_count(answers: {[string]: any}): number
    local count = 0
    for _ in pairs(answers) do
        count = count + 1
    end
    return count
end

-- The first answered question's value as text, in the server's order.
local function first_answer_value(parsed: AnswersBlock): (string?, string?)
    local value = nil
    for _, id in ipairs(parsed.order) do
        if parsed.answers[id] ~= nil then value = parsed.answers[id]; break end
    end
    if value == nil then
        return nil, "SESSION_FORMS_FIXTURE_ANSWERS_EMPTY"
    end
    local function item_text(item: any): string
        if type(item) ~= "table" then return tostring(item) end
        if type(item.other) == "string" then return item.other end
        local parts = {}
        for _, part in ipairs(item) do table.insert(parts, item_text(part)) end
        return table.concat(parts, ", ")
    end
    return item_text(value)
end

-- Compact `{"id":value,...}` of the answered questions in the server's order
-- (encoded key by key: pairs() order over a Lua table is unspecified).
local function extract_answers_json(parsed: AnswersBlock): string?
    local parts = {}
    for _, id in ipairs(parsed.order) do
        if parsed.answers[id] ~= nil then
            table.insert(parts, (json.encode(id)) .. ":" .. (json.encode(parsed.answers[id])))
        end
    end
    return "{" .. table.concat(parts, ",") .. "}"
end

-- "list forms": reports what this turn's prompt says about session forms,
-- so a visible test can check the form index after a checkpoint. Only the
-- Session's own index block and the presence of a checkpoint summary are
-- quoted; nothing else from the prompt. The Session adds its current index
-- after the history, and earlier "list forms" replies in the history quote
-- older copies, so the last occurrence is the current one.
local function prompt_forms_report(messages)
    local index_text = nil
    local has_checkpoint = false
    for _, message in ipairs(messages or {}) do
        for _, text in ipairs(content_texts(message.content)) do
            local start = string.find(text, FORM_INDEX_HEADING, 1, true)
            if start then
                local block = string.sub(text, start)
                local stop = string.find(block, "\n\n", 1, true)
                if stop then block = string.sub(block, 1, stop - 1) end
                index_text = string.sub(block, 1, 1500)
            end
            if string.find(text, CHECKPOINT_SUMMARY_TEXT, 1, true) then
                has_checkpoint = true
            end
        end
    end
    local checkpoint_line = has_checkpoint and "Checkpoint summary: present." or "Checkpoint summary: absent."
    if not index_text then
        return checkpoint_line .. "\nNo form index in my prompt."
    end
    return checkpoint_line .. "\n" .. index_text
end

-- Sleeps without blocking other processes.
local function work_slowly()
    time.sleep(SLOW_DELAY)
end

local function handler(contract_args)
    local messages = contract_args.messages or {}

    if is_checkpoint_summary_request(messages) then
        return finish(CHECKPOINT_SUMMARY_TEXT)
    end

    -- Answer from a read_form result anywhere after the latest user message,
    -- not only the very last message: the Session may add rows after it.
    local user_index = latest_user_index(messages) or 0
    local job_result_name = nil
    for index = #messages, user_index + 1, -1 do
        local message = messages[index]
        if is_read_form_result(message) then
            return finish("Form record: " .. read_form_result_text(message))
        end
        local name = function_result_name(message)
        if name == SLOW_JOB_TOOL_NAME or name == QUICK_JOB_TOOL_NAME then
            -- The newest job result decides the reply.
            job_result_name = job_result_name or name
        elseif type(message) == "table" and message.role == "function_result" then
            return finish("Unexpected tool result: " .. tostring(message.name))
        end
    end

    local user_text, record_json = latest_input(messages)
    local lower = string.lower(user_text)
    local tokens: any? = nil
    if string.find(lower, CHECKPOINT_TOKENS_TRIGGER, 1, true) then
        tokens = {
            prompt_tokens = CHECKPOINT_ELEVATED_PROMPT_TOKENS,
            completion_tokens = 1,
            total_tokens = CHECKPOINT_ELEVATED_PROMPT_TOKENS + 1,
        }
    end

    local function reply(content: string, tool_calls: {any}?): any
        return finish(content, tool_calls, tokens)
    end

    local function ask_form(arguments)
        local call = tool_call(messages, contract_args.tools, ASK_USER_TOOL, arguments)
        if not call then
            return reply(NO_FORMS_HERE_TEXT)
        end
        return reply("", { call })
    end

    -- Round one of a two-round phrase: text, then a call to a fixture tool.
    local function job_round(text: string, registry_id: string, arguments: any): any
        local call = tool_call(messages, contract_args.tools, registry_id, arguments)
        if not call then
            return reply(NO_JOBS_HERE_TEXT)
        end
        return reply(text, { call })
    end

    local function start_job(phrase: string): any
        if phrase == PHRASE_SLOW_TOOL then
            return job_round(SLOW_JOB_START_TEXT, SLOW_JOB_TOOL, { job = "slow" })
        end
        if phrase == PHRASE_FAIL_AFTER_TEXT then
            return job_round(FAIL_START_TEXT, QUICK_JOB_TOOL, { job = "fail" })
        end
        if phrase == PHRASE_LIMIT_AFTER_TEXT then
            return job_round(LIMIT_START_TEXT, QUICK_JOB_TOOL, { job = "limit" })
        end
        -- PHRASE_ARTIFACT_AND_ASK: an inline artifact and a form in one round.
        local note = tool_call(messages, contract_args.tools, NOTE_TOOL, { topic = "fixture" }, "-note")
        local ask = tool_call(messages, contract_args.tools, ASK_USER_TOOL, ASK_USER_ARGUMENTS, "-ask")
        if not note or not ask then
            return reply(NO_JOBS_HERE_TEXT)
        end
        return reply("", { note, ask })
    end

    -- The round after a job tool's result. The phrase is read from the answer
    -- record when the turn was started by a form answer, as in the first round.
    if job_result_name then
        local trigger = record_json and string.lower(record_json) or lower
        if job_result_name == QUICK_JOB_TOOL_NAME and job_phrase(trigger) == PHRASE_FAIL_AFTER_TEXT then
            return nil, errors.new({ kind = errors.INVALID, retryable = false, message = PROVIDER_FAILURE_TEXT })
        end
        return reply(job_result_name == SLOW_JOB_TOOL_NAME and SLOW_JOB_DONE_TEXT or QUICK_JOB_DONE_TEXT)
    end

    -- An answer that contains "work slowly" (for example as an Other text)
    -- gets the same delay as the typed phrase, so a test can stop the runtime
    -- after the answer is admitted and before the reply exists.
    if record_json then
        if string.find(string.lower(record_json), "work slowly", 1, true) then
            work_slowly()
        end
        local parsed, err = parse_answers_block(record_json)
        if not parsed then
            return reply(err)
        end
        if parsed.late then
            return reply(LATE_ANSWER_TEXT)
        end
        -- The other phrases script the model round the same way when typed or
        -- sent as an Other text. A late answer keeps its late reply.
        local answer_phrase = job_phrase(string.lower(record_json))
        if answer_phrase then
            return start_job(answer_phrase)
        end
        if answers_key_count(parsed.answers) == 1 then
            local value, value_err = first_answer_value(parsed)
            if not value then
                return reply(value_err)
            end
            return reply("Thanks, noted: " .. value .. ".")
        end
        local answers_json = extract_answers_json(parsed) or "{}"
        return reply("Thanks, noted: " .. answers_json)
    end

    local typed_phrase = job_phrase(lower)
    if typed_phrase then
        return start_job(typed_phrase)
    end

    if string.find(lower, "ask me many", 1, true) then
        return ask_form(ASK_USER_MANY_ARGUMENTS)
    end

    if string.find(lower, "ask me", 1, true) then
        return ask_form(ASK_USER_ARGUMENTS)
    end

    if string.find(lower, "propose action", 1, true) then
        return reply(PROPOSE_ACTION_TEXT)
    end

    if string.find(lower, "work slowly", 1, true) then
        work_slowly()
        return reply(WORK_SLOWLY_TEXT)
    end

    if string.find(lower, LIST_FORMS_TRIGGER, 1, true) then
        return reply(prompt_forms_report(messages))
    end

    local form_id = read_form_id(user_text)
    if form_id then
        local call, err = tool_call(messages, contract_args.tools, READ_FORM_TOOL, { form_id = form_id })
        if not call then
            return reply(err)
        end
        return reply("", { call })
    end

    return reply("Say 'ask me' to get a form.")
end

return { handler = handler }
