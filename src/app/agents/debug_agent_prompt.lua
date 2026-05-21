-- debug_agent_prompt
--
-- GET /api/public/debug/agent-prompt?agent=<namespace:id>
--
-- Compiles an agent (default: app.agents:wippy) and returns the final system
-- prompt the LLM would receive. Used to verify build_func contributions
-- (e.g. wippy_artifacts_trait's component catalog) without firing real LLM
-- calls. Kept as a permanent debugging affordance.

local http = require("http")
local compiler = require("compiler")
local agent_registry = require("agent_registry")

local function handler()
    local res = http.response()
    local req = http.request()

    if not res or not req then
        return nil, "Failed to get HTTP context"
    end

    local agent_id = req:query("agent")
    if not agent_id or agent_id == "" then
        agent_id = "app.agents:wippy"
    end

    -- agent_registry.get_by_id pulls data from entry.data.* and synthesises
    -- the RawAgentSpec the compiler expects (top-level prompt/traits/tools/
    -- model/etc). Calling registry.get() directly returns the raw entry,
    -- whose `data` block is NOT flattened — compiling that yields an empty
    -- prompt with no traits picked up.
    local raw_spec, err = agent_registry.get_by_id(agent_id)
    if err or not raw_spec then
        res:set_status(http.STATUS.NOT_FOUND)
        res:write_json({
            success = false,
            error = "Agent not found: " .. tostring(err or "unknown error"),
            agent_id = agent_id,
        })
        return
    end

    local compiled, compile_err = compiler.compile(raw_spec, {})
    if compile_err or not compiled then
        res:set_status(http.STATUS.INTERNAL_ERROR)
        res:write_json({
            success = false,
            error = "Compile failed: " .. tostring(compile_err or "no spec"),
            agent_id = agent_id,
        })
        return
    end

    local tool_ids = {}
    if compiled.tools then
        for tool_name, _ in pairs(compiled.tools) do
            table.insert(tool_ids, tool_name)
        end
    end

    res:set_content_type(http.CONTENT.JSON)
    res:set_status(http.STATUS.OK)
    res:write_json({
        success = true,
        agent_id = agent_id,
        system_prompt = compiled.prompt or "",
        prompt_length = compiled.prompt and #compiled.prompt or 0,
        tools = tool_ids,
        model = compiled.model,
    })
end

return { handler = handler }
