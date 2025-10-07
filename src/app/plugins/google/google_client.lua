-- Google API client library for OAuth connection discovery and HTTP requests
-- Provides interface for opening Google OAuth connections and making authenticated API requests

local http_client = require("http_client")
local json = require("json")
local component = require("component")

local google_client = {}

-- Open a Google OAuth connection using component library
-- Returns the connection object if found, nil otherwise
function google_client.open_connection()
    -- Search for Google OAuth connections using component metadata
    local connection, err = component.open_by_meta(
        {provider = "google"},
        component.ACCESS.READ,
        "userspace.oauth:oauth_connection_contract"
    )

    if err then
        return nil
    end

    return connection
end

-- Make an authenticated HTTP request to Google API
-- @param connection: Google OAuth connection component
-- @param method: HTTP method (GET, POST, etc.)
-- @param endpoint: Google API endpoint (without base URL)
-- @param data: Optional request body data
-- @param headers: Optional additional headers
-- @return response object or nil on error
function google_client.request(connection, method, endpoint, data, headers)
    if not connection then
        error("Google connection is required")
    end

    -- Get access token from OAuth connection
    local token_result, token_err = connection:get_access_token()
    if token_err or not token_result.success then
        error("Failed to get access token: " .. (token_err or token_result.error or "Unknown error"))
    end

    local url = endpoint

    local request_headers = {
        ["Authorization"] = token_result.token_type .. " " .. token_result.access_token,
        ["Content-Type"] = "application/json"
    }

    -- Add any additional headers
    if headers then
        for k, v in pairs(headers) do
            request_headers[k] = v
        end
    end

    local options = {
        headers = request_headers
    }

    if data then
        options.body = json.encode(data)
    end

    return http_client.request(method, url, options)
end

-- Get current user information
-- @param connection: Google OAuth connection component
-- @return user info object or nil on error
function google_client.get_user_info(connection)
    local response = google_client.request(connection, "GET", "https://www.googleapis.com/oauth2/v2/userinfo")
    if response and response.status_code == 200 then
        return json.decode(response.body)
    end
    return nil
end

-- HTTP method convenience functions for Google traits compatibility
-- These functions expect component_id, path, and optional parameters

function google_client.get(component_id, path, query)
    local connection = google_client.open_connection()
    if not connection then
        return {
            success = false,
            error = "No Google connection found"
        }
    end

    local endpoint = path
    if query and next(query) then
        local params = {}
        for k, v in pairs(query) do
            table.insert(params, k .. "=" .. tostring(v))
        end
        endpoint = endpoint .. "?" .. table.concat(params, "&")
    end

    local response = google_client.request(connection, "GET", endpoint)
    if response and response.status_code >= 200 and response.status_code < 300 then
        local data = nil
        if response.body and response.body ~= "" then
            data = json.decode(response.body)
        end
        return {
            success = true,
            data = data,
            status_code = response.status_code,
            headers = response.headers
        }
    else
        return {
            success = false,
            error = response and response.body or "Request failed",
            status_code = response and response.status_code or 0
        }
    end
end

function google_client.post(component_id, path, body, query)
    local connection = google_client.open_connection()
    if not connection then
        return {
            success = false,
            error = "No Google connection found"
        }
    end

    local endpoint = path
    if query and next(query) then
        local params = {}
        for k, v in pairs(query) do
            table.insert(params, k .. "=" .. tostring(v))
        end
        endpoint = endpoint .. "?" .. table.concat(params, "&")
    end

    local response = google_client.request(connection, "POST", endpoint, body)
    if response and response.status_code >= 200 and response.status_code < 300 then
        local data = nil
        if response.body and response.body ~= "" then
            data = json.decode(response.body)
        end
        return {
            success = true,
            data = data,
            status_code = response.status_code,
            headers = response.headers
        }
    else
        return {
            success = false,
            error = response and response.body or "Request failed",
            status_code = response and response.status_code or 0
        }
    end
end

function google_client.put(component_id, path, body, query)
    local connection = google_client.open_connection()
    if not connection then
        return {
            success = false,
            error = "No Google connection found"
        }
    end

    local endpoint = path
    if query and next(query) then
        local params = {}
        for k, v in pairs(query) do
            table.insert(params, k .. "=" .. tostring(v))
        end
        endpoint = endpoint .. "?" .. table.concat(params, "&")
    end

    local response = google_client.request(connection, "PUT", endpoint, body)
    if response and response.status_code >= 200 and response.status_code < 300 then
        local data = nil
        if response.body and response.body ~= "" then
            data = json.decode(response.body)
        end
        return {
            success = true,
            data = data,
            status_code = response.status_code,
            headers = response.headers
        }
    else
        return {
            success = false,
            error = response and response.body or "Request failed",
            status_code = response and response.status_code or 0
        }
    end
end

function google_client.delete(component_id, path, query)
    local connection = google_client.open_connection()
    if not connection then
        return {
            success = false,
            error = "No Google connection found"
        }
    end

    local endpoint = path
    if query and next(query) then
        local params = {}
        for k, v in pairs(query) do
            table.insert(params, k .. "=" .. tostring(v))
        end
        endpoint = endpoint .. "?" .. table.concat(params, "&")
    end

    local response = google_client.request(connection, "DELETE", endpoint)
    if response and response.status_code >= 200 and response.status_code < 300 then
        local data = nil
        if response.body and response.body ~= "" then
            data = json.decode(response.body)
        end
        return {
            success = true,
            data = data,
            status_code = response.status_code,
            headers = response.headers
        }
    else
        return {
            success = false,
            error = response and response.body or "Request failed",
            status_code = response and response.status_code or 0
        }
    end
end

return google_client