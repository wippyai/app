-- Dev fixture: a scripted model for the tool approval demo and e2e tests. It
-- makes no network calls and replies the same way every run. Do not wire it to
-- a production agent. The README lists the phrases it reacts to.
--
-- The script is chosen by the newest user message, and the step by the number
-- of tool results that follow that message. A phrase may end with `#<tag>`: the
-- tag is added to the record names, so one test can tell its calls from the
-- calls of another test that shares a database.
local json = require("json")

local FIXTURE_PROVIDER = "app.tool_approval_demo:provider"

-- The fixture tools in tools.lua. The registry ids are the entries in _index.yaml.
local DELETE_RECORD_TOOL = "app.tool_approval_demo:delete_record_tool"
local SEND_INVOICE_TOOL = "app.tool_approval_demo:send_invoice_tool"
local WIRE_FUNDS_TOOL = "app.tool_approval_demo:wire_funds_tool"
local LOOKUP_RECORD_TOOL = "app.tool_approval_demo:lookup_record_tool"
local WRITE_AUDIT_TOOL = "app.tool_approval_demo:write_audit_tool"
local MAKE_FORGER_TOOL = "app.tool_approval_demo:make_forger_tool"
local FAIL_RECORD_TOOL = "app.tool_approval_demo:fail_record_tool"
local SLOW_RECORD_TOOL = "app.tool_approval_demo:slow_record_tool"
local BIG_RESULT_TOOL = "app.tool_approval_demo:big_result_tool"
local MASKED_EMAIL_TOOL = "app.tool_approval_demo:masked_email_tool"
local SENSITIVE_RESULT_TOOL = "app.tool_approval_demo:sensitive_result_tool"
local EMPTY_RESULT_TOOL = "app.tool_approval_demo:empty_result_tool"
local PRIVATE_DETAILS_TOOL = "app.tool_approval_demo:private_details_tool"
local HIDDEN_RESULT_TOOL = "app.tool_approval_demo:hidden_result_tool"
local TEXT_RESULT_TOOL = "app.tool_approval_demo:text_result_tool"
-- The delegate tool of an agent is named by its `delegates` entry.
local DELEGATE_TOOL_NAME = "ask_analyst"

-- One call a script wants: a fixture tool by registry ID, or the delegate tool.
type Wanted = {
    tool: string?,
    delegate: boolean?,
    arguments: any,
}

local NO_TOOLS_HERE_TEXT = "I can't run that here."
local DEFAULT_TAG = "t0"

local function content_texts(content: any): {string}
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

local function latest_user_index(messages: {any}): number?
    for index = #messages, 1, -1 do
        if messages[index].role == "user" then
            return index
        end
    end
    return nil
end

local function finish(content: string, tool_calls: {any}?): any
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

local function find_tool(tools: {any}?, registry_id: string): any
    for _, tool in ipairs(tools or {}) do
        if tool.registry_id == registry_id then
            return tool
        end
    end
    return nil
end

local function find_tool_by_name(tools: {any}?, name: string): any
    for _, tool in ipairs(tools or {}) do
        if tool.name == name then
            return tool
        end
    end
    return nil
end

-- Tool calls of the whole prompt so far. A call ID must be new in the session.
local function call_count(messages: {any}): number
    local count = 0
    for _, message in ipairs(messages) do
        if message.role == "function_call" then
            count = count + 1
        end
    end
    return count
end

-- The tool results after the newest user message, decoded, in order. A result
-- that is not JSON is kept as { raw = text }.
local function turn_results(messages: {any}, user_index: number): {any}
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

local function handler(contract_args: any): any
    local messages = contract_args.messages or {}
    local tools = contract_args.tools or {}
    local user_index = latest_user_index(messages) or 0
    local user_message = messages[user_index]
    local user_text = user_message and table.concat(content_texts(user_message.content), "\n") or ""
    local lower = string.lower(user_text)
    local tag = string.match(user_text, "#([%w_%-]+)") or DEFAULT_TAG
    local results = turn_results(messages, user_index)
    local done = #results
    local first_id = call_count(messages) + 1

    local function reply(content: string): any
        return finish(content, nil)
    end

    -- One call of one fixture tool, with a call ID that is new in the session.
    -- `slot` tells apart the calls of one round.
    local function call_of(registry_id: string, arguments: any, slot: number): any
        local tool = find_tool(tools, registry_id)
        if not tool then
            return nil
        end
        return {
            id = string.format("tool-approval-call-%d", first_id + slot),
            name = tool.name,
            registry_id = tool.registry_id,
            arguments = arguments,
        }
    end

    -- A round of tool calls, or the "can't run" reply when the agent lacks a tool.
    local function round(text: string, wanted: {Wanted}): any
        local calls = {}
        for slot, item in ipairs(wanted) do
            local call = nil
            if item.delegate then
                local tool = find_tool_by_name(tools, DELEGATE_TOOL_NAME)
                if tool then
                    call = {
                        id = string.format("tool-approval-call-%d", first_id + slot - 1),
                        name = tool.name,
                        arguments = item.arguments,
                    }
                end
            elseif item.tool then
                call = call_of(item.tool, item.arguments, slot - 1)
            end
            if not call then
                return reply(NO_TOOLS_HERE_TEXT)
            end
            table.insert(calls, call)
        end
        return finish(text, calls)
    end

    local function record(prefix: string, number: number): string
        return string.format("%s-%d-%s", prefix, number, tag)
    end

    -- The text after a single call: what ran, or why it did not.
    local function single_call_text(): string
        local result = results[1]
        if result.executed == false then
            if result.reason == "denied_by_user" and type(result.user_feedback) == "string" then
                return "Following your instruction: " .. result.user_feedback
            end
            return "Not run: " .. tostring(result.reason)
        end
        if result.ran == true then
            return string.format("Done: %s %s ran.", tostring(result.tool), tostring(result.record))
        end
        return "Unexpected result: " .. json.encode(result)
    end

    -- Steering text: "steer: <text>". The Session puts it after the results of
    -- the call that it superseded, so it is the newest user message.
    local steer = string.match(user_text, "[Ss]teer:%s*(.*)")
    if steer then
        local text = string.gsub(steer, "%s*#[%w_%-]+%s*$", "")
        return reply("Steering read: " .. text)
    end

    -- "approve three": three marked calls in one step, then one more step that
    -- asks again. Needs an agent whose approve_all mode is batch.
    if string.find(lower, "approve three", 1, true) then
        if done == 0 then
            return round("", {
                { tool = DELETE_RECORD_TOOL, arguments = { record = record("rec", 1) } },
                { tool = DELETE_RECORD_TOOL, arguments = { record = record("rec", 2) } },
                { tool = DELETE_RECORD_TOOL, arguments = { record = record("rec", 3) } },
            })
        end
        if done == 3 then
            return round("", { { tool = DELETE_RECORD_TOOL, arguments = { record = record("rec", 4) } } })
        end
        return reply("Batch finished.")
    end

    -- "grant tool again" comes before "grant tool", which it contains.
    if string.find(lower, "grant tool again", 1, true) then
        if done == 0 then
            return round("", { { tool = SEND_INVOICE_TOOL, arguments = { invoice = record("inv", 3) } } })
        end
        return reply("Invoice finished.")
    end

    -- "grant tool": the same tool in two steps. The second runs without a card
    -- once the user chose Approve all for this tool.
    if string.find(lower, "grant tool", 1, true) then
        if done == 0 then
            return round("", { { tool = SEND_INVOICE_TOOL, arguments = { invoice = record("inv", 1) } } })
        end
        if done == 1 then
            return round("", { { tool = SEND_INVOICE_TOOL, arguments = { invoice = record("inv", 2) } } })
        end
        return reply("Invoices finished.")
    end

    -- "grant session": a marked tool, then two tools a session grant covers,
    -- then the tool that never offers Approve all.
    if string.find(lower, "grant session", 1, true) then
        if done == 0 then
            return round("", { { tool = DELETE_RECORD_TOOL, arguments = { record = record("rec", 1) } } })
        end
        if done == 1 then
            return round("", {
                { tool = DELETE_RECORD_TOOL, arguments = { record = record("rec", 2) } },
                { tool = SEND_INVOICE_TOOL, arguments = { invoice = record("inv", 2) } },
            })
        end
        if done == 3 then
            return round("", { { tool = WIRE_FUNDS_TOOL, arguments = { account = record("acc", 1) } } })
        end
        return reply("Session grant checked.")
    end

    -- "stop denial": one batch of two marked calls and one call that needs no
    -- approval. A Deny with Stop must keep all three from running.
    if string.find(lower, "stop denial", 1, true) then
        if done == 0 then
            return round("", {
                { tool = DELETE_RECORD_TOOL, arguments = { record = record("rec", 1) } },
                { tool = LOOKUP_RECORD_TOOL, arguments = { record = record("rec", 1) } },
                { tool = SEND_INVOICE_TOOL, arguments = { invoice = record("inv", 1) } },
            })
        end
        return reply("Batch finished.")
    end

    -- "ask everything": a private marked tool, a delegation call and a tool
    -- that needs no approval under `require: marked`. Needs `require: all`.
    if string.find(lower, "ask everything", 1, true) then
        if done == 0 then
            return round("", {
                { tool = WRITE_AUDIT_TOOL, arguments = { entry = record("audit", 1) } },
                { delegate = true, arguments = { message = "Summarise the churn report. " .. record("task", 1) } },
                { tool = LOOKUP_RECORD_TOOL, arguments = { record = record("rec", 1) } },
            })
        end
        -- The results are not in model order. The Session lists the results of
        -- plain calls first, in model order, and the results of delegation
        -- calls after them, so the delegation result comes last. Find each
        -- result by what it holds, not by its place. Say "Everything ran."
        -- only when the audit entry, the record and the delegation all
        -- succeeded.
        local audit_ran = false
        local record_ran = false
        local analyst_ran = false
        for _, result in ipairs(results) do
            if result.ran == true and result.tool == "write_audit" then
                audit_ran = true
            elseif result.ran == true and result.tool == "lookup_record" then
                record_ran = true
            elseif string.find(tostring(json.encode(result)), "churn is stable", 1, true) then
                analyst_ran = true
            end
        end
        if audit_ran and record_ran and analyst_ran then
            return reply("Everything ran.")
        end
        return reply("Not everything ran: " .. tostring(json.encode(results)))
    end

    -- "forge decision": an artifact whose script tries to decide for the user,
    -- then a marked call that waits while the script runs.
    if string.find(lower, "forge decision", 1, true) then
        if done == 0 then
            return round("", { { tool = MAKE_FORGER_TOOL, arguments = { tag = tag } } })
        end
        if done == 1 then
            return round("", { { tool = DELETE_RECORD_TOOL, arguments = { record = record("rec", 1) } } })
        end
        return reply("Forge check finished.")
    end

    -- "lookup one": the tool that needs no approval, for the agent without the
    -- approval trait and for the old Session.
    if string.find(lower, "lookup one", 1, true) then
        if done == 0 then
            return round("", { { tool = LOOKUP_RECORD_TOOL, arguments = { record = record("rec", 1) } } })
        end
        return reply(string.format("Looked up %s.", tostring(results[1].record)))
    end

    -- "approve one" and "deny reason": one marked call, then the text for the
    -- decision. Every other single-call scenario (Stop, expiry, reload, two
    -- windows, steering, phone width) uses "approve one" too.
    if string.find(lower, "approve one", 1, true) or string.find(lower, "deny reason", 1, true) then
        if done == 0 then
            return round("", { { tool = DELETE_RECORD_TOOL, arguments = { record = record("rec", 1) } } })
        end
        return reply(single_call_text())
    end

    -- Phase 0 gallery phrases. Keep the earlier approval scripts unchanged.
    if string.find(lower, "think demo", 1, true) then
        return reply("<think>\nI will read the fixture request.\nI will compare the available records.\nI will check the result before answering.\nI can now give a short answer.\n</think>\nThe fixture record is ready.")
    end

    if string.find(lower, "think open", 1, true) then
        return reply("<think>\nI will read the fixture request.\nI am still comparing the available records.\nThe reasoning tag is deliberately left open.")
    end

    if string.find(lower, "fail one", 1, true) then
        if done == 0 then
            return round("", { { tool = FAIL_RECORD_TOOL, arguments = { record = record("fail", 1) } } })
        end
        return reply("The fixture failed. No record was changed.")
    end

    if string.find(lower, "slow one", 1, true) then
        if done == 0 then
            return round("", { { tool = SLOW_RECORD_TOOL, arguments = { record = record("slow", 1) } } })
        end
        return reply("The slow fixture finished.")
    end

    if string.find(lower, "big result", 1, true) then
        if done == 0 then
            return round("", { { tool = BIG_RESULT_TOOL, arguments = { record = record("big", 1) } } })
        end
        return reply("The large fixture result is ready.")
    end

    if string.find(lower, "many tools", 1, true) then
        if done == 0 then
            return round("", {
                { tool = LOOKUP_RECORD_TOOL, arguments = { record = record("many", 1) } },
                { tool = LOOKUP_RECORD_TOOL, arguments = { record = record("many", 2) } },
                { tool = LOOKUP_RECORD_TOOL, arguments = { record = record("many", 3) } },
                { tool = LOOKUP_RECORD_TOOL, arguments = { record = record("many", 4) } },
            })
        end
        return reply("Looked up all four fixture records.")
    end

    -- Phase 1 call-details phrases. Keep all existing scripts above unchanged.
    if string.find(lower, "fifty calls", 1, true) then
        if done == 0 then
            local wanted: {Wanted} = {}
            -- One round, two model steps including the final reply. Distinct
            -- arguments cannot trip the repeated-identical-round guard.
            for number = 1, 50 do
                table.insert(wanted, { tool = LOOKUP_RECORD_TOOL, arguments = { record = record("fifty", number) } })
            end
            return round("", wanted)
        end
        return reply("All 50 fixture calls finished.")
    end

    if string.find(lower, "invalid details", 1, true) then
        if done == 0 then
            -- The caller rejects malformed JSON, but does not validate input_schema.
            return round("", { { tool = LOOKUP_RECORD_TOOL, arguments = "{" } })
        end
        return reply("The invalid fixture was not run.")
    end

    local details_tool = nil
    local details_arguments: any = { record = record("details", 1) }
    if string.find(lower, "masked email", 1, true) then
        details_tool = MASKED_EMAIL_TOOL
        details_arguments = { email = "b3-writeonly-41c9@example.test", label = "Public contact" }
    elseif string.find(lower, "masked approval", 1, true) then
        details_tool = "app.tool_approval_demo:masked_email_approval_tool"
        details_arguments = { email = "b3-writeonly-41c9@example.test", label = "Public contact" }
    elseif string.find(lower, "sensitive result", 1, true) then
        details_tool = SENSITIVE_RESULT_TOOL
    elseif string.find(lower, "empty details", 1, true) then
        details_tool = EMPTY_RESULT_TOOL
        details_arguments = { kind = "empty" }
    elseif string.find(lower, "null details", 1, true) then
        details_tool = EMPTY_RESULT_TOOL
        details_arguments = { kind = "null" }
    elseif string.find(lower, "private details", 1, true) then
        details_tool = PRIVATE_DETAILS_TOOL
        details_arguments = { entry = "B3_PRIVATE_ARGUMENT_61ad" }
    elseif string.find(lower, "hidden details", 1, true) then
        details_tool = HIDDEN_RESULT_TOOL
    elseif string.find(lower, "hidden error", 1, true) then
        details_tool = "app.tool_approval_demo:hidden_error_tool"
    elseif string.find(lower, "text details", 1, true) then
        details_tool = TEXT_RESULT_TOOL
    end
    if details_tool then
        if done == 0 then
            return round("", { { tool = details_tool, arguments = details_arguments } })
        end
        return reply("The details fixture finished.")
    end

    -- The analyst agent that "ask everything" delegates to. It answers the
    -- delegated message and nothing else.
    if string.find(lower, "churn report", 1, true) then
        return reply("Analyst report: churn is stable.")
    end

    return reply("Say 'approve one' to get an approval card.")
end

return { handler = handler }
