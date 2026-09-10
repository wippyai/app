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
            test.eq(result.result.content, "ATTENTION_E2E_HIGHLIGHT_REQUESTED")
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
            test.eq(result.result.content, "ATTENTION_E2E_ACTION_RESULT selected right")
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
