local bamboohr_internal = require("bamboohr_internal")
local component = require("component")

local function handle(request_dto)
    -- Get component_id from context
    local component_id, err = bamboohr_internal.get_component_id()
    if err then
        return { status_code = 500, body = { error = err } }
    end

    -- Validate READ access
    local access_level, access_err = bamboohr_internal.validate_access(component_id, component.ACCESS.READ)
    if access_err then
        return { status_code = 403, body = { error = access_err } }
    end

    -- Get credentials
    local creds_result, creds_err = bamboohr_internal.get_credentials(component_id)
    if creds_err then
        return { status_code = 500, body = { error = creds_err } }
    end

    local credentials = creds_result.credentials

    -- Build response with server info
    local response = {
        server_url = credentials.server_url or "https://api.bamboohr.com/api/gateway.php",
        subdomain = credentials.subdomain,
        connection_name = creds_result.connection_name
    }

    -- Add API info
    response.api_info = {
        version = "v1",
        base_path = "/" .. credentials.subdomain .. "/v1"
    }

    return {
        status_code = 200,
        body = response,
        headers = {}
    }
end

return { handle = handle }