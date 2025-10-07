local jira_internal = require("jira_internal")
local component = require("component")

local function handle(request_dto)
    -- Get component_id from context
    local component_id, err = jira_internal.get_component_id()
    if err then
        return { error = err }
    end

    -- Validate READ access for status
    local access_level, access_err = jira_internal.validate_access(component_id, component.ACCESS.READ)
    if access_err then
        return { error = access_err }
    end

    -- Get credentials to determine connection status
    local creds_result, creds_err = jira_internal.get_credentials(component_id)

    local description
    local updated_at = nil

    if creds_result and creds_result.credentials then
        -- Credentials exist - provide status
        local credentials = creds_result.credentials
        local server_url = credentials.server_url or "unknown server"
        local auth_type = credentials.auth_type or "unknown"
        local connection_name = creds_result.connection_name or "Jira Connection"

        if auth_type == "cloud" then
            local email = credentials.email or "unknown user"
            description = string.format("Jira Cloud REST service connected to %s as %s (%s)",
                                       server_url, email, connection_name)
        else
            local username = credentials.username or "unknown user"
            description = string.format("Jira Server REST service connected to %s as %s (%s)",
                                       server_url, username, connection_name)
        end

        updated_at = creds_result.updated_at
    else
        -- No credentials configured
        description = "Jira REST service - no credentials configured"
    end

    -- Success response
    return {
        description = description,
        updated_at = updated_at
    }
end

return { handle = handle }