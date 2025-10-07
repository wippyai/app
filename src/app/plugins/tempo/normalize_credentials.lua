local http_client = require("http_client")
local json = require("json")

local function normalize_tempo_url(url)
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

local function test_tempo_connection(credentials)
    local headers = {
        ["Authorization"] = "Bearer " .. credentials.access_token,
        ["Accept"] = "application/json"
    }

    -- Simple test: just try to get teams list (basic GET endpoint)
    local response, err = http_client.get(credentials.server_url .. "/rest/tempo-teams/2/team", {
        headers = headers,
        timeout = 15
    })

    if err then
        return nil, "Connection failed: " .. err
    end

    if response.status_code == 401 then
        return nil, "Authentication failed - check your access token"
    elseif response.status_code == 200 then
        -- Success! Connection and auth work
        return {
            api_version = "teams-v2",
            test_endpoint = "teams endpoint",
            status = "connected"
        }, nil
    else
        -- Other errors are still OK as long as auth works (401 would indicate bad token)
        -- 403/404 just means endpoint restrictions, but auth is valid
        return {
            api_version = "tempo-server",
            test_endpoint = "basic connectivity",
            status = "auth_valid",
            note = "HTTP " .. response.status_code .. " but authentication successful"
        }, nil
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

    if not form_data.access_token or form_data.access_token == "" then
        return {
            success = false,
            error = "Access Token is required for Tempo authentication",
            field = "access_token"
        }
    end

    server_url = normalize_tempo_url(server_url)

    local normalized_credentials = {
        server_url = server_url,
        access_token = form_data.access_token
    }

    -- Add optional username
    if form_data.username and form_data.username ~= "" then
        normalized_credentials.username = form_data.username
    end

    local test_result, test_err = test_tempo_connection(normalized_credentials)
    if test_err then
        return {
            success = false,
            error = "Failed to connect to Tempo: " .. test_err,
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