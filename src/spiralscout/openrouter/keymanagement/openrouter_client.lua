local http_client = require("http_client")
local json = require("json")
local env = require("env")

local openrouter_client = {}

local API_BASE_URL = "https://openrouter.ai/api/v1"
local DEFAULT_TIMEOUT = 30

local function get_provisioning_key()
    local key = env.get("OPENROUTER_ENTERPRISE_KEY")
    if not key or key == "" then
        return nil, "OpenRouter provisioning key not configured"
    end
    return key
end

function openrouter_client.provisioning_request(method, endpoint, body_data)
    local api_key, err = get_provisioning_key()
    if not api_key then
        return nil, err
    end

    local url = API_BASE_URL .. endpoint
    local options = {
        headers = {
            ["Authorization"] = "Bearer " .. api_key,
            ["Content-Type"] = "application/json",
            ["Accept"] = "application/json"
        },
        timeout = DEFAULT_TIMEOUT
    }

    if body_data then
        local encoded_body, json_err = json.encode(body_data)
        if json_err then
            return nil, "Failed to encode request body: " .. json_err
        end
        options.body = encoded_body
    end

    local response, http_err = http_client.request(method, url, options)
    if not response then
        return nil, "HTTP request failed: " .. (http_err or "unknown error")
    end

    local response_data = nil
    if response.body and response.body ~= "" then
        local decoded, parse_err = json.decode(response.body)
        if parse_err then
            return nil, "Failed to parse JSON response: " .. parse_err
        end
        response_data = decoded
    end

    return {
        status = response.status_code,
        data = response_data,
        headers = response.headers
    }
end

function openrouter_client.key_request(method, endpoint, api_key, body_data)
    if not api_key or api_key == "" then
        return nil, "API key is required"
    end

    local url = API_BASE_URL .. endpoint
    local options = {
        headers = {
            ["Authorization"] = "Bearer " .. api_key,
            ["Accept"] = "application/json"
        },
        timeout = DEFAULT_TIMEOUT
    }

    if body_data then
        local encoded_body, json_err = json.encode(body_data)
        if json_err then
            return nil, "Failed to encode request body: " .. json_err
        end
        options.body = encoded_body
        options.headers["Content-Type"] = "application/json"
    end

    local response, http_err = http_client.request(method, url, options)
    if not response then
        return nil, "HTTP request failed: " .. (http_err or "unknown error")
    end

    local response_data = nil
    if response.body and response.body ~= "" then
        local decoded, parse_err = json.decode(response.body)
        if parse_err then
            return nil, "Failed to parse JSON response: " .. parse_err
        end
        response_data = decoded
    end

    return {
        status = response.status_code,
        data = response_data,
        headers = response.headers
    }
end

return openrouter_client
