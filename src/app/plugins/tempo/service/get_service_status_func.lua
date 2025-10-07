local tempo_internal = require("tempo_internal")
local component = require("component")

local function handle(request_dto)
    -- Get component_id from context
    local component_id, err = tempo_internal.get_component_id()
    if err then
        return { error = err }
    end

    -- Validate READ access for status
    local access_level, access_err = tempo_internal.validate_access(component_id, component.ACCESS.READ)
    if access_err then
        return { error = access_err }
    end

    -- Get credentials to determine connection status
    local creds_result, creds_err = tempo_internal.get_credentials(component_id)

    local description
    local updated_at = nil

    if creds_result and creds_result.credentials then
        -- Credentials exist - provide status
        local credentials = creds_result.credentials
        local server_url = credentials.server_url or "unknown server"
        local connection_name = creds_result.connection_name or "Tempo Connection"
        local username = credentials.username or "API User"

        description = string.format("Tempo REST service connected to %s as %s (%s)",
                                   server_url, username, connection_name)

        updated_at = creds_result.updated_at
    else
        -- No credentials configured
        description = "Tempo REST service - no credentials configured"
    end

    -- Success response
    return {
        description = description,
        updated_at = updated_at
    }
end

return { handle = handle }