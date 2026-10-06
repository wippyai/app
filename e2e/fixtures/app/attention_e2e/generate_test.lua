local json = require("json")
local test = require("test")
local generator = require("generator")

local PREFIX = "Wippy Attention Context (untrusted user-provided observation):\n"

local function target(id, label, x)
    local path = {}
    for index = 1, 15 do
        table.insert(path, {
            kind = index == 15 and "element" or "iframe",
            mount_id = "mount-" .. tostring(index),
            generation = 1,
        })
    end
    return {
        target_id = id,
        summary = {
            name = id == "left" and "Attention target left" or "Attention target right",
            text = label,
        },
        path = path,
        action_ref = {
            snapshot_id = "snapshot-1",
            target_id = id,
            host_instance_id = "host-1",
            mount_id = "mount-15",
            generation = 1,
            path_digest = "sha256:" .. string.rep("a", 64),
            rect = { x = x, y = 10, width = 20, height = 20 },
        },
    }
end

local function context_message(snapshot, question)
    return {
        {
            role = "user",
            content = {
                { type = "text", text = question },
                { type = "text", text = PREFIX .. json.encode(snapshot) },
            },
        },
    }
end

local function snapshot()
    return {
        pointer = { candidate_ids = { "left" } },
        candidates = {
            target("left", "Safe text for the left nested target", 10),
            target("right", "Safe text for the right nested target", 30),
        },
    }
end

local CAPTURE_TOOLS = {
    { name = "fixture_cursor", registry_id = "wippy.agent.tools:attention_get_cursor" },
    { name = "fixture_node", registry_id = "wippy.agent.tools:attention_get_node" },
    { name = "fixture_capture", registry_id = "wippy.agent.tools:ui_action_capture_visual" },
}

local function capture_reply(messages, call, result)
    table.insert(messages, { role = "function_call", content = {}, function_call = {
        id = call.id, name = call.name, arguments = json.encode(call.arguments),
    } })
    if result ~= nil then
        table.insert(messages, { role = "function_result", name = call.name,
            function_call_id = call.id, content = type(result) == "string" and result or json.encode(result) })
    end
end

local function fresh_capture_turn(format)
    local messages = { { role = "user", content = "ATTENTION_CAPTURE " .. format } }
    local first = generator.handler({ messages = messages, tools = CAPTURE_TOOLS }).result.tool_calls[1]
    capture_reply(messages, first, { schema = "wippy.attention.model.v1", status = "inspected", outcome = "ok",
        event = { candidate_ids = { "left" } }, mounts = { { "host-1", "mount-15", 1 } },
        nodes = { { { "ancestor", 1 } }, { { "left", 1 } } } })
    local second = generator.handler({ messages = messages, tools = CAPTURE_TOOLS }).result.tool_calls[1]
    local action = target("left", "Left", 10).action_ref
    capture_reply(messages, second, { schema = "wippy.attention.model.v1", status = "inspected", outcome = "ok",
        mounts = { { "host-1", "mount-15", 1 } }, nodes = { { { "left", 1 } } }, target_ref = action })
    local third = generator.handler({ messages = messages, tools = CAPTURE_TOOLS }).result.tool_calls[1]
    capture_reply(messages, third)
    return messages, first, second, third, action
end

local function capture_failure(messages, expected)
    local response = generator.handler({ messages = messages, tools = CAPTURE_TOOLS }).result
    test.eq(response.content, expected)
    test.eq(#(response.tool_calls or {}), 0)
end

local function define_tests()
    test.describe("attention E2E deterministic generator", function()
        test.it("answers from the explicit pointer candidate and complete path", function()
            local result = generator.handler({
                messages = context_message(snapshot(), "What am I pointing at?"),
            })
            test.is_true(result.success)
            test.contains(result.result.content, "ATTENTION_E2E_TARGET left")
            test.contains(result.result.content, "PATH_SEGMENTS 15")
            test.contains(result.result.content, "Safe text for the left nested target")
            test.eq(result.metadata.fixture_provider, "app.attention_e2e:provider")
        end)

        test.it("uses selected text to choose among matching paths when pointer linkage is absent", function()
            local value = snapshot()
            value.pointer = nil
            value.selection = {
                state = "selected",
                text = "Safe text for the right nested target",
                anchor_path = value.candidates[2].path,
                focus_path = value.candidates[2].path,
            }

            local result = generator.handler({
                messages = context_message(value, "What is selected?"),
            })

            test.is_true(result.success)
            test.contains(result.result.content, "ATTENTION_E2E_TARGET right")
            test.contains(result.result.content, "SELECTION_TEXT Safe text for the right nested target")
        end)

        test.it("uses host geometry when selection paths and text are identical", function()
            local value = snapshot()
            value.pointer = nil
            value.candidates[1].summary.text = "Shared selected text"
            value.candidates[2].summary.text = "Shared selected text"
            value.candidates[1].rect = { x = 10, y = 10, width = 20, height = 20 }
            value.candidates[2].rect = { x = 40, y = 10, width = 20, height = 20 }
            value.selection = {
                state = "selected",
                text = "Shared selected text",
                anchor_path = value.candidates[2].path,
                focus_path = value.candidates[2].path,
                ranges = {
                    {
                        coordinate_space = "host-viewport",
                        rect = { x = 45, y = 15, width = 5, height = 5 },
                    },
                },
            }

            local result = generator.handler({
                messages = context_message(value, "What is selected?"),
            })

            test.is_true(result.success)
            test.contains(result.result.content, "ATTENTION_E2E_TARGET right")
        end)

        test.it("does not reuse stale selection data from a clear tombstone", function()
            local value = snapshot()
            value.pointer = nil
            value.selection = {
                state = "cleared",
                text = "Safe text for the right nested target",
                anchor_path = value.candidates[2].path,
                focus_path = value.candidates[2].path,
            }

            local result = generator.handler({
                messages = context_message(value, "What is selected?"),
            })

            test.eq(result.result.content, "ATTENTION_E2E_POINTER_LINK_MISSING")
        end)

        test.it("proves a verified screenshot reached the provider as multimodal input", function()
            local messages = context_message(snapshot(), "What am I pointing at with a successful screenshot?")
            table.insert(messages[1].content, {
                type = "image",
                source = {
                    type = "base64",
                    mime_type = "image/png",
                    data = "cG5n",
                },
            })

            local result = generator.handler({ messages = messages })
            test.eq(result.result.content, "ATTENTION_E2E_VISUAL image/png 4")
        end)

        test.it("copies both immutable boundary action references into confirm", function()
            local result = generator.handler({
                messages = context_message(snapshot(), "Please confirm the boundary — is that it?"),
                tools = {
                    {
                        name = "ConfirmTarget",
                        registry_id = "wippy.agent.tools:ui_action_confirm",
                    },
                },
            })
            local call = result.result.tool_calls[1]
            test.eq(call.name, "ConfirmTarget")
            test.eq(call.registry_id, "wippy.agent.tools:ui_action_confirm")
            test.eq(#call.arguments.targets, 2)
            test.eq(call.arguments.targets[1].target_id, "left")
            test.eq(call.arguments.targets[2].target_id, "right")
            test.eq(call.arguments.targets[1].label, "Attention target left")
            test.eq(call.arguments.targets[2].label, "Attention target right")
        end)

        test.it("copies the pointer target into the dedicated highlight tool", function()
            local result = generator.handler({
                messages = context_message(snapshot(), "Highlight what I am pointing at"),
                tools = {
                    {
                        name = "HighlightTarget",
                        registry_id = "wippy.agent.tools:ui_action_highlight",
                    },
                },
            })
            local call = result.result.tool_calls[1]
            test.eq(result.result.content, "")
            test.eq(call.name, "HighlightTarget")
            test.eq(call.registry_id, "wippy.agent.tools:ui_action_highlight")
            test.eq(#call.arguments.targets, 1)
            test.eq(call.arguments.targets[1].target_id, "left")
            test.eq(call.arguments.targets[1].label, "Attention target left")
            test.is_true(call.arguments.allow_pointer)
            test.is_true(call.arguments.allow_keyboard)
        end)

        test.it("requests zero-target region capture for area selection", function()
            local result = generator.handler({
                messages = {
                    { role = "user", content = "Click the area I meant" },
                },
                tools = {
                    {
                        name = "SelectTarget",
                        registry_id = "wippy.agent.tools:ui_action_select",
                    },
                },
            })
            local args = result.result.tool_calls[1].arguments
            test.eq(#args.targets, 0)
            test.is_true(args.capture_region)
        end)

        test.it("returns exact action status and selected target", function()
            local result = generator.handler({
                messages = {
                    {
                        role = "function_result",
                        content = json.encode({ status = "selected", selected_target = { target_id = "right" } }),
                    },
                },
            })
            test.eq(result.result.content, "You selected right.")
        end)

        test.it("fails visibly when pointer linkage is absent", function()
            local value = snapshot()
            value.pointer = nil
            local result = generator.handler({
                messages = context_message(value, "What am I pointing at?"),
            })
            test.eq(result.result.content, "ATTENTION_E2E_POINTER_LINK_MISSING")
        end)

        test.it("never reuses attention context from an earlier user turn", function()
            local messages = context_message(snapshot(), "What am I pointing at?")
            table.insert(messages, { role = "assistant", content = "Prior answer" })
            table.insert(messages, { role = "user", content = "What am I pointing at now?" })

            local result = generator.handler({ messages = messages })
            test.eq(result.result.content, "ATTENTION_E2E_CONTEXT_MISSING")
        end)

        for _, format in ipairs({ "png", "webp", "default" }) do
            test.it("captures a fresh target with " .. format .. " and no attached context", function()
                local messages, cursor, node, capture, action = fresh_capture_turn(format)
                test.eq(cursor.name, "fixture_cursor")
                test.eq(node.registry_id, "wippy.agent.tools:attention_get_node")
                test.eq(node.arguments.node_id, "left")
                test.eq(node.arguments.scope.mount_id, "mount-15")
                test.eq(capture.name, "fixture_capture")
                test.eq(capture.arguments.targets[1].path_digest, action.path_digest)
                test.eq(capture.arguments.capture.format, format ~= "default" and "image/" .. format or nil)
                table.insert(messages, { role = "function_result", name = capture.name,
                    function_call_id = capture.id, content = json.encode({ status = "prepared" }) })
                local response = generator.handler({ messages = messages, tools = CAPTURE_TOOLS }).result
                test.eq(response.content, "I added the captured image to the composer for your review.")
                test.eq(#(response.tool_calls or {}), 0)
            end)
        end

        for _, status in ipairs({ "cancelled", "denied", "disconnected", "error", "expired", "stale", "unavailable" }) do
            test.it("finishes a matched " .. status .. " capture without another call", function()
                local messages, _, _, capture = fresh_capture_turn("webp")
                table.insert(messages, { role = "function_result", name = capture.name,
                    function_call_id = capture.id, content = json.encode({ status = status }) })
                local response = generator.handler({ messages = messages, tools = CAPTURE_TOOLS }).result
                test.eq(#(response.tool_calls or {}), 0)
                test.eq(string.find(response.content, "ATTENTION_E2E_CAPTURE_", 1, true), nil)
            end)
        end

        test.it("never reports completion before the capture terminal result", function()
            capture_failure(fresh_capture_turn("webp"), "ATTENTION_E2E_CAPTURE_RESULT_MISSING")
        end)

        test.it("never repeats a pending canonical-node lookup", function()
            local messages = fresh_capture_turn("webp")
            table.remove(messages, 6)
            table.remove(messages, 5)
            capture_failure(messages, "ATTENTION_E2E_CAPTURE_RESULT_MISSING")
        end)

        test.it("never repeats a pending cursor read", function()
            local messages = fresh_capture_turn("webp")
            while #messages > 2 do table.remove(messages) end
            capture_failure(messages, "ATTENTION_E2E_CAPTURE_RESULT_MISSING")
        end)

        test.it("requires both the tool name and call ID on a reply", function()
            for _, field in ipairs({ "name", "function_call_id" }) do
                local messages = fresh_capture_turn("webp")
                while #messages > 3 do table.remove(messages) end
                messages[3][field] = "unrelated"
                capture_failure(messages, "ATTENTION_E2E_CAPTURE_RESULT_MISSING")
            end
        end)

        test.it("ignores an unrelated result while choosing the canonical node", function()
            local messages = fresh_capture_turn("webp")
            while #messages > 3 do table.remove(messages) end
            table.insert(messages, { role = "function_result", name = "other_tool", function_call_id = "other_call",
                content = json.encode({ status = "prepared" }) })
            local response = generator.handler({ messages = messages, tools = CAPTURE_TOOLS }).result
            test.eq(response.tool_calls[1].registry_id, "wippy.agent.tools:attention_get_node")
        end)

        test.it("rejects a duplicate matched result", function()
            local messages = fresh_capture_turn("webp")
            while #messages > 3 do table.remove(messages) end
            table.insert(messages, messages[3])
            capture_failure(messages, "ATTENTION_E2E_CAPTURE_RESULT_INVALID")
        end)

        test.it("rejects pending and withdrawn cursor replies", function()
            for _, text in ipairs({ "incomplete", "STALE INFO: observation expired" }) do
                local messages = fresh_capture_turn("webp")
                while #messages > 3 do table.remove(messages) end
                messages[3].content = text
                capture_failure(messages, "ATTENTION_E2E_CAPTURE_RESULT_INVALID")
            end
        end)

        test.it("rejects an unknown capture terminal status", function()
            local messages, _, _, capture = fresh_capture_turn("webp")
            table.insert(messages, { role = "function_result", name = capture.name,
                function_call_id = capture.id, content = json.encode({ status = "pending" }) })
            capture_failure(messages, "ATTENTION_E2E_CAPTURE_RESULT_INVALID")
        end)

        test.it("rejects malformed cursor rows without throwing", function()
            local messages = fresh_capture_turn("webp")
            while #messages > 3 do table.remove(messages) end
            local cursor = json.decode(messages[3].content)
            cursor.nodes = { true }
            messages[3].content = json.encode(cursor)
            capture_failure(messages, "ATTENTION_E2E_CAPTURE_CURSOR_INVALID")
        end)

        test.it("rejects a canonical-node result from another identity", function()
            local messages = fresh_capture_turn("webp")
            table.remove(messages, 6)
            local node = json.decode(messages[5].content)
            node.nodes[1][1][1] = "different-node"
            messages[5].content = json.encode(node)
            capture_failure(messages, "ATTENTION_E2E_CAPTURE_NODE_INVALID")
        end)

        test.it("starts a new read after a later user turn", function()
            local messages = fresh_capture_turn("webp")
            table.insert(messages, { role = "user", content = "ATTENTION_CAPTURE default" })
            local response = generator.handler({ messages = messages, tools = CAPTURE_TOOLS }).result
            test.eq(response.tool_calls[1].registry_id, "wippy.agent.tools:attention_get_cursor")
        end)

        test.it("reads the cursor through the offered read tool and reports the result", function()
            local tools = { { name = "attention_get_cursor", registry_id = "wippy.agent.tools:attention_get_cursor" } }
            local messages = { { role = "user", content = "ATTENTION_READ cursor" } }
            local first = generator.handler({ messages = messages, tools = tools })
            local call = first.result.tool_calls[1]
            test.eq(call.registry_id, "wippy.agent.tools:attention_get_cursor")
            test.eq(next(call.arguments), nil)

            table.insert(messages, { role = "function_call", content = "" })
            table.insert(messages, {
                role = "function_result",
                content = json.encode({ schema = "wippy.attention.model.v1", status = "inspected", outcome = "ok" }),
            })
            local second = generator.handler({ messages = messages, tools = tools })
            test.contains(second.result.content, "ATTENTION_E2E_READ ")
            local report = json.decode(string.sub(second.result.content, #"ATTENTION_E2E_READ " + 1))
            test.eq(report.mode, "cursor")
            test.eq(report.results[1].outcome, "ok")
        end)

        test.it("chains the CSS root, first page and continuation within the read budget", function()
            local tools = {
                { name = "attention_get_tree", registry_id = "wippy.agent.tools:attention_get_tree" },
                { name = "attention_find_css", registry_id = "wippy.agent.tools:attention_find_css" },
            }
            local messages = { { role = "user", content = "ATTENTION_READ css button" } }
            local tree_call = generator.handler({ messages = messages, tools = tools }).result.tool_calls[1]
            test.eq(tree_call.registry_id, "wippy.agent.tools:attention_get_tree")

            table.insert(messages, { role = "function_call", content = "" })
            table.insert(messages, { role = "function_result", content = json.encode({
                schema = "wippy.attention.model.v1",
                status = "inspected",
                root = { "document-1", 1 },
                mounts = { { "host-1", "host:host-1", 1 } },
            }) })
            local first_page = generator.handler({ messages = messages, tools = tools }).result.tool_calls[1]
            test.eq(first_page.registry_id, "wippy.agent.tools:attention_find_css")
            test.eq(first_page.arguments.selector, "button")
            test.eq(first_page.arguments.limit, 1)
            test.eq(first_page.arguments.root.node_id, "document-1")
            test.eq(first_page.arguments.root.host_instance_id, "host-1")
            test.eq(first_page.arguments.root.mount_id, "host:host-1")
            test.eq(first_page.arguments.root.generation, 1)

            table.insert(messages, {
                role = "function_call",
                function_call = { name = "attention_find_css", arguments = json.encode(first_page.arguments) },
            })
            table.insert(messages, { role = "function_result", content = json.encode({
                schema = "wippy.attention.model.v1", status = "inspected", outcome = "partial", continuation = "page-2",
            }) })
            -- A later prompt withdraws the tree read; the root comes from the call.
            messages[3] = { role = "function_result", content = "STALE INFO: withdrawn" }
            local second_page = generator.handler({ messages = messages, tools = tools }).result.tool_calls[1]
            test.eq(second_page.arguments.continuation, "page-2")
            test.eq(second_page.arguments.root.node_id, "document-1")

            table.insert(messages, { role = "function_call", content = "" })
            table.insert(messages, { role = "function_result", content = json.encode({
                schema = "wippy.attention.model.v1", status = "inspected", outcome = "ok",
            }) })
            local answer = generator.handler({ messages = messages, tools = tools })
            test.eq(#answer.result.tool_calls, 0)
            local report = json.decode(string.sub(answer.result.content, #"ATTENTION_E2E_READ " + 1))
            test.eq(#report.results, 3)
        end)

        test.it("reports a missing read tool when Attention is not granted", function()
            local result = generator.handler({ messages = { { role = "user", content = "ATTENTION_READ cursor" } }, tools = {} })
            test.eq(result.result.content, "ATTENTION_E2E_TOOL_MISSING: wippy.agent.tools:attention_get_cursor")
        end)

        test.it("emits a forced read call that only Session authority can refuse", function()
            local result = generator.handler({ messages = { { role = "user", content = "ATTENTION_READ forced-cursor" } }, tools = {} })
            local call = result.result.tool_calls[1]
            test.eq(call.registry_id, "wippy.agent.tools:attention_get_cursor")
            test.eq(call.name, "attention_get_cursor")
        end)

        test.it("fails as a provider for the forced provider error", function()
            local result, err = generator.handler({ messages = { { role = "user", content = "ATTENTION_E2E_FORCE_PROVIDER_ERROR now" } } })
            test.is_nil(result)
            test.not_nil(err)
        end)

        test.it("answers the next message after a failed turn left its text unanswered", function()
            -- The prompt builder merges adjacent user texts with a blank line.
            local result = generator.handler({ messages = {
                { role = "user", content = {
                    { type = "text", text = "ATTENTION_E2E_FORCE_PROVIDER_ERROR for this turn\n\nVerify the session after the provider error" },
                } },
            } })
            test.eq(result.result.content, "ATTENTION_E2E_CONTEXT_MISSING")
        end)

        test.it("reports whether an unknown attachment reached the prompt", function()
            local result = generator.handler({ messages = {
                { role = "user", content = { { type = "text", text = "ATTENTION_UNKNOWN_FORWARD_COMPAT_BARRIER" } } },
            } })
            test.eq(result.result.content, "ATTENTION_E2E_PROMPT_INERT parts=1 leaked=false")
            local leaked = generator.handler({ messages = {
                { role = "user", content = {
                    { type = "text", text = "ATTENTION_KNOWN_KIND_NEWER_VERSION_BARRIER" },
                    { type = "text", text = "{\"schema\":\"wippy.attention.v99\"}" },
                } },
            } })
            test.eq(leaked.result.content, "ATTENTION_E2E_PROMPT_INERT parts=2 leaked=true")
        end)

        test.it("never replays an action result across a later user turn", function()
            local messages = {
                { role = "user", content = "Click the area I meant" },
                {
                    role = "function_result",
                    content = json.encode({ status = "selected", selected_target = { target_id = "left" } }),
                },
                { role = "user", content = "What am I pointing at now?" },
            }

            local result = generator.handler({ messages = messages })
            test.eq(result.result.content, "ATTENTION_E2E_CONTEXT_MISSING")
        end)
    end)
end

local run_cases = test.run_cases(define_tests)

local function run(options)
    return run_cases(options)
end

return { run = run }
