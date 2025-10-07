local http_client = require("http_client")
local json = require("json")
local base64 = require("base64")

local function normalize_subdomain(subdomain)
    -- Remove any protocol or .bamboohr.com suffix
    subdomain = subdomain:gsub("^https?://", "")
    subdomain = subdomain:gsub("%.bamboohr%.com.*$", "")
    subdomain = subdomain:gsub("/.*$", "") -- Remove any path

    -- Validate subdomain format
    if not subdomain:match("^[a-zA-Z0-9][a-zA-Z0-9%-]*[a-zA-Z0-9]$") and not subdomain:match("^[a-zA-Z0-9]$") then
        return nil, "Invalid subdomain format. Use only letters, numbers, and hyphens."
    end

    return subdomain, nil
end

local function test_bamboohr_connection(credentials)
    -- Build auth header
    local auth_string = credentials.api_key .. ":x"
    local headers = {
        ["Authorization"] = "Basic " .. base64.encode(auth_string),
        ["Accept"] = "application/json"
    }

    local server_url = credentials.server_url or "https://api.bamboohr.com/api/gateway.php"

    -- Test with a simple endpoint - employee directory (basic GET endpoint)
    local test_url = server_url .. "/" .. credentials.subdomain .. "/v1/employees/directory"

    local response, err = http_client.get(test_url, {
        headers = headers,
        timeout = 15
    })

    if err then
        return nil, "Connection failed: " .. err
    end

    if response.status_code == 401 then
        return nil, "Authentication failed - check your API key"
    elseif response.status_code == 403 then
        return nil, "Access denied - API key may not have sufficient permissions"
    elseif response.status_code == 404 then
        return nil, "Invalid subdomain or API endpoint not found"
    elseif response.status_code == 200 then
        -- Success! Connection and auth work
        return {
            api_version = "v1",
            test_endpoint = "employees/directory",
            status = "connected"
        }, nil
    else
        -- Other errors might still indicate successful auth but different permissions
        if response.status_code >= 400 and response.status_code < 500 then
            return {
                api_version = "v1",
                test_endpoint = "basic connectivity",
                status = "auth_valid",
                note = "HTTP " .. response.status_code .. " but authentication successful"
            }, nil
        else
            return nil, "Server error: HTTP " .. response.status_code
        end
    end
end

local function normalize_and_validate(form_data)
    local subdomain = form_data.subdomain
    if not subdomain or subdomain == "" then
        return {
            success = false,
            error = "Company subdomain is required",
            field = "subdomain"
        }
    end

    if not form_data.api_key or form_data.api_key == "" then
        return {
            success = false,
            error = "API Key is required for BambooHR authentication",
            field = "api_key"
        }
    end

    -- Normalize subdomain
    local normalized_subdomain, subdomain_err = normalize_subdomain(subdomain)
    if subdomain_err then
        return {
            success = false,
            error = subdomain_err,
            field = "subdomain"
        }
    end

    local server_url = form_data.server_url
    if server_url and server_url ~= "" then
        -- Remove trailing slash
        server_url = server_url:gsub("/$", "")
        if not server_url:match("^https?://") then
            return {
                success = false,
                error = "Server URL must include protocol (http:// or https://)",
                field = "server_url"
            }
        end
    else
        server_url = "https://api.bamboohr.com/api/gateway.php"
    end

    local normalized_credentials = {
        subdomain = normalized_subdomain,
        api_key = form_data.api_key,
        server_url = server_url
    }

    -- Test the connection
    local test_result, test_err = test_bamboohr_connection(normalized_credentials)
    if test_err then
        return {
            success = false,
            error = "Failed to connect to BambooHR: " .. test_err,
            field = "connection"
        }
    end

    if test_result then
        normalized_credentials.server_info = {
            test_endpoint = test_result.test_endpoint,
            api_version = test_result.api_version,
            status = test_result.status
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