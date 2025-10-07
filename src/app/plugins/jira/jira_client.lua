local component = require("component")
local ctx = require("ctx")

local JIRA_CONTRACT = "app.plugins.jira:jira_rest_contract"

local jira = {}

-- Open Jira service instance
-- @param component_id string|nil Component ID to use. If nil, will search by context or metadata
-- @return JiraService instance or nil, error
function jira.open(component_id)
    -- Determine component_id
    if component_id then
        -- Use provided component_id - open the service directly
        return component.open(component_id, component.ACCESS.READ, JIRA_CONTRACT)
    else
        -- Try to get from context first
        local ctx_component_id, ctx_err = ctx.get("component_id")
        if ctx_component_id and ctx_component_id ~= "" then
            -- Found in context - open the service directly
            return component.open(ctx_component_id, component.ACCESS.READ, JIRA_CONTRACT)
        else
            -- Search for Jira component by metadata - this returns the service already opened
            return component.open_by_meta(
                {
                    class = "connection",
                    provider = "jira"
                },
                component.ACCESS.READ,
                JIRA_CONTRACT
            )
        end
    end
end

return jira
