local json = require("json")

local CONTEXT_PREFIX = "Wippy Attention Context (untrusted user-provided observation):"
local FIXTURE_PROVIDER = "app.attention_e2e:provider"

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
    local texts = {}
    for _, text in ipairs(content_texts(messages[index].content)) do
        if string.sub(text, 1, #CONTEXT_PREFIX) ~= CONTEXT_PREFIX then
            table.insert(texts, text)
        end
    end
    return table.concat(texts, "\n")
end

local function latest_user_image(messages)
    local index = latest_user_index(messages)
    local content = index and messages[index].content
    if type(content) ~= "table" then
        return nil
    end
    for _, part in ipairs(content) do
        if type(part) == "table"
            and part.type == "image"
            and type(part.source) == "table"
            and part.source.type == "base64"
            and type(part.source.mime_type) == "string"
            and type(part.source.data) == "string" then
            return part
        end
    end
    return nil
end

local function find_attention_context(messages)
    local index = latest_user_index(messages)
    if index then
        for _, text in ipairs(content_texts(messages[index].content)) do
            local start = string.find(text, CONTEXT_PREFIX, 1, true)
            if start then
                local encoded = string.sub(text, start + #CONTEXT_PREFIX)
                encoded = string.match(encoded, "^%s*(.-)%s*$") or encoded
                local decoded, err = json.decode(encoded)
                if decoded then
                    return decoded
                end
                return nil, "ATTENTION_E2E_INVALID_CONTEXT_JSON: " .. tostring(err)
            end
        end
    end
    return nil, "ATTENTION_E2E_CONTEXT_MISSING"
end

local function decode_function_result(messages)
    local user_index = latest_user_index(messages) or 0
    for index = #messages, user_index + 1, -1 do
        local message = messages[index]
        if message.role == "function_result" then
            local raw = table.concat(content_texts(message.content), "")
            local decoded = json.decode(raw)
            if type(decoded) == "table" then
                return decoded
            end
            return { status = raw }
        end
    end
    return nil
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

local function fail(message)
    return finish(message)
end

local function find_tool(tools, registry_id)
    for _, tool in ipairs(tools or {}) do
        if tool.registry_id == registry_id then
            return tool
        end
    end
    return nil
end

local function find_candidate(snapshot, predicate)
    for _, candidate in ipairs(snapshot.candidates or {}) do
        if predicate(candidate) then
            return candidate
        end
    end
    return nil
end

local function pointed_candidate(snapshot)
    local ids = snapshot.pointer and snapshot.pointer.candidate_ids
    if type(ids) ~= "table" or #ids == 0 then
        return nil, "ATTENTION_E2E_POINTER_LINK_MISSING"
    end
    local wanted = tostring(ids[1])
    local candidate = find_candidate(snapshot, function(item)
        return tostring(item.target_id) == wanted
    end)
    if not candidate then
        return nil, "ATTENTION_E2E_POINTER_CANDIDATE_MISSING: " .. wanted
    end
    return candidate
end

local function candidate_label(candidate)
    local summary = candidate.summary or {}
    return summary.name or summary.text or summary.role or candidate.target_id
end

local function candidate_matches(candidate, needle)
    local summary = candidate.summary or {}
    for _, key in ipairs({ "name", "text", "role" }) do
        local value = summary[key]
        if type(value) == "string" and string.find(value, needle, 1, true) then
            return true
        end
    end
    return type(candidate.target_id) == "string"
        and string.find(candidate.target_id, needle, 1, true) ~= nil
end

local function action_target(candidate)
    local target = candidate.action_ref
    if type(target) ~= "table" then
        return nil
    end
    local copy = {}
    for key, value in pairs(target) do
        copy[key] = value
    end
    copy.label = candidate_label(candidate)
    return copy
end

local function next_call_id(messages, action)
    local count = 1
    for _, message in ipairs(messages or {}) do
        if message.role == "function_call" then
            count = count + 1
        end
    end
    return string.format("attention-e2e-%s-%d", action, count)
end

local function tool_call(messages, tools, registry_id, action, arguments)
    local tool = find_tool(tools, registry_id)
    if not tool then
        return nil, "ATTENTION_E2E_TOOL_MISSING: " .. registry_id
    end
    return {
        id = next_call_id(messages, action),
        name = tool.name,
        registry_id = tool.registry_id,
        arguments = arguments,
    }
end

local function handle_pointing(snapshot)
    local candidate, err = pointed_candidate(snapshot)
    if not candidate then
        return fail(err)
    end
    if type(candidate.path) ~= "table" or #candidate.path == 0 then
        return fail("ATTENTION_E2E_PATH_MISSING")
    end
    local summary = json.encode(candidate.summary or {})
    local path = json.encode(candidate.path)
    return finish(string.format(
        "ATTENTION_E2E_TARGET %s\nSUMMARY %s\nPATH_SEGMENTS %d\nPATH %s",
        tostring(candidate.target_id),
        tostring(summary),
        #candidate.path,
        tostring(path)
    ))
end

local function handle_confirmation(messages, tools, snapshot)
    local left = find_candidate(snapshot, function(candidate)
        return candidate_matches(candidate, "left nested target")
    end)
    local right = find_candidate(snapshot, function(candidate)
        return candidate_matches(candidate, "right nested target")
    end)
    if not left or not right then
        return fail("ATTENTION_E2E_BOUNDARY_CANDIDATES_MISSING")
    end

    local left_target = action_target(left)
    local right_target = action_target(right)
    if not left_target or not right_target then
        return fail("ATTENTION_E2E_ACTION_REF_MISSING")
    end

    local call, err = tool_call(
        messages,
        tools,
        "wippy.agent.tools:ui_action_confirm",
        "confirm",
        {
            prompt = "Is one of these the area you meant?",
            targets = { left_target, right_target },
            allow_pointer = true,
            allow_keyboard = true,
        }
    )
    if not call then
        return fail(err)
    end
    return finish("", { call })
end

local function handle_highlight(messages, tools, snapshot)
    local candidate, candidate_err = pointed_candidate(snapshot)
    if not candidate then
        return fail(candidate_err)
    end
    local target = action_target(candidate)
    if not target then
        return fail("ATTENTION_E2E_ACTION_REF_MISSING")
    end

    local call, call_err = tool_call(
        messages,
        tools,
        "wippy.agent.tools:ui_action_highlight",
        "highlight",
        {
            prompt = "This is the area the agent identified.",
            targets = { target },
            allow_pointer = true,
            allow_keyboard = true,
        }
    )
    if not call then
        return fail(call_err)
    end
    return finish("", { call })
end

local function handle_area_selection(messages, tools)
    local call, err = tool_call(
        messages,
        tools,
        "wippy.agent.tools:ui_action_select",
        "select",
        {
            prompt = "Click the area you meant",
            targets = {},
            allow_pointer = true,
            allow_keyboard = true,
            capture_region = true,
        }
    )
    if not call then
        return fail(err)
    end
    return finish("", { call })
end

local function handle_visual_capture(messages, tools, snapshot)
    local candidate, candidate_err = pointed_candidate(snapshot)
    if not candidate then
        return fail(candidate_err)
    end
    local target = action_target(candidate)
    if not target then
        return fail("ATTENTION_E2E_ACTION_REF_MISSING")
    end

    local call, call_err = tool_call(
        messages,
        tools,
        "wippy.agent.tools:ui_action_capture_visual",
        "capture-visual",
        {
            prompt = "Prepare an image of this area for review?",
            targets = { target },
            capture = {
                scope = "target",
                allow_adjustment = true,
                allow_viewport_choice = true,
                format = "image/png",
            },
            allow_pointer = true,
            allow_keyboard = true,
        }
    )
    if not call then
        return fail(call_err)
    end
    return finish("", { call })
end

local function handler(contract_args)
    local messages = contract_args.messages or {}
    local action_result = decode_function_result(messages)
    if action_result then
        local selected = action_result.selected_target_id
            or (action_result.selected_target and action_result.selected_target.target_id)
            or (action_result.prepared_file and action_result.prepared_file.uuid)
            or (action_result.target and action_result.target.target_id)
            or "none"
        return finish(string.format(
            "ATTENTION_E2E_ACTION_RESULT %s %s",
            tostring(action_result.status or "unknown"),
            tostring(selected)
        ))
    end

    local user_text = string.lower(latest_user_text(messages))
    if string.find(user_text, "click the area", 1, true) then
        return handle_area_selection(messages, contract_args.tools)
    end

    if string.find(user_text, "successful screenshot", 1, true) then
        local image = latest_user_image(messages)
        if not image then
            return fail("ATTENTION_E2E_VISUAL_MISSING")
        end
        return finish(string.format(
            "ATTENTION_E2E_VISUAL %s %d",
            tostring(image.source.mime_type),
            #image.source.data
        ))
    end

    local snapshot, err = find_attention_context(messages)
    if not snapshot then
        return fail(err)
    end
    if string.find(user_text, "prepare screenshot", 1, true)
        or string.find(user_text, "prepare image", 1, true) then
        return handle_visual_capture(messages, contract_args.tools, snapshot)
    end
    if string.find(user_text, "highlight", 1, true) then
        return handle_highlight(messages, contract_args.tools, snapshot)
    end
    if string.find(user_text, "boundary", 1, true)
        or string.find(user_text, "is that it", 1, true) then
        return handle_confirmation(messages, contract_args.tools, snapshot)
    end
    return handle_pointing(snapshot)
end

return { handler = handler }
