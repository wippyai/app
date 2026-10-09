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

-- The newest text the user typed. After a failed turn the prompt builder merges
-- the unanswered user text and the new text into one part, separated by a
-- blank line, so one-shot triggers must look only at the newest paragraph.
local function latest_user_last_text(messages)
    local index = latest_user_index(messages)
    if not index then
        return ""
    end
    local last = ""
    for _, text in ipairs(content_texts(messages[index].content)) do
        if string.sub(text, 1, #CONTEXT_PREFIX) ~= CONTEXT_PREFIX then
            last = text
        end
    end
    local newest = last
    for paragraph in string.gmatch(last .. "\n\n", "(.-)\n\n") do
        if paragraph ~= "" then
            newest = paragraph
        end
    end
    return newest
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

local function capture_target(messages, tools, target, format)
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
                format = format,
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

local function handle_visual_capture(messages, tools, snapshot, format)
    local candidate, candidate_err = primary_candidate(snapshot)
    if not candidate then
        return fail(candidate_err)
    end
    local target = action_target(candidate)
    if not target then
        return fail("ATTENTION_E2E_ACTION_REF_MISSING")
    end
    return capture_target(messages, tools, target, format)
end

-- Explicit read probes. The test sends "ATTENTION_READ <mode> [argument]" and
-- reads the persisted answer "ATTENTION_E2E_READ <json>". Each call is one read
-- per batch, so a multi-step mode stays within the trait's per-turn budget.
local READ_TOOLS = {
    cursor = "attention_get_cursor",
    focus = "attention_get_focus",
    selection = "attention_get_selection",
    ["semantic-text"] = "attention_find_semantic",
    -- The needle arrives reversed so the user's own chat message never
    -- contains the private text that the search must not find.
    ["semantic-text-reversed"] = "attention_find_semantic",
    ["semantic-name"] = "attention_find_semantic",
    ["forced-cursor"] = "attention_get_cursor",
}

local function read_probe(messages)
    local text = latest_user_last_text(messages)
    local mode, argument = string.match(text, "^%s*ATTENTION_READ%s+([%w%-]+)%s*(.-)%s*$")
    return mode, argument
end

local function turn_function_results(messages)
    local user_index = latest_user_index(messages) or 0
    local results = {}
    for index = user_index + 1, #messages do
        local message = messages[index]
        if message.role == "function_result" then
            local raw = table.concat(content_texts(message.content), "")
            local decoded = json.decode(raw)
            if type(decoded) == "table" then
                table.insert(results, decoded)
            else
                table.insert(results, { raw = raw })
            end
        end
    end
    return results
end

-- Arguments of the latest call to one tool in this turn. A later prompt can
-- withdraw an earlier read result, but never the model's own call arguments.
local function previous_call_arguments(messages, name)
    local user_index = latest_user_index(messages) or 0
    local found = nil
    for index = user_index + 1, #messages do
        local call = messages[index].role == "function_call" and messages[index].function_call
        if type(call) == "table" and type(call.name) == "string" and string.find(call.name, name, 1, true) then
            local arguments = call.arguments
            if type(arguments) == "string" then
                arguments = json.decode(arguments)
            end
            if type(arguments) == "table" then
                found = arguments
            end
        end
    end
    return found
end

local function read_call(messages, tools, name, arguments, forced)
    local registry_id = "wippy.agent.tools:" .. name
    if forced then
        -- Deliberately emits a call the agent was not offered, so the Session
        -- authority check, not the provider, has to refuse it.
        return {
            id = next_call_id(messages, "read"),
            name = name,
            registry_id = registry_id,
            arguments = arguments,
        }
    end
    return tool_call(messages, tools, registry_id, "read", arguments)
end

local function capture_tool_result(messages, name)
    local start = (latest_user_index(messages) or 0) + 1
    local found, result = nil, nil
    for index = start, #messages do
        local call = messages[index].role == "function_call" and messages[index].function_call
        if type(call) == "table" and call.name == name then
            if found or type(call.id) ~= "string" or call.id == "" then
                return nil, nil, "ATTENTION_E2E_CAPTURE_CALL_INVALID"
            end
            found = call
        end
    end
    if not found then
        return nil, nil, nil
    end
    for index = start, #messages do
        local message = messages[index]
        if message.role == "function_result" and message.name == name and message.function_call_id == found.id then
            if result then
                return found, nil, "ATTENTION_E2E_CAPTURE_RESULT_INVALID"
            end
            result = json.decode(table.concat(content_texts(message.content), ""))
            if type(result) ~= "table" then
                return found, nil, "ATTENTION_E2E_CAPTURE_RESULT_INVALID"
            end
        end
    end
    if not result then
        return found, nil, "ATTENTION_E2E_CAPTURE_RESULT_MISSING"
    end
    return found, result, nil
end

local function capture_node_ref(model, node)
    local ref = type(node) == "table" and node[1]
    local mount = type(ref) == "table" and type(model.mounts) == "table" and model.mounts[ref[2]]
    if type(ref) ~= "table" or type(ref[1]) ~= "string" or ref[1] == ""
        or type(mount) ~= "table" or type(mount[1]) ~= "string" or mount[1] == ""
        or type(mount[2]) ~= "string" or mount[2] == ""
        or type(mount[3]) ~= "number" or mount[3] < 1 or mount[3] % 1 ~= 0 then
        return nil
    end
    return { node_id = ref[1], host_instance_id = mount[1], mount_id = mount[2], generation = mount[3] }
end

local function handle_fresh_visual_capture(messages, tools, format)
    local capture_tool = find_tool(tools, "wippy.agent.tools:ui_action_capture_visual")
    local cursor_tool = find_tool(tools, "wippy.agent.tools:attention_get_cursor")
    local node_tool = find_tool(tools, "wippy.agent.tools:attention_get_node")
    for _, name in ipairs({ "ui_action_capture_visual", "attention_get_cursor", "attention_get_node" }) do
        if not find_tool(tools, "wippy.agent.tools:" .. name) then
            return fail("ATTENTION_E2E_TOOL_MISSING: wippy.agent.tools:" .. name)
        end
    end
    local capture_call, capture_result, capture_err = capture_tool_result(messages, capture_tool.name)
    if capture_err then
        return fail(capture_err)
    end
    if capture_call then
        local terminal_statuses = { prepared = true, cancelled = true, denied = true, disconnected = true,
            error = true, expired = true, stale = true, unavailable = true }
        if not terminal_statuses[capture_result.status] then
            return fail("ATTENTION_E2E_CAPTURE_RESULT_INVALID")
        end
        return nil, capture_result
    end
    local cursor_call, cursor, cursor_err = capture_tool_result(messages, cursor_tool.name)
    if cursor_err then
        return fail(cursor_err)
    end
    if not cursor_call then
        local call, err = read_call(messages, tools, "attention_get_cursor", {})
        return call and finish("", { call }) or fail(err)
    end
    local node_call, node_result, node_err = capture_tool_result(messages, node_tool.name)
    if node_err then
        return fail(node_err)
    end
    if not node_call then
        local ids = type(cursor.event) == "table" and cursor.event.candidate_ids
        if cursor.schema ~= "wippy.attention.model.v1" or cursor.status ~= "inspected"
            or cursor.outcome ~= "ok" or type(ids) ~= "table" or #ids ~= 1
            or type(cursor.nodes) ~= "table" then
            return fail("ATTENTION_E2E_CAPTURE_CURSOR_INVALID")
        end
        local selected = nil
        for _, node in ipairs(cursor.nodes) do
            local ref = capture_node_ref(cursor, node)
            if not ref then
                return fail("ATTENTION_E2E_CAPTURE_CURSOR_INVALID")
            end
            if ref.node_id == ids[1] then
                if selected then
                    return fail("ATTENTION_E2E_CAPTURE_CURSOR_INVALID")
                end
                selected = ref
            end
        end
        if not selected then
            return fail("ATTENTION_E2E_CAPTURE_CURSOR_INVALID")
        end
        local call, err = read_call(messages, tools, "attention_get_node", { node_id = selected.node_id, scope = selected })
        return call and finish("", { call }) or fail(err)
    end
    local arguments = type(node_call.arguments) == "string" and json.decode(node_call.arguments) or node_call.arguments
    local scope = type(arguments) == "table" and arguments.scope
    local returned = type(node_result.nodes) == "table" and #node_result.nodes == 1 and capture_node_ref(node_result, node_result.nodes[1])
    local target = node_result.target_ref
    local rect = type(target) == "table" and target.rect
    if node_result.schema ~= "wippy.attention.model.v1" or node_result.status ~= "inspected" or node_result.outcome ~= "ok"
        or type(scope) ~= "table" or not returned or arguments.node_id ~= scope.node_id
        or returned.node_id ~= scope.node_id or returned.host_instance_id ~= scope.host_instance_id
        or returned.mount_id ~= scope.mount_id or returned.generation ~= scope.generation
        or type(target) ~= "table" or target.target_id ~= scope.node_id or target.host_instance_id ~= scope.host_instance_id
        or type(target.snapshot_id) ~= "string" or type(target.mount_id) ~= "string"
        or type(target.generation) ~= "number" or type(target.path_digest) ~= "string"
        or type(rect) ~= "table" or type(rect.x) ~= "number" or type(rect.y) ~= "number"
        or type(rect.width) ~= "number" or type(rect.height) ~= "number" then
        return fail("ATTENTION_E2E_CAPTURE_NODE_INVALID")
    end
    return capture_target(messages, tools, target, format)
end

local function root_ref(tree)
    local root = type(tree) == "table" and tree.root
    local mounts = type(tree) == "table" and tree.mounts
    if type(root) ~= "table" or type(mounts) ~= "table" then
        return nil
    end
    local mount = mounts[tonumber(root[2]) or 0]
    if type(mount) ~= "table" then
        return nil
    end
    return {
        host_instance_id = mount[1],
        node_id = root[1],
        mount_id = mount[2],
        generation = mount[3],
    }
end

local function handle_read_probe(messages, tools, mode, argument)
    local results = turn_function_results(messages)
    local function report()
        return finish("ATTENTION_E2E_READ " .. json.encode({ mode = mode, results = results }))
    end

    local call, call_err
    if mode == "css" or mode == "css-scoped" then
        local selector = argument
        local requested_root = nil
        if mode == "css-scoped" then
            local ok, payload = pcall(json.decode, argument)
            if not ok or type(payload) ~= "table"
                or type(payload.selector) ~= "string" or payload.selector == ""
                or type(payload.root) ~= "table" then
                return fail("ATTENTION_E2E_CSS_SCOPE_INVALID")
            end
            local root = payload.root
            if type(root.host_instance_id) ~= "string" or root.host_instance_id == ""
                or type(root.node_id) ~= "string" or root.node_id == ""
                or type(root.mount_id) ~= "string" or root.mount_id == ""
                or type(root.generation) ~= "number" then
                return fail("ATTENTION_E2E_CSS_SCOPE_INVALID")
            end
            selector = payload.selector
            requested_root = root
        end

        -- Resolve the requested root through the real tool before paging.
        if #results == 0 then
            call, call_err = read_call(messages, tools, "attention_get_tree", {
                scope = requested_root,
                limit = 1,
                depth = 0,
            })
        elseif #results == 1 then
            local root = root_ref(results[1])
            if not root then
                return fail("ATTENTION_E2E_CSS_ROOT_MISSING " .. json.encode(results[1]))
            end
            call, call_err = read_call(messages, tools, "attention_find_css", {
                selector = selector,
                root = root,
                limit = 1,
            })
        elseif #results == 2 and type(results[2].continuation) == "string" then
            local previous = previous_call_arguments(messages, "attention_find_css")
            local root = previous and previous.root
            if type(root) ~= "table" then
                return fail("ATTENTION_E2E_CSS_ROOT_MISSING " .. json.encode(results))
            end
            call, call_err = read_call(messages, tools, "attention_find_css", {
                selector = selector,
                root = root,
                limit = 1,
                continuation = results[2].continuation,
            })
        else
            return report()
        end
    else
        if #results > 0 then
            return report()
        end
        local name = READ_TOOLS[mode]
        if not name then
            return fail("ATTENTION_E2E_READ_MODE_UNKNOWN " .. tostring(mode))
        end
        local arguments = {}
        if mode == "semantic-text" then
            arguments = { text = argument, limit = 8 }
        elseif mode == "semantic-text-reversed" then
            arguments = { text = string.reverse(argument), limit = 8 }
        elseif mode == "semantic-name" then
            arguments = { name = argument, limit = 8 }
        end
        call, call_err = read_call(messages, tools, name, arguments, mode == "forced-cursor")
    end
    if not call then
        return fail(call_err)
    end
    return finish("", { call })
end

-- Reports what the latest user prompt contains, so a test can prove that an
-- unknown attachment kind or version stays out of the model input.
local INERT_SENTINELS = { "preserve but do not render", "wippy.attention.v99", CONTEXT_PREFIX }

local function handle_prompt_inertness(messages)
    local index = latest_user_index(messages)
    local parts = 0
    local leaked = false
    if index then
        local content = messages[index].content
        parts = type(content) == "table" and #content or 1
        for _, text in ipairs(content_texts(content)) do
            for _, sentinel in ipairs(INERT_SENTINELS) do
                if string.find(text, sentinel, 1, true) then
                    leaked = true
                end
            end
        end
    end
    return finish(string.format("ATTENTION_E2E_PROMPT_INERT parts=%d leaked=%s", parts, tostring(leaked)))
end

local function handler(contract_args)
    local messages = contract_args.messages or {}
    local probe_text = string.lower(latest_user_text(messages))
    if string.find(string.lower(latest_user_last_text(messages)), "attention_e2e_force_provider_error", 1, true) then
        -- A provider failure, not a model answer: the Session must end only
        -- this turn and admit the next message.
        return nil, errors.new({
            message = "ATTENTION_E2E_FORCED_PROVIDER_ERROR",
            kind = errors.INVALID,
            retryable = false,
        })
    end
    local read_mode, read_argument = read_probe(messages)
    if read_mode then
        return handle_read_probe(messages, contract_args.tools, read_mode, read_argument)
    end
    if string.find(probe_text, "forward_compat", 1, true)
        or string.find(probe_text, "newer_version_barrier", 1, true) then
        return handle_prompt_inertness(messages)
    end
    if string.find(probe_text, 'attention lifetime', 1, true) then
        local metrics = { compact_results = 0, stale_results = 0, automatic_contexts = 0,
            function_calls = 0, function_results = 0, result_bytes = 0 }
        for _, message in ipairs(messages) do
            if message.role == 'function_call' then metrics.function_calls = metrics.function_calls + 1 end
            if message.role == 'function_result' then metrics.function_results = metrics.function_results + 1 end
            for _, text in ipairs(content_texts(message.content)) do
                if string.find(text, CONTEXT_PREFIX, 1, true) then metrics.automatic_contexts = metrics.automatic_contexts + 1 end
                if message.role == 'function_result' then
                    metrics.result_bytes = metrics.result_bytes + #text
                    if string.find(text, 'STALE INFO:', 1, true) then metrics.stale_results = metrics.stale_results + 1 end
                    local value = json.decode(text)
                    if type(value) == 'table' and value.schema == 'wippy.attention.model.v1' then
                        metrics.compact_results = metrics.compact_results + 1
                        metrics.last_status = value.status
                        metrics.last_outcome = value.outcome
                        metrics.last_node_count = type(value.nodes) == 'table' and #value.nodes or 0
                    end
                end
            end
        end
        if string.find(probe_text, 'history', 1, true) or decode_function_result(messages) then
            return finish('ATTENTION_LIFETIME ' .. json.encode(metrics))
        end
        local call, call_err = tool_call(messages, contract_args.tools,
            'wippy.agent.tools:attention_find_semantic', 'lifetime', { name = 'Attention target right', limit = 3 })
        if not call then return fail(call_err) end
        return finish('', { call })
    end
    local capture_format = string.match(latest_user_last_text(messages), "^%s*ATTENTION_CAPTURE%s+(%a+)%s*$")
    local matched_capture_result = nil
    if capture_format then
        if capture_format ~= "webp" and capture_format ~= "png" and capture_format ~= "default" then
            return fail("ATTENTION_E2E_CAPTURE_FORMAT_INVALID")
        end
        local response, terminal = handle_fresh_visual_capture(messages, contract_args.tools,
            capture_format ~= "default" and "image/" .. capture_format or nil)
        if response then
            return response
        end
        matched_capture_result = terminal
    end
    local action_result = matched_capture_result or decode_function_result(messages)
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
        local format = string.find(user_text, "webp", 1, true) and "image/webp" or "image/png"
        return handle_visual_capture(messages, contract_args.tools, snapshot, format)
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
