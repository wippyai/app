-- Local provider fixture. The historical LLM output library owns stream messages.
local output = require("output")
local time = require("time")

local PROVIDER_ID = "app.attention_compat:provider"
local MAX_ECHO_BYTES = 8192
local NORMAL_DELAY = "150ms"
local SLOW_DELAY = "4s"
local SLOW_WITHOUT_STREAM_DELAY = "12s"

local function content_text(content)
    if type(content) == "string" then
        return content
    end
    if type(content) ~= "table" then
        return ""
    end
    if content.type == "text" and type(content.text) == "string" then
        return content.text
    end

    local texts = {}
    for _, part in ipairs(content) do
        if type(part) == "table" and part.type == "text" and type(part.text) == "string" then
            texts[#texts + 1] = part.text
        end
    end
    return table.concat(texts, "\n")
end

local function inspect_messages(messages)
    local agent = "unknown"
    local user_text = ""
    local user_messages = 0
    local checkpoint = false
    for _, message in ipairs(messages) do
        if type(message) == "table" then
            if message.role == "system" or message.role == "developer" then
                local text = content_text(message.content)
                local marker = string.match(text, "COMPAT_AGENT=([AB])")
                if marker then
                    agent = marker
                end
                if string.find(text, "Create comprehensive checkpoint using ALL available tokens", 1, true)
                    or string.find(text, "Merge previous checkpoint with new events", 1, true) then
                    checkpoint = true
                end
            elseif message.role == "user" then
                user_messages = user_messages + 1
                user_text = content_text(message.content)
            end
        end
    end
    return agent, user_text, user_messages, checkpoint
end

local function failure(kind, message)
    return {
        success = false,
        error = kind,
        error_message = message,
        metadata = { fixture_provider = PROVIDER_ID },
    }
end

local function finish(content, agent, model, mode)
    return {
        success = true,
        result = { content = content, tool_calls = {} },
        tokens = { prompt_tokens = 1, completion_tokens = 1, total_tokens = 2 },
        finish_reason = "stop",
        metadata = {
            fixture_provider = PROVIDER_ID,
            fixture_agent = agent,
            fixture_model = model,
            fixture_mode = mode,
            synthetic_token_usage = true,
        },
    }
end

local function handler(contract_args)
    if type(contract_args) ~= "table" then
        return failure("invalid_request", "Compatibility fixture requires generator arguments.")
    end
    local model = contract_args.model
    if model ~= "attention-compat-a" and model ~= "attention-compat-b" then
        return failure("invalid_request", "Compatibility fixture requires Model A or Model B.")
    end
    local messages = type(contract_args.messages) == "table" and contract_args.messages or {}
    local agent, user_text, user_messages, checkpoint = inspect_messages(messages)

    if checkpoint then
        return finish(string.format(
            "Compatibility fixture checkpoint. Model=%s. User messages=%d. This fixture does not summarize message content.",
            model, user_messages
        ), agent, model, "checkpoint")
    end
    if #user_text > MAX_ECHO_BYTES then
        return failure("invalid_request", "Compatibility fixture echo exceeds 8192 bytes.")
    end

    local lower = string.lower(user_text)
    local slow = string.find(lower, "compat slow", 1, true) ~= nil
        or string.find(lower, "work slowly", 1, true) ~= nil
    local mode = slow and "slow" or "normal"
    local chunks = {
        string.format("COMPATIBILITY_FIXTURE\nagent=%s\nmodel=%s\nuser_messages=%d\nmode=%s\n",
            agent, model, user_messages, mode),
        "\nEcho:\n",
        user_text,
        "\nCompatibility reply complete.",
    }
    local content = table.concat(chunks)
    local stream = contract_args.stream
    if type(stream) == "table" and stream.reply_to then
        local topic = type(stream.topic) == "string" and stream.topic or nil
        local streamer, stream_err = output.streamer(tostring(stream.reply_to), topic)
        if not streamer then
            return failure("network_error", tostring(stream_err or "Compatibility stream target is unavailable."))
        end
        for index, chunk in ipairs(chunks) do
            if index > 1 then
                time.sleep(slow and SLOW_DELAY or NORMAL_DELAY)
            end
            -- Keep user text intact so a stream chunk cannot split a UTF-8 character.
            if chunk ~= "" and not streamer:send_content(chunk) then
                return failure("network_error", "Compatibility stream target is unavailable.")
            end
        end
    elseif slow then
        time.sleep(SLOW_WITHOUT_STREAM_DELAY)
    end

    -- The Session owns final persistence and completion events, as with the old providers.
    return finish(content, agent, model, mode)
end

return { handler = handler }
