local http = require("http")
local json = require("json")
local flow = require("flow")
local api_error = require("api_error")

-- POST /api/v1/research { query }
-- Starts an async research dataflow and returns immediately. The flow runs under
-- the current security actor, so its nodes (web_get, format) resolve this user's
-- relay hub on their own. The agent's fetches and the final answer arrive on the
-- client over the relay; the endpoint never blocks.
type Body = {
    query?: string,
}

local function handler()
    local req = http.request()
    local res = http.response()

    local raw = req:body()
    local body: Body = {}
    if raw ~= nil and raw ~= "" then
        body = json.decode(raw) :: Body
    end

    local query: string? = body.query
    if type(query) ~= "string" or query == "" then
        res:set_status(http.STATUS.BAD_REQUEST)
        res:write_json({ success = false, error = "query is required" })
        return
    end
    local q = query :: string

    local f = flow.create()
        :with_title("Research: " .. q)
        :with_metadata({ feature = "app.research" })

    f:with_data(q)
        :as("query")
        :to("research", "query")

    f:agent("app.research:researcher", {
        inputs = { required = { "query" } },
        input_transform = { query = "inputs.query" },
        arena = {
            prompt = "Research request: " .. q,
            max_iterations = 12,
            min_iterations = 2,
            tool_calling = "auto",
        },
        metadata = { title = "Researcher", icon = "tabler:world-search" },
    })
        :as("research")
        :to("format", "notes")

    f:func("app.research:format", {
        inputs = { required = { "notes" } },
        input_transform = { notes = "inputs.notes" },
        metadata = { title = "Format answer", icon = "tabler:wand" },
    })
        :as("format")
        :to("@success")
        :error_to("@fail")

    local dataflow_id, start_err = f:start()
    if start_err ~= nil then
        api_error.fail(res, http.STATUS.INTERNAL_ERROR, "Failed to start research", start_err)
        return
    end

    res:set_status(http.STATUS.OK)
    res:write_json({ success = true, started = true, query = q, dataflow_id = dataflow_id })
end

return { handler = handler }
