-- DEV FIXTURE — deterministic local LLM driver for the Session Forms demo.
--
-- Backs `app.session_forms_demo:fixture_agent` (model
-- `session-forms-deterministic`). Makes the "Session forms" demo page's
-- second button reproducible offline / in tests: no external model call,
-- no network I/O, same behavior every run. Never wire this provider to a
-- production-facing agent.
--
-- Behavior (the answer text it reads is built by wippy/session's
-- forms/answer_text.lua):
--   * latest user text contains "ask me"            -> one tool call to
--     wippy.session.forms:ask_user_tool with a fixed "Delivery preference"
--     single-choice form definition.
--   * latest user text starts with "Answers to form" or "Late answer to
--     form" (an accepted-form answer row) -> "Thanks, noted: <value>."
--     where <value> is the first field's value from the trailing
--     "Exact answers: {...}" JSON block.
--   * anything else -> "Say 'ask me' to get a form."
local json = require("json")

local FIXTURE_PROVIDER = "app.session_forms_demo:provider"
local ASK_USER_TOOL = "wippy.session.forms:ask_user_tool"
local ANSWERS_TO_FORM_PREFIX = "Answers to form"
local LATE_ANSWER_PREFIX = "Late answer to form"
local EXACT_ANSWERS_MARKER = "Exact answers:"

-- Fixed form: title "Delivery preference", one
-- required single-choice field `delivery` with options Courier / Pickup
-- point / Locker. Shape matches wippy.session.forms:ask_user_tool's
-- input_schema directly (title/fields are top-level tool arguments, not
-- nested under a "definition" key — see src/forms/ask_user.lua, which
-- passes its whole `params` straight to definition.normalize()).
local ASK_USER_ARGUMENTS = {
    title = "Delivery preference",
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

local function latest_user_text(messages)
    local index = latest_user_index(messages)
    if not index then
        return ""
    end
    local message = messages[index]
    if not message then
        return ""
    end
    return table.concat(content_texts(message.content), "\n")
end

local function finish(content, tool_calls)
    return {
        success = true,
        result = {
            content = content,
            tool_calls = tool_calls or {},
        },
        tokens = {
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
    return string.format("session-forms-fixture-ask-user-%d", count)
end

local function ask_user_call(messages, tools)
    local tool = find_tool(tools, ASK_USER_TOOL)
    if not tool then
        return nil, "SESSION_FORMS_FIXTURE_TOOL_MISSING: " .. ASK_USER_TOOL
    end
    return {
        id = next_call_id(messages),
        name = tool.name,
        registry_id = tool.registry_id,
        arguments = ASK_USER_ARGUMENTS,
    }
end

-- Extracts the value of the *first* field from the "Exact answers:" JSON
-- block that the Session server appends to an accepted form's answer
-- message (spec section 13 / src/forms/answer_text.lua). The real text
-- fences the JSON in a backtick code block:
--   Exact answers:
--   ```json
--   {"form_id":"<id>","form_version":1,"answers":{"delivery":"Courier"}}
--   ```
-- so this scans the lines after the marker for the first one that starts
-- with "{" rather than assuming the JSON sits on the line right after the
-- marker — works whether or not a fence (or its "json" tag) is present.
--
-- "First" is read off the JSON *text* (the server writes `answers` in
-- canonical/definition order) rather than by iterating the decoded Lua
-- table, since Lua's pairs() order over a table is unspecified and would
-- make the "first" value nondeterministic whenever a form has more than
-- one field. This fixture's own form only ever has one field (`delivery`),
-- so the two approaches agree for anything this fixture itself created;
-- the textual scrape is what makes the behavior well-defined for other
-- forms' answers too.
local function first_answer_value(text)
    local marker_at = string.find(text, EXACT_ANSWERS_MARKER, 1, true)
    if not marker_at then
        return nil, "SESSION_FORMS_FIXTURE_ANSWERS_BLOCK_MISSING"
    end

    local after = string.sub(text, marker_at + #EXACT_ANSWERS_MARKER)
    local json_text
    for line in string.gmatch(after, "[^\r\n]+") do
        local trimmed = string.match(line, "^%s*(.-)%s*$") or line
        if string.sub(trimmed, 1, 1) == "{" then
            json_text = trimmed
            break
        end
    end
    if not json_text then
        return nil, "SESSION_FORMS_FIXTURE_ANSWERS_JSON_MISSING"
    end

    local decoded, decode_err = json.decode(json_text)
    if not decoded or type(decoded.answers) ~= "table" then
        return nil, "SESSION_FORMS_FIXTURE_ANSWERS_JSON_INVALID: " .. tostring(decode_err)
    end

    local first_key = string.match(json_text, '"answers"%s*:%s*{%s*"([%w_]+)"')
    local value = first_key and decoded.answers[first_key]
    if value == nil then
        -- No textual match (e.g. an empty answers object) — fall back to
        -- whatever the decoded table yields first.
        for _, candidate in pairs(decoded.answers) do
            value = candidate
            break
        end
    end
    if value == nil then
        return nil, "SESSION_FORMS_FIXTURE_ANSWERS_EMPTY"
    end

    if type(value) == "string" then
        return value
    end
    if type(value) == "table" and type(value.other) == "string" then
        return value.other
    end
    if type(value) == "table" then
        local parts = {}
        for _, item in ipairs(value) do
            table.insert(parts, tostring(item))
        end
        return table.concat(parts, ", ")
    end
    return tostring(value)
end

local function is_form_answer(user_text)
    return string.sub(user_text, 1, #ANSWERS_TO_FORM_PREFIX) == ANSWERS_TO_FORM_PREFIX
        or string.sub(user_text, 1, #LATE_ANSWER_PREFIX) == LATE_ANSWER_PREFIX
end

local function handler(contract_args)
    local messages = contract_args.messages or {}
    local user_text = latest_user_text(messages)

    if is_form_answer(user_text) then
        local value, err = first_answer_value(user_text)
        if not value then
            return finish(err or "Say 'ask me' to get a form.")
        end
        return finish("Thanks, noted: " .. value .. ".")
    end

    if string.find(string.lower(user_text), "ask me", 1, true) then
        local call, err = ask_user_call(messages, contract_args.tools)
        if not call then
            return finish(err)
        end
        return finish("", { call })
    end

    return finish("Say 'ask me' to get a form.")
end

return { handler = handler }
