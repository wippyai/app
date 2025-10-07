local tempo_internal = require("tempo_internal")
local http_client = require("http_client")
local json = require("json")
local component = require("component")

local VALIDATION_ERRORS = {
    MISSING_PATH = "API path is required",
    INVALID_QUERY = "Query parameters must be a table if provided",
    INVALID_HEADERS = "Headers must be a table if provided"
}

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
    local component_id, err = tempo_internal.get_component_id()
    if err then
        return { status_code = 500, body = { error = err } }
    end

    -- Validate WRITE access for POST requests
    local access_level, access_err = tempo_internal.validate_access(component_id, component.ACCESS.WRITE)
    if access_err then
        return { status_code = 403, body = { error = access_err } }
    end

    -- Get credentials
    local creds_result, creds_err = tempo_internal.get_credentials(component_id)
    if creds_err then
        return { status_code = 500, body = { error = creds_err } }
    end

    local credentials = creds_result.credentials

    -- Build full URL
    local full_url, url_err = tempo_internal.build_url(credentials, request_dto.path, request_dto.query)
    if url_err then
        return { status_code = 500, body = { error = url_err } }
    end

    -- Build headers
    local headers = tempo_internal.build_auth_headers(credentials, request_dto.headers)

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
    local response, http_err = http_client.post(full_url, {
        headers = headers,
        body = request_body,
        timeout = 30
    })

    if http_err then
        return { status_code = 500, body = { error = "HTTP request failed: " .. http_err } }
    end

    -- Parse and return response
    return tempo_internal.parse_response(response)
end

return { handle = handle }