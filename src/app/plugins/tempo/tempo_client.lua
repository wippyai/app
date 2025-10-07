local component = require("component")
local ctx = require("ctx")

local TEMPO_CONTRACT = "app.plugins.tempo:tempo_rest_contract"

local tempo = {}

-- Open Tempo service instance
-- @param component_id string|nil Component ID to use. If nil, will search by context or metadata
-- @return TempoService instance or nil, error
function tempo.open(component_id)
    -- Determine component_id
    if component_id then
        -- Use provided component_id - open the service directly
        return component.open(component_id, component.ACCESS.READ, TEMPO_CONTRACT)
    else
        -- Try to get from context first
        local ctx_component_id, ctx_err = ctx.get("component_id")
        if ctx_component_id and ctx_component_id ~= "" then
            -- Found in context - open the service directly
            return component.open(ctx_component_id, component.ACCESS.READ, TEMPO_CONTRACT)
        else
            -- Search for Tempo component by metadata - this returns the service already opened
            return component.open_by_meta(
                {
                    class = "connection",
                    provider = "tempo"
                },
                component.ACCESS.READ,
                TEMPO_CONTRACT
            )
        end
    end
end

return tempo