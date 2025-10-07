local ctx = require("ctx")
local http_client = require("http_client")
local json = require("json")
local component = require("component")

local VALIDATION_ERRORS = {
    MISSING_COMPONENT_ID = "Component ID is required in context",
    MISSING_PATH = "API path is required",
    ACCESS_DENIED = "Insufficient access to Jira API",
    INVALID_QUERY = "Query parameters must be a table if provided",
    INVALID_HEADERS = "Headers must be a table if provided"
}

local function build_auth_headers(credentials, additional_headers)
    local headers = {
        ["Accept"] = "application/json",
        ["Content-Type"] = "application/json"
    }

    if credentials.auth_type == "cloud" then
        -- Cloud: Basic auth with email:api_token
        local auth_string = credentials.email .. ":" .. credentials.api_token
        local encoded_auth = require("base64").encode(auth_string)
        headers["Authorization"] = "Basic " .. encoded_auth
    else
        -- Server: Bearer token
        headers["Authorization"] = "Bearer " .. credentials.personal_access_token
    end

    -- Merge additional headers
    if additional_headers then
        for key, value in pairs(additional_headers) do
            headers[key] = value
        end
    end

    return headers
end

local function build_query_string(query_params)
    if not query_params or type(query_params) ~= "table" then
        return ""
    end

    local parts = {}
    for key, value in pairs(query_params) do
        table.insert(parts, http_client.encode_uri(tostring(key)) .. "=" .. http_client.encode_uri(tostring(value)))
    end

    if #parts > 0 then
        return "?" .. table.concat(parts, "&")
    end
    return ""
end

local function handle(request_dto)
    -- Input validation
    if not request_dto or type(request_dto) ~= "table" then
        return { status_code = 400, body = { error = "Invalid request: must be a table" } }
    end

    if not request_dto.path or request_dto.path == "" then
        return { status_code = 400, body = { error = VALIDATION_ERRORS.MISSING_PATH } }
    end

    if request_dto.query and type(request_dto.query) ~= "table" then
        return { status_code = 400, body = { error = VALIDATION_ERRORS.INVALID_QUERY } }
    end

    if request_dto.headers and type(request_dto.headers) ~= "table" then
        return { status_code = 400, body = { error = VALIDATION_ERRORS.INVALID_HEADERS } }
    end

    -- Get component_id from context
    local component_id, err = ctx.get("component_id")
    if err or not component_id or component_id == "" then
        return { status_code = 500, body = { error = VALIDATION_ERRORS.MISSING_COMPONENT_ID } }
    end

    -- Validate WRITE access for PUT requests
    local access_level, access_err = component.validate_access(component_id, component.ACCESS.WRITE)
    if not access_level then
        return { status_code = 403, body = { error = VALIDATION_ERRORS.ACCESS_DENIED .. ": " .. (access_err or "insufficient permissions") } }
    end

    -- Get credentials using contract
    local contract = require("contract")
    local credentials_contract, contract_err = contract.get("userspace.credentials:credentials_contract")
    if contract_err then
        return { status_code = 500, body = { error = "Failed to get credentials contract: " .. contract_err } }
    end

    local credentials_instance, instance_err = credentials_contract:with_context({component_id = component_id}):open()
    if instance_err then
        return { status_code = 500, body = { error = "Failed to open credentials instance: " .. instance_err } }
    end

    local creds_result, creds_err = credentials_instance:get_credentials()
    if creds_err then
        return { status_code = 500, body = { error = "Failed to get credentials: " .. creds_err } }
    end

    if not creds_result.credentials then
        return { status_code = 500, body = { error = "No Jira credentials configured" } }
    end

    local credentials = creds_result.credentials

    -- Build full URL
    local server_url = credentials.server_url
    if not server_url then
        return { status_code = 500, body = { error = "Server URL not configured in credentials" } }
    end

    -- Remove trailing slash from server_url and leading slash from path if present
    server_url = server_url:gsub("/$", "")
    local path = request_dto.path
    if not path:match("^/") then
        path = "/" .. path
    end

    local query_string = build_query_string(request_dto.query)
    local full_url = server_url .. path .. query_string

    -- Build headers
    local headers = build_auth_headers(credentials, request_dto.headers)

    -- Prepare request body
    local request_body = ""
    if request_dto.body then
        if type(request_dto.body) == "table" then
            local encoded_body, encode_err = json.encode(request_dto.body)
            if encode_err then
                return { status_code = 400, body = { error = "Failed to encode request body: " .. encode_err } }
            end
            request_body = encoded_body
        else
            request_body = tostring(request_dto.body)
        end
    end

    -- Make HTTP request
    local response, http_err = http_client.put(full_url, {
        headers = headers,
        body = request_body,
        timeout = 30
    })

    if http_err then
        return { status_code = 500, body = { error = "HTTP request failed: " .. http_err } }
    end

    -- Parse JSON response if possible
    local response_body = response.body
    if response.headers and response.headers["content-type"] and
       response.headers["content-type"]:find("application/json") then
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

return { handle = handle }