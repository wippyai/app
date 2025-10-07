-- Box API client library for OAuth connection discovery and HTTP requests
-- Provides interface for opening Box OAuth connections and making authenticated API requests

local http_client = require("http_client")
local json = require("json")
local component = require("component")

local box_client = {}

-- Open a Box OAuth connection using component library
-- Returns the connection object if found, nil otherwise
function box_client.open_connection()
    -- Search for Box OAuth connections using component metadata
    local connection, err = component.open_by_meta(
        {provider = "box"},
        component.ACCESS.READ,
        "userspace.oauth:oauth_connection_contract"
    )

    if err then
        return nil
    end

    return connection
end

-- Make an authenticated HTTP request to Box API
-- @param connection: Box OAuth connection component
-- @param method: HTTP method (GET, POST, etc.)
-- @param endpoint: Box API endpoint (without base URL)
-- @param data: Optional request body data
-- @param headers: Optional additional headers
-- @return response object or nil on error
function box_client.request(connection, method, endpoint, data, headers)
    if not connection then
        error("Box connection is required")
    end

    -- Get access token from OAuth connection
    local token_result, token_err = connection:get_access_token()
    if token_err or not token_result.success then
        error("Failed to get access token: " .. (token_err or token_result.error or "Unknown error"))
    end

    local base_url = "https://api.box.com/2.0"
    local url = base_url .. endpoint

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

-- Make a raw HTTP request (for Box representations URLs that are not API endpoints)
-- @param connection: Box OAuth connection component
-- @param method: HTTP method
-- @param url: Full URL to request
-- @param headers: Optional additional headers
-- @return response object or nil on error
function box_client.raw_request(connection, method, url, headers)
    if not connection then
        error("Box connection is required")
    end

    -- Get access token from OAuth connection
    local token_result, token_err = connection:get_access_token()
    if token_err or not token_result.success then
        error("Failed to get access token: " .. (token_err or token_result.error or "Unknown error"))
    end

    local request_headers = {
        ["Authorization"] = token_result.token_type .. " " .. token_result.access_token
    }

    -- Add any additional headers
    if headers then
        for k, v in pairs(headers) do
            request_headers[k] = v
        end
    end

    return http_client.request(method, url, {headers = request_headers})
end

-- Get text representation of a file using Box's text extraction
-- @param connection: Box OAuth connection component
-- @param file_id: Box file ID
-- @return table with success, text, error, and file_info fields
function box_client.get_text_representation(connection, file_id)
    if not connection then
        return {success = false, error = "Box connection is required"}
    end

    if not file_id or file_id == "" then
        return {success = false, error = "file_id is required"}
    end

    -- First get basic file info
    local file_response = box_client.request(connection, "GET", "/files/" .. file_id .. "?fields=name,size,content_type")
    if not file_response or file_response.status_code ~= 200 then
        return {
            success = false,
            error = "Failed to get file info (status: " .. (file_response and file_response.status_code or "no response") .. ")"
        }
    end

    local file_info = json.decode(file_response.body)

    -- Request text representation with x-rep-hints header
    local repr_response = box_client.request(connection, "GET", "/files/" .. file_id .. "?fields=representations", nil, {
        ["x-rep-hints"] = "[extracted_text]"
    })

    if not repr_response or repr_response.status_code ~= 200 then
        return {
            success = false,
            error = "Text extraction not available - failed to request representation (status: " ..
                   (repr_response and repr_response.status_code or "no response") .. ")",
            file_info = file_info
        }
    end

    local repr_data = json.decode(repr_response.body)

    -- Check if representations are available
    if not repr_data.representations or not repr_data.representations.entries then
        return {
            success = false,
            error = "Text extraction not available for this file type",
            file_info = file_info
        }
    end

    -- Find the extracted_text representation
    local text_repr = nil
    for _, repr in ipairs(repr_data.representations.entries) do
        if repr.representation == "extracted_text" then
            text_repr = repr
            break
        end
    end

    if not text_repr then
        return {
            success = false,
            error = "Text extraction not available for this file type",
            file_info = file_info
        }
    end

    -- Check if text representation is ready
    if not text_repr.status or text_repr.status.state ~= "success" then
        local status = "unknown"
        if text_repr.status and text_repr.status.state then
            status = text_repr.status.state
        end
        return {
            success = false,
            error = "Text extraction status: " .. status .. " - please try again later",
            file_info = file_info
        }
    end

    -- Download the text content using url_template
    if not text_repr.content or not text_repr.content.url_template then
        return {
            success = false,
            error = "Text extraction URL not available",
            file_info = file_info
        }
    end

    local text_url = text_repr.content.url_template:gsub("{%+asset_path}", "")
    local text_response = box_client.raw_request(connection, "GET", text_url)

    if not text_response or text_response.status_code ~= 200 then
        return {
            success = false,
            error = "Failed to download text content (status: " ..
                   (text_response and text_response.status_code or "no response") .. ")",
            file_info = file_info
        }
    end

    return {
        success = true,
        text = text_response.body or "",
        file_info = file_info
    }
end

-- Get current user information
-- @param connection: Box OAuth connection component
-- @return user info object or nil on error
function box_client.get_user_info(connection)
    local response = box_client.request(connection, "GET", "/users/me")
    if response and response.status_code == 200 then
        return json.decode(response.body)
    end
    return nil
end

-- List files and folders in a directory
-- @param connection: Box OAuth connection component
-- @param folder_id: Box folder ID (default: "0" for root)
-- @return folder contents or nil on error
function box_client.list_folder(connection, folder_id)
    folder_id = folder_id or "0"
    local endpoint = "/folders/" .. folder_id .. "/items"
    local response = box_client.request(connection, "GET", endpoint)

    if response and response.status_code == 200 then
        return json.decode(response.body)
    end
    return nil
end

-- HTTP method convenience functions for Box traits compatibility
-- These functions expect component_id, path, and optional parameters

function box_client.get(component_id, path, query)
    local connection = box_client.open_connection()
    if not connection then
        return {
            success = false,
            error = "No Box connection found"
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

    local response = box_client.request(connection, "GET", endpoint)
    if response and response.status_code >= 200 and response.status_code < 300 then
        local data = nil
        if response.body and response.body ~= "" then
            local ok, decoded = pcall(json.decode, response.body)
            if ok then
                data = decoded
            else
                data = response.body
            end
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

function box_client.post(component_id, path, body, query)
    local connection = box_client.open_connection()
    if not connection then
        return {
            success = false,
            error = "No Box connection found"
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

    local response = box_client.request(connection, "POST", endpoint, body)
    if response and response.status_code >= 200 and response.status_code < 300 then
        local data = nil
        if response.body and response.body ~= "" then
            local ok, decoded = pcall(json.decode, response.body)
            if ok then
                data = decoded
            else
                data = response.body
            end
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

function box_client.put(component_id, path, body, query)
    local connection = box_client.open_connection()
    if not connection then
        return {
            success = false,
            error = "No Box connection found"
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

    local response = box_client.request(connection, "PUT", endpoint, body)
    if response and response.status_code >= 200 and response.status_code < 300 then
        local data = nil
        if response.body and response.body ~= "" then
            local ok, decoded = pcall(json.decode, response.body)
            if ok then
                data = decoded
            else
                data = response.body
            end
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

function box_client.delete(component_id, path, query)
    local connection = box_client.open_connection()
    if not connection then
        return {
            success = false,
            error = "No Box connection found"
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

    local response = box_client.request(connection, "DELETE", endpoint)
    if response and response.status_code >= 200 and response.status_code < 300 then
        local data = nil
        if response.body and response.body ~= "" then
            local ok, decoded = pcall(json.decode, response.body)
            if ok then
                data = decoded
            else
                data = response.body
            end
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

return box_client