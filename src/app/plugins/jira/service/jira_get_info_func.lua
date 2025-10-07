local jira_internal = require("jira_internal")
local component = require("component")

local function handle(request_dto)
    -- Get component_id from context
    local component_id, err = jira_internal.get_component_id()
    if err then
        return { status_code = 500, body = { error = err } }
    end

    -- Validate READ access
    local access_level, access_err = jira_internal.validate_access(component_id, component.ACCESS.READ)
    if access_err then
        return { status_code = 403, body = { error = access_err } }
    end

    -- Get credentials
    local creds_result, creds_err = jira_internal.get_credentials(component_id)
    if creds_err then
        return { status_code = 500, body = { error = creds_err } }
    end

    local credentials = creds_result.credentials

    -- Build response with server info
    local response = {
        server_url = credentials.server_url,
        auth_type = credentials.auth_type,
        connection_name = creds_result.connection_name
    }

    -- Add server info if available
    if credentials.server_info then
        response.server_info = credentials.server_info
    end

    -- Add user info based on auth type
    response.user_info = {}
    if credentials.auth_type == "cloud" then
        response.user_info.email = credentials.email
        if credentials.server_info and credentials.server_info.display_name then
            response.user_info.display_name = credentials.server_info.display_name
        end
    else
        response.user_info.username = credentials.username
        if credentials.server_info and credentials.server_info.display_name then
            response.user_info.display_name = credentials.server_info.display_name
        end
    end

    return {
        status_code = 200,
        body = response,
        headers = {}
    }
end

return { handle = handle }