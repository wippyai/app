-- DEV FIXTURE — deterministic local LLM driver for the Session Forms demo.
--
-- Backs `app.session_forms_demo:fixture_agent` (model
-- `session-forms-deterministic`) and `app.session_forms_demo:plain_fixture_agent`
-- (same model, no forms trait). Makes the "Session forms" demo page
-- reproducible offline / in tests: no external model call, no network I/O,
-- same behavior every run. Never wire this provider to a production-facing
-- agent.
--
-- Behavior (the answer text it reads is built by wippy/session's
-- forms/answer_text.lua):
--   * a checkpoint-summarizer request (recognized by funcs/checkpoint.lua's
--     own system prompt, regardless of which agent's turn triggered it) ->
--     a fixed "Summary: ..." reply that never copies form ids or answer
--     values — the point of the checkpoint tests is that the Session keeps
--     form identity itself, not the summarizer.
--   * the latest message is the result of our own read_form tool call ->
--     "Form record: <tool result text>" (bounded to 1000 chars).
--   * the newest user input is a form answer (the record in a
--     <wippy-form-answers> element's record attribute) marked "late": true
--     -> a fixed notice that the answer arrived late.
--   * the newest user input is any other form answer -> "Thanks, noted:
--     <value>." for a single-field form, or "Thanks, noted: <answers JSON>"
--     for a multi-field form, read from the record.
--   * latest user text contains "ask me many" -> one tool call to
--     wippy.session.forms:ask_user_tool with a fixed 4-question "Order
--     details" form.
--   * latest user text contains "ask me" (incl. "ask me many") -> one tool
--     call to wippy.session.forms:ask_user_tool with a fixed single-choice
--     "Delivery preference" form, UNLESS the request offers no ask_user
--     tool (no forms trait, e.g. plain_fixture_agent), in which case ->
--     "I can't create forms here."
--   * latest user text contains "propose action" -> a fixed "I plan to..."
--     reply that promises to wait for confirmation.
--   * latest user text contains "work slowly" -> sleeps ~25s (cooperative,
--     does not block other processes), then replies "Done working."
--   * latest user text starts with "read form " -> one tool call to
--     wippy.session.forms:read_form_tool (alias read_form) with
--     { form_id = "<uuid>" }.
--   * a form answer (late or not) that contains "work slowly" gets its usual
--     reply after the same ~25s delay (a test hook for stopping the runtime
--     between admission and reply).
--   * latest user text contains "list forms" -> whether this prompt holds a
--     checkpoint summary, plus the Session's form index block, if any.
--   * anything else -> "Say 'ask me' to get a form."
--
-- Additionally, whenever the latest user text contains "checkpoint now",
-- the reported prompt_tokens is pushed above the fixture agent's checkpoint
-- threshold (see _index.yaml's agent_options.checkpoint on fixture_agent)
-- so the Session schedules a checkpoint — the dispatch above still decides
-- the reply content.
local json = require("json")
local time = require("time")

-- The parsed answer record (see parse_answers_block): `answers` the answered
-- questions reduced by simple_value and keyed by field id, `order` the field
-- ids in the server's order, `late` the record's late flag.
type AnswersBlock = {
    answers: {[string]: any},
    order: {string},
    late: boolean,
}

local FIXTURE_PROVIDER = "app.session_forms_demo:provider"
local ASK_USER_TOOL = "wippy.session.forms:ask_user_tool"
local READ_FORM_TOOL = "wippy.session.forms:read_form_tool"
local READ_FORM_TOOL_NAME = "read_form"
-- The element that carries the answer record in its single-quoted record
-- attribute (wippy/session's forms/answer_text.lua).
local ANSWERS_OPEN = "<wippy-form-answers record='"
local ANSWERS_CLOSE = "</wippy-form-answers>"
local READ_FORM_PREFIX = "read form"
local NO_FORMS_HERE_TEXT = "I can't create forms here."
local PROPOSE_ACTION_TEXT = "I plan to book a courier pickup. I will only do it after you confirm."
local WORK_SLOWLY_TEXT = "Done working."
local LATE_ANSWER_TEXT = "This answer arrived after the conversation moved on. Please confirm again before I act on it."
local CHECKPOINT_SUMMARY_TEXT = "Summary: deterministic Session Forms fixture checkpoint. Recent activity "
    .. "has been condensed for this test session; consult the session's own form and message records for "
    .. "exact details."
local READ_FORM_RESULT_MAX_CHARS = 1000
local CHECKPOINT_TOKENS_TRIGGER = "checkpoint now"
local LIST_FORMS_TRIGGER = "list forms"
-- Opening of wippy/session's forms/form_index.lua HEADING.
local FORM_INDEX_HEADING = "Session forms (index;"
local CHECKPOINT_ELEVATED_PROMPT_TOKENS = 6000

-- Markers unique to funcs/checkpoint.lua's own system prompt (PROMPTS.initial
-- / PROMPTS.update) — distinguishes a checkpoint-summarizer generate() call
-- (issued by the Session itself, with its own prompt, bypassing the calling
-- agent's system prompt entirely) from a normal agent turn.
local CHECKPOINT_INITIAL_MARKER = "Create comprehensive checkpoint using ALL available tokens"
local CHECKPOINT_UPDATE_MARKER = "Merge previous checkpoint with new events"

-- Fixed form: title "Delivery preference", one
-- required single-choice field `delivery` with options Courier / Pickup
-- point / Locker. Shape matches wippy.session.forms:ask_user_tool's
-- input_schema directly (title/fields are top-level tool arguments, not
-- nested under a "definition" key — see src/forms/ask_user.lua, which
-- passes its whole `params` straight to definition.normalize()).
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

-- Fixed multi-question form for "ask me many": exercises rich options
-- (value/label/description), a multi-select field with allow_other, an
-- optional single-choice field with Unicode labels, and a required
-- single-choice field with allow_other. Shape follows definition.lua's
-- rules (src/forms/definition.lua): each field is "choice" type with a
-- non-empty options list; `required`/`multiple`/`allow_other` default to
-- false when omitted.
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

local function tool_call(messages, tools, registry_id, arguments)
    local tool = find_tool(tools, registry_id)
    if not tool then
        return nil, "SESSION_FORMS_FIXTURE_TOOL_MISSING: " .. registry_id
    end
    return {
        id = next_call_id(messages),
        name = tool.name,
        registry_id = tool.registry_id,
        arguments = arguments,
    }
end

-- Recognizes a checkpoint-summarizer request: funcs/checkpoint.lua builds
-- its OWN prompt (via prompt.new():add_system(...)) for this call, so the
-- calling agent's own system prompt never appears here — only one of these
-- two fixed headers does.
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

-- Decodes the record the server wrote between the tags (spec section 13 /
-- src/forms/answer_text.lua).
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
-- quoted; nothing else from the prompt.
local function prompt_forms_report(messages)
    local index_text = nil
    local has_checkpoint = false
    for _, message in ipairs(messages or {}) do
        for _, text in ipairs(content_texts(message.content)) do
            if not index_text then
                local start = string.find(text, FORM_INDEX_HEADING, 1, true)
                if start then
                    local block = string.sub(text, start)
                    local stop = string.find(block, "\n\n", 1, true)
                    if stop then block = string.sub(block, 1, stop - 1) end
                    index_text = string.sub(block, 1, 1500)
                end
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

local function handler(contract_args)
    local messages = contract_args.messages or {}

    if is_checkpoint_summary_request(messages) then
        return finish(CHECKPOINT_SUMMARY_TEXT)
    end

    -- Answer from a read_form result anywhere after the latest user message,
    -- not only the very last message: the Session may add rows after it.
    local user_index = latest_user_index(messages) or 0
    for index = #messages, user_index + 1, -1 do
        local message = messages[index]
        if is_read_form_result(message) then
            return finish("Form record: " .. read_form_result_text(message))
        end
        if type(message) == "table" and message.role == "function_result" then
            return finish("Unexpected tool result: " .. tostring(message.name))
        end
    end

    local user_text, record_json = latest_input(messages)
    local lower = string.lower(user_text)
    local tokens = nil
    if string.find(lower, CHECKPOINT_TOKENS_TRIGGER, 1, true) then
        tokens = {
            prompt_tokens = CHECKPOINT_ELEVATED_PROMPT_TOKENS,
            completion_tokens = 1,
            total_tokens = CHECKPOINT_ELEVATED_PROMPT_TOKENS + 1,
        }
    end

    -- Test hook: an answer that contains "work slowly" (for example as an
    -- Other text) replies after the same delay as a typed "work slowly", so a
    -- test can stop the runtime after the answer is admitted but before the
    -- reply exists.
    if record_json then
        if string.find(string.lower(record_json), "work slowly", 1, true) then
            time.sleep("25s")
        end
        local parsed, err = parse_answers_block(record_json)
        if not parsed then
            return finish(err, nil, tokens)
        end
        if parsed.late then
            return finish(LATE_ANSWER_TEXT, nil, tokens)
        end
        if answers_key_count(parsed.answers) == 1 then
            local value, value_err = first_answer_value(parsed)
            if not value then
                return finish(value_err, nil, tokens)
            end
            return finish("Thanks, noted: " .. value .. ".", nil, tokens)
        end
        local answers_json = extract_answers_json(parsed) or "{}"
        return finish("Thanks, noted: " .. answers_json, nil, tokens)
    end

    if string.find(lower, "ask me many", 1, true) then
        local call = tool_call(messages, contract_args.tools, ASK_USER_TOOL, ASK_USER_MANY_ARGUMENTS)
        if not call then
            return finish(NO_FORMS_HERE_TEXT, nil, tokens)
        end
        return finish("", { call }, tokens)
    end

    if string.find(lower, "ask me", 1, true) then
        local call = tool_call(messages, contract_args.tools, ASK_USER_TOOL, ASK_USER_ARGUMENTS)
        if not call then
            return finish(NO_FORMS_HERE_TEXT, nil, tokens)
        end
        return finish("", { call }, tokens)
    end

    if string.find(lower, "propose action", 1, true) then
        return finish(PROPOSE_ACTION_TEXT, nil, tokens)
    end

    if string.find(lower, "work slowly", 1, true) then
        time.sleep("25s")
        return finish(WORK_SLOWLY_TEXT, nil, tokens)
    end

    if string.find(lower, LIST_FORMS_TRIGGER, 1, true) then
        return finish(prompt_forms_report(messages), nil, tokens)
    end

    local form_id = read_form_id(user_text)
    if form_id then
        local call, err = tool_call(messages, contract_args.tools, READ_FORM_TOOL, { form_id = form_id })
        if not call then
            return finish(err, nil, tokens)
        end
        return finish("", { call }, tokens)
    end

    return finish("Say 'ask me' to get a form.", nil, tokens)
end

return { handler = handler }
