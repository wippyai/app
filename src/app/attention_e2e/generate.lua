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
    for index = #messages, 1, -1 do
        local message = messages[index]
        if message.role == "user" then
            local content = message.content
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

local function segment_identity(segment)
    if type(segment) ~= "table" or segment.kind == "omitted" then
        return nil
    end
    local kind = segment.kind or segment[1]
    local mount_id = segment.mount_id or segment[2]
    local generation = segment.generation or segment[3]
    if kind == nil or mount_id == nil or generation == nil then
        return nil
    end
    return table.concat({
        tostring(kind),
        tostring(mount_id),
        tostring(generation),
    }, "\0")
end

local function path_segment_identity(snapshot, path_index)
    local dictionary = snapshot.path_dictionary
    if type(dictionary) ~= "table" then
        return nil
    end
    local segment = dictionary[(tonumber(path_index) or -1) + 1]
    return segment_identity(segment)
end

local function compact_paths_share_prefix(snapshot, candidate_path, selection_path)
    if type(candidate_path) ~= "table" or type(selection_path) ~= "table" or #candidate_path > #selection_path then
        return false
    end
    for index, value in ipairs(candidate_path) do
        local candidate_identity = path_segment_identity(snapshot, value)
        local selection_identity = path_segment_identity(snapshot, selection_path[index])
        if not candidate_identity or candidate_identity ~= selection_identity then
            return false
        end
    end
    return true
end

local function rendered_paths_match(candidate_path, selection_path)
    if type(candidate_path) ~= "table" or type(selection_path) ~= "table"
        or #candidate_path == 0 or #selection_path == 0 then
        return false
    end

    local omitted_index = nil
    for index, segment in ipairs(selection_path) do
        if type(segment) == "table" and segment.kind == "omitted" then
            omitted_index = index
            break
        end
    end

    local leading = omitted_index and omitted_index - 1 or #selection_path
    if leading > #candidate_path then
        return false
    end
    for index = 1, leading do
        local candidate_identity = segment_identity(candidate_path[index])
        local selection_identity = segment_identity(selection_path[index])
        if not candidate_identity or candidate_identity ~= selection_identity then
            return false
        end
    end

    if not omitted_index then
        return #candidate_path == #selection_path
    end

    local trailing = #selection_path - omitted_index
    if leading + trailing > #candidate_path then
        return false
    end
    for offset = 0, trailing - 1 do
        local candidate_identity = segment_identity(candidate_path[#candidate_path - offset])
        local selection_identity = segment_identity(selection_path[#selection_path - offset])
        if not candidate_identity or candidate_identity ~= selection_identity then
            return false
        end
    end
    return true
end

local function rect_values(rect)
    if type(rect) ~= "table" then
        return nil
    end
    local x = tonumber(rect.x or rect[1])
    local y = tonumber(rect.y or rect[2])
    local width = tonumber(rect.width or rect[3])
    local height = tonumber(rect.height or rect[4])
    if not x or not y or not width or not height or width < 0 or height < 0 then
        return nil
    end
    return {
        x = x or 0,
        y = y or 0,
        width = width or 0,
        height = height or 0,
    }
end

local function selection_center(selection)
    for _, range in ipairs(selection.ranges or {}) do
        if range.coordinate_space == "host-viewport" then
            local rect = rect_values(range.rect)
            if rect then
                return rect.x + rect.width / 2, rect.y + rect.height / 2
            end
        end
    end
    return nil
end

local function rect_contains(rect, x, y)
    if not x or not y then
        return false
    end
    local values = rect_values(rect)
    if not values then
        return false
    end
    local left = tonumber(values.x) or 0
    local top = tonumber(values.y) or 0
    local right = left + (tonumber(values.width) or 0)
    local bottom = top + (tonumber(values.height) or 0)
    return x >= left and x <= right and y >= top and y <= bottom
end

local function rect_area(rect)
    local values = rect_values(rect)
    if not values then
        return math.huge
    end
    return values.width * values.height
end

local function candidate_contains_text(candidate, selected_text)
    if type(selected_text) ~= "string" or selected_text == "" then
        return false
    end
    local summary = candidate.summary or {}
    for _, key in ipairs({ "name", "text", "value" }) do
        local value = summary[key]
        if type(value) == "string"
            and (string.find(value, selected_text, 1, true)
                or string.find(selected_text, value, 1, true)) then
            return true
        end
    end
    return false
end

local function better_selection_candidate(rank, best)
    if not best then
        return true
    end
    if rank.geometry ~= best.geometry then
        return rank.geometry > best.geometry
    end
    if rank.text ~= best.text then
        return rank.text > best.text
    end
    if rank.depth ~= best.depth then
        return rank.depth > best.depth
    end
    return rank.area < best.area
end

local function selected_snapshot_selection(value)
    if type(value) ~= "table" then
        return nil
    end
    if value.state == "cleared" or value.state == "unknown" or value.collapsed == true then
        return nil
    end
    if value.state == "selected" and type(value.selection) == "table" then
        value = value.selection
    end
    if type(value.text) ~= "string" or value.text == "" or value.collapsed == true then
        return nil
    end
    return value
end

local function primary_candidate(snapshot)
    local ids = snapshot.pointer and snapshot.pointer.candidate_ids
    if type(ids) == "table" and #ids > 0 then
        local wanted = tostring(ids[1])
        local candidate = find_candidate(snapshot, function(item)
            return tostring(item.target_id) == wanted
        end)
        if candidate then
            return candidate
        end
        return nil, "ATTENTION_E2E_POINTER_CANDIDATE_MISSING: " .. wanted
    end

    local selection = selected_snapshot_selection(snapshot.selection)
    if selection then
        local best = nil
        local best_rank = nil
        local selection_x, selection_y = selection_center(selection)
        for _, candidate in ipairs(snapshot.candidates or {}) do
            local path = candidate.path_indices
            local matches = rendered_paths_match(candidate.path, selection.anchor_path)
                or rendered_paths_match(candidate.path, selection.focus_path)
                or compact_paths_share_prefix(snapshot, path, selection.anchor_path_indices)
                or compact_paths_share_prefix(snapshot, path, selection.focus_path_indices)
            if matches then
                local candidate_path = candidate.path or path or {}
                local rank = {
                    geometry = rect_contains(candidate.rect, selection_x, selection_y) and 1 or 0,
                    text = candidate_contains_text(candidate, selection.text) and 1 or 0,
                    depth = #candidate_path,
                    area = rect_area(candidate.rect),
                }
                if better_selection_candidate(rank, best_rank) then
                    best = candidate
                    best_rank = rank
                end
            end
        end
        if best then
            return best
        end
    end
    return nil, "ATTENTION_E2E_POINTER_LINK_MISSING"
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

local function handle_pointing(snapshot, require_selection)
    local candidate, err = primary_candidate(snapshot)
    if not candidate then
        return fail(err)
    end
    if type(candidate.path) ~= "table" or #candidate.path == 0 then
        return fail("ATTENTION_E2E_PATH_MISSING")
    end
    local summary = json.encode(candidate.summary or {})
    local path = json.encode(candidate.path)
    local selection_line = ""
    if require_selection then
        local selection = snapshot.selection
        if type(selection) ~= "table" or type(selection.text) ~= "string" or selection.text == "" then
            return fail("ATTENTION_E2E_SELECTION_MISSING")
        end
        selection_line = string.format("\nSELECTION_TEXT %s", selection.text)
    end
    return finish(string.format(
        "ATTENTION_E2E_TARGET %s\nSUMMARY %s\nPATH_SEGMENTS %d\nPATH %s%s",
        tostring(candidate.target_id),
        tostring(summary),
        #candidate.path,
        tostring(path),
        selection_line
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
    local candidate, candidate_err = primary_candidate(snapshot)
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

local function handle_attention_setting(messages, tools, enabled)
    local call, err = tool_call(
        messages,
        tools,
        "wippy.agent.tools:attention_context_set",
        "attention-context",
        { enabled = enabled }
    )
    if not call then
        return fail(err)
    end
    return finish("", { call })
end

local function handle_visual_capture(messages, tools, snapshot)
    local candidate, candidate_err = primary_candidate(snapshot)
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
        local attention_context = rawget(action_result, "attention_context")
        if type(attention_context) == "table" and type(attention_context.enabled) == "boolean" then
            return finish(string.format(
                "Attention context is now %s for this session at revision %s.",
                attention_context.enabled and "enabled" or "disabled",
                tostring(attention_context.revision or "unknown")
            ))
        end
        if type(action_result.status) == "string" then
            local selected = "none"
            local selected_target = rawget(action_result, "selected_target")
            if type(selected_target) == "table" then
                selected = selected_target.label
                    or selected_target.target_id
                    or selected
            end
            if action_result.status == "confirmed" and selected ~= "none" then
                return finish("I highlighted " .. tostring(selected) .. ".")
            end
            if action_result.status == "selected" and selected ~= "none" then
                return finish("You selected " .. tostring(selected) .. ".")
            end
            if action_result.status == "prepared" then
                return finish("I added the captured image to the composer for your review.")
            end
            local messages_by_status = {
                cancelled = "The on-screen request was cancelled.",
                denied = "The on-screen request was denied.",
                disconnected = "The on-screen request ended because the connection was interrupted.",
                error = "The on-screen request could not be completed.",
                expired = "The on-screen request expired before a selection was made.",
                stale = "That on-screen target is no longer available.",
                unavailable = "The on-screen request is unavailable.",
            }
            return finish(messages_by_status[action_result.status] or "The on-screen request finished.")
        end
        return finish("The on-screen request finished.")
    end

    local user_text = string.lower(latest_user_text(messages))
    if string.find(user_text, "disable attention", 1, true) then
        return handle_attention_setting(messages, contract_args.tools, false)
    end
    if string.find(user_text, "enable attention", 1, true) then
        return handle_attention_setting(messages, contract_args.tools, true)
    end
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
    return handle_pointing(snapshot, string.find(user_text, "select", 1, true) ~= nil)
end

return { handler = handler }
