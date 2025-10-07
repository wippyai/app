local bamboohr_internal = require("bamboohr_internal")
local component = require("component")

local function handle(request_dto)
    -- Get component_id from context
    local component_id, err = bamboohr_internal.get_component_id()
    if err then
        return { error = err }
    end

    -- Validate READ access for status
    local access_level, access_err = bamboohr_internal.validate_access(component_id, component.ACCESS.READ)
    if access_err then
        return { error = access_err }
    end

    -- Get credentials to determine connection status
    local creds_result, creds_err = bamboohr_internal.get_credentials(component_id)

    local description
    local updated_at = nil

    if creds_result and creds_result.credentials then
        -- Credentials exist - provide status
        local credentials = creds_result.credentials
        local subdomain = credentials.subdomain or "unknown"
        local connection_name = creds_result.connection_name or "BambooHR Connection"
        local server_url = credentials.server_url or "https://api.bamboohr.com/api/gateway.php"

        description = string.format("BambooHR REST service connected to %s subdomain (%s)",
                                   subdomain, connection_name)

        updated_at = creds_result.updated_at
    else
        -- No credentials configured
        description = "BambooHR REST service - no credentials configured"
    end

    -- Success response
    return {
        description = description,
        updated_at = updated_at
    }
end

return { handle = handle }