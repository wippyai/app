local ctx = require("ctx")
local component = require("component")
local base64 = require("base64")

local CREDENTIALS_CONTRACT = "userspace.credentials:credentials_contract"

local VALIDATION_ERRORS = {
    MISSING_COMPONENT_ID = "Component ID is required in context",
    ACCESS_DENIED = "Insufficient access to BambooHR API"
}

local bamboohr_internal = {}

-- Get component_id from context with validation
function bamboohr_internal.get_component_id()
    local component_id, err = ctx.get("component_id")
    if err or not component_id or component_id == "" then
        return nil, VALIDATION_ERRORS.MISSING_COMPONENT_ID
    end
    return component_id, nil
end

-- Validate access level for component
function bamboohr_internal.validate_access(component_id, access_level)
    local user_access, access_err = component.validate_access(component_id, access_level)
    if not user_access then
        return nil, VALIDATION_ERRORS.ACCESS_DENIED .. ": " .. (access_err or "insufficient permissions")
    end
    return user_access, nil
end

-- Get credentials using contract
function bamboohr_internal.get_credentials(component_id)
    local contract = require("contract")
    local credentials_contract, contract_err = contract.get(CREDENTIALS_CONTRACT)
    if contract_err then
        return nil, "Failed to get credentials contract: " .. contract_err
    end

    local credentials_instance, instance_err = credentials_contract:with_context({component_id = component_id}):open()
    if instance_err then
        return nil, "Failed to open credentials instance: " .. instance_err
    end

    local creds_result, creds_err = credentials_instance:get_credentials()
    if creds_err then
        return nil, "Failed to get credentials: " .. creds_err
    end

    if not creds_result.credentials then
        return nil, "No BambooHR credentials configured"
    end

    return creds_result, nil
end

-- Build authentication headers
function bamboohr_internal.build_auth_headers(credentials, additional_headers)
    local headers = {
        ["Accept"] = "application/json",
        ["Content-Type"] = "application/json"
    }

    -- BambooHR uses Basic Auth with API key as username and "x" as password
    local auth_string = credentials.api_key .. ":x"
    headers["Authorization"] = "Basic " .. base64.encode(auth_string)

    -- Merge additional headers
    if additional_headers then
        for key, value in pairs(additional_headers) do
            headers[key] = value
        end
    end

    return headers
end

-- Build query string from params
function bamboohr_internal.build_query_string(query_params)
    if not query_params or type(query_params) ~= "table" then
        return ""
    end

    local http_client = require("http_client")
    local parts = {}
    for key, value in pairs(query_params) do
        table.insert(parts, http_client.encode_uri(tostring(key)) .. "=" .. http_client.encode_uri(tostring(value)))
    end

    if #parts > 0 then
        return "?" .. table.concat(parts, "&")
    end
    return ""
end

-- Build full URL from credentials and path
function bamboohr_internal.build_url(credentials, path, query_params)
    local server_url = credentials.server_url or "https://api.bamboohr.com/api/gateway.php"
    local subdomain = credentials.subdomain

    if not subdomain or subdomain == "" then
        return nil, "Subdomain not configured in credentials"
    end

    -- Remove trailing slash from server_url
    server_url = server_url:gsub("/$", "")

    -- Ensure path starts with /
    if not path:match("^/") then
        path = "/" .. path
    end

    local query_string = bamboohr_internal.build_query_string(query_params)
    return server_url .. "/" .. subdomain .. "/v1" .. path .. query_string, nil
end

-- Parse JSON response if possible
function bamboohr_internal.parse_response(response)
    local response_body = response.body
    if response.headers and response.headers["content-type"] and
       response.headers["content-type"]:find("application/json") and
       response.body and response.body ~= "" then
        local json = require("json")
        local parsed_body, parse_err = json.decode(response.body)
        if not parse_err then
            response_body = parsed_body
        end
    end

    return {
        status_code = response.status_code,
        body = response_body,
        headers = response.headers or {}
    }
end

return bamboohr_internal