local component = require("component")
local ctx = require("ctx")

local BAMBOOHR_CONTRACT = "app.plugins.bamboohr:bamboohr_rest_contract"

local bamboohr = {}

-- Open BambooHR service instance
-- @param component_id string|nil Component ID to use. If nil, will search by context or metadata
-- @return BambooHRService instance or nil, error
function bamboohr.open(component_id)
    -- Determine component_id
    if component_id then
        -- Use provided component_id - open the service directly
        return component.open(component_id, component.ACCESS.READ, BAMBOOHR_CONTRACT)
    else
        -- Try to get from context first
        local ctx_component_id, ctx_err = ctx.get("component_id")
        if ctx_component_id and ctx_component_id ~= "" then
            -- Found in context - open the service directly
            return component.open(ctx_component_id, component.ACCESS.READ, BAMBOOHR_CONTRACT)
        else
            -- Search for BambooHR component by metadata - this returns the service already opened
            return component.open_by_meta(
                {
                    class = "connection",
                    provider = "bamboohr"
                },
                component.ACCESS.READ,
                BAMBOOHR_CONTRACT
            )
        end
    end
end

return bamboohr