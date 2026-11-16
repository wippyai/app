-- Build function of the dashboards trait: appends the live catalogue of points
-- and tile types to the agent's prompt when the agent is compiled.
local catalog = require("catalog")

local function execute(_base_prompt, _ctx)
    local ok, text = pcall(catalog.prompt)
    if not ok or type(text) ~= "string" or text == "" then
        return { prompt = "## Dashboard catalogue\n\n(The catalogue could not be read. Do not call BuildDashboard; tell the user dashboards are unavailable.)" }
    end
    return { prompt = text }
end

return { execute = execute }
