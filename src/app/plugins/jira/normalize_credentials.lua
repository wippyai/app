local http_client = require("http_client")
local json = require("json")
local base64 = require("base64")

local function normalize_jira_url(url)
    url = url:gsub("/$", "")

    if not url:match("^https?://") then
        url = "https://" .. url
    end

    local protocol, domain_with_port = url:match("^(https?://)([^/]+)")
    if protocol and domain_with_port then
        return protocol .. domain_with_port
    end

    return url
end

local function test_jira_connection(credentials)
    local auth_header
    if credentials.auth_type == "cloud" then
        local auth_string = credentials.email .. ":" .. credentials.api_token
        auth_header = "Basic " .. base64.encode(auth_string)
    else
        auth_header = "Bearer " .. credentials.personal_access_token
    end

    local headers = {
        ["Authorization"] = auth_header,
        ["Accept"] = "application/json",
        ["Content-Type"] = "application/json"
    }

    -- Try multiple endpoints in order of preference
    local endpoints = {
        -- Try API v2 first (more widely supported)
        {
            url = "/rest/api/2/myself",
            description = "user profile",
            api_version = "v2"
        },
        {
            url = "/rest/api/2/serverInfo",
            description = "server info v2",
            api_version = "v2"
        },
        -- Fallback to API v3 if v2 doesn't work
        {
            url = "/rest/api/3/myself",
            description = "user profile v3",
            api_version = "v3"
        },
        {
            url = "/rest/api/3/serverInfo",
            description = "server info v3",
            api_version = "v3"
        }
    }

    local last_error = nil

    for _, endpoint in ipairs(endpoints) do
        local response, err = http_client.get(credentials.server_url .. endpoint.url, {
            headers = headers,
            timeout = 15
        })

        if err then
            last_error = "Connection failed: " .. err
            -- Continue to next endpoint
        elseif response.status_code == 200 then
            -- Success! Parse the response
            local data, parse_err = json.decode(response.body)
            if parse_err then
                last_error = "Invalid JSON response from " .. endpoint.description
                -- Continue to next endpoint
            else
                -- Return success with whatever data we got
                data.api_version = endpoint.api_version
                return data, nil
            end
        elseif response.status_code == 401 then
            -- Authentication failed - no point trying other endpoints
            return nil, "Authentication failed - check your credentials"
        elseif response.status_code == 403 then
            -- Access denied for this endpoint - try next one
            last_error = "Access denied to " .. endpoint.description .. " endpoint"
            -- Continue to next endpoint
        elseif response.status_code == 404 then
            -- Endpoint not found - try next one
            last_error = endpoint.description .. " endpoint not found"
            -- Continue to next endpoint
        else
            -- Other HTTP error
            last_error = "HTTP " .. response.status_code .. " error for " .. endpoint.description
            -- Continue to next endpoint
        end
    end

    -- If we get here, all endpoints failed
    if last_error then
        return nil, last_error
    else
        return nil, "All connection attempts failed"
    end
end

local function normalize_and_validate(form_data)
    local server_url = form_data.server_url
    if not server_url or server_url == "" then
        return {
            success = false,
            error = "Server URL is required",
            field = "server_url"
        }
    end

    server_url = normalize_jira_url(server_url)

    local is_cloud = server_url:match("%.atlassian%.net")
    local normalized_credentials = {
        server_url = server_url
    }

    if is_cloud then
        if not form_data.email or form_data.email == "" then
            return {
                success = false,
                error = "Email is required for Jira Cloud authentication",
                field = "email"
            }
        end
        if not form_data.api_token or form_data.api_token == "" then
            return {
                success = false,
                error = "API Token is required for Jira Cloud authentication",
                field = "api_token"
            }
        end

        normalized_credentials.email = form_data.email
        normalized_credentials.api_token = form_data.api_token
        normalized_credentials.auth_type = "cloud"
    else
        if not form_data.username or form_data.username == "" then
            return {
                success = false,
                error = "Username is required for Jira Server authentication",
                field = "username"
            }
        end
        if not form_data.personal_access_token or form_data.personal_access_token == "" then
            return {
                success = false,
                error = "Personal Access Token is required for Jira Server authentication",
                field = "personal_access_token"
            }
        end

        normalized_credentials.username = form_data.username
        normalized_credentials.personal_access_token = form_data.personal_access_token
        normalized_credentials.auth_type = "server"
    end

    local test_result, test_err = test_jira_connection(normalized_credentials)
    if test_err then
        return {
            success = false,
            error = "Failed to connect to Jira: " .. test_err,
            field = "connection"
        }
    end

    if test_result then
        normalized_credentials.server_info = {
            version = test_result.version,
            server_title = test_result.serverTitle or test_result.title,
            display_name = test_result.displayName,
            api_version = test_result.api_version
        }
    end

    return {
        success = true,
        normalized_credentials = normalized_credentials
    }
end

return {
    normalize_and_validate = normalize_and_validate
}