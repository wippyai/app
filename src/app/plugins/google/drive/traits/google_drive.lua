local json = require("json")
local drive_client = require("drive_client")

-- Constants
local FILE_CONTENT_FORMAT = "## Google Drive File: %s\n\n**Size:** %s  \n**Type:** %s  \n**ID:** `%s`\n%s\n### Content:\n\n```\n%s\n```"

local function handle_list_command(params)
    local connection = drive_client.open_connection()
    if not connection then
        return nil, "No Google connection found. Please check your Google OAuth connection status."
    end

    -- Try to get access token to check if connection is working
    local token_result, token_err = connection:get_access_token()
    if token_err or not token_result.success then
        local error_msg = token_err or token_result.error or "Unknown token error"
        return nil, string.format("Google connection token issue - %s. Please re-authenticate your Google connection.", error_msg)
    end

    local query = params.query
    local page_size = params.page_size or 10
    
    local result = drive_client.list_files(connection, query, page_size)
    if not result.success then
        return nil, "Failed to list Google Drive files: " .. (result.error or "Unknown error")
    end

    local files_data = result.data
    if not files_data.files or #files_data.files == 0 then
        return "No files found in Google Drive" .. (query and " for query: " .. query or "")
    end

    -- Format response
    local response_parts = {"## Google Drive Files\n"}
    
    if query then
        table.insert(response_parts, string.format("**Search Query:** %s\n\n", query))
    end

    for _, file in ipairs(files_data.files) do
        local size_str = drive_client.format_file_size(file.size)
        local type_str = drive_client.format_mime_type(file.mimeType)
        local icon = file.mimeType == "application/vnd.google-apps.folder" and "📁" or "📄"
        
        table.insert(response_parts, string.format(
            "%s **%s** (%s)\n- ID: `%s`\n- Type: %s\n- Size: %s\n%s%s\n\n",
            icon,
            file.name or "Unknown",
            type_str,
            file.id,
            file.mimeType,
            size_str,
            file.modifiedTime and ("- Modified: " .. file.modifiedTime .. "\n") or "",
            file.webViewLink and ("- Link: " .. file.webViewLink .. "\n") or ""
        ))
    end

    -- Add pagination info if available
    if files_data.nextPageToken then
        table.insert(response_parts, "**Note:** More files available. Use pagination to see additional results.\n")
    end

    table.insert(response_parts, string.format("**Showing %d files**", #files_data.files))
    
    return table.concat(response_parts)
end

local function handle_read_command(params)
    if not params.file_id then
        return nil, "file_id parameter is required for read command"
    end

    local connection = drive_client.open_connection()
    if not connection then
        return nil, "No Google connection found. Please check your Google OAuth connection status."
    end

    -- Try to get access token to check if connection is working
    local token_result, token_err = connection:get_access_token()
    if token_err or not token_result.success then
        local error_msg = token_err or token_result.error or "Unknown token error"
        return nil, string.format("Google connection token issue - %s. Please re-authenticate your Google connection.", error_msg)
    end

    -- First get file metadata
    local metadata_result = drive_client.get_file_metadata(connection, params.file_id)
    if not metadata_result.success then
        return nil, "Failed to get file metadata: " .. (metadata_result.error or "Unknown error")
    end

    local file_info = metadata_result.data
    
    -- Check if it's a folder
    if file_info.mimeType == "application/vnd.google-apps.folder" then
        return nil, "Cannot read content of a folder. Use list command to see folder contents."
    end

    -- Determine if we need to export or download
    local export_mime_type = drive_client.get_export_mime_type(file_info.mimeType)
    
    local content_result = drive_client.get_file_content(connection, params.file_id, export_mime_type)
    if not content_result.success then
        return nil, "Failed to read file content: " .. (content_result.error or "Unknown error")
    end

    local content = content_result.data or ""
    
    -- Truncate very long content
    if #content > 10000 then
        content = content:sub(1, 10000) .. "\n\n[Content truncated - showing first 10,000 characters]"
    end

    local size_str = drive_client.format_file_size(file_info.size)
    local type_str = drive_client.format_mime_type(file_info.mimeType)

    return string.format(
        FILE_CONTENT_FORMAT,
        file_info.name or "Unknown",
        size_str,
        type_str,
        params.file_id,
        file_info.webViewLink and ("**Link:** " .. file_info.webViewLink .. "\n") or "",
        content
    )
end

local function handle_create_command(params)
    if not params.name then
        return nil, "name parameter is required for create command"
    end
    
    local connection = drive_client.open_connection()
    if not connection then
        return nil, "No Google connection found. Please check your Google OAuth connection status."
    end
    
    -- Try to get access token to check if connection is working
    local token_result, token_err = connection:get_access_token()
    if token_err or not token_result.success then
        local error_msg = token_err or token_result.error or "Unknown token error"
        return nil, string.format("Google connection token issue - %s. Please re-authenticate your Google connection.", error_msg)
    end
    
    local result = drive_client.create_folder(connection, params.name, params.parent_id)
    if not result.success then
        return nil, "Failed to create folder: " .. (result.error or "Unknown error")
    end
    
    local folder = result.data
    
    return string.format(
        "## ✅ Folder Created Successfully!\n\n**Name:** %s\n**ID:** `%s`\n%s%s",
        folder.name or params.name,
        folder.id,
        folder.webViewLink and ("**Link:** " .. folder.webViewLink .. "\n") or "",
        params.parent_id and ("**Parent Folder ID:** " .. params.parent_id .. "\n") or "**Location:** Root of Google Drive\n"
    )
end

local function handle_write_command(params)
    if not params.name then
        return nil, "name parameter is required for write command"
    end
    
    if not params.content then
        return nil, "content parameter is required for write command"
    end
    
    local connection = drive_client.open_connection()
    if not connection then
        return nil, "No Google connection found. Please check your Google OAuth connection status."
    end
    
    -- Try to get access token to check if connection is working
    local token_result, token_err = connection:get_access_token()
    if token_err or not token_result.success then
        local error_msg = token_err or token_result.error or "Unknown token error"
        return nil, string.format("Google connection token issue - %s. Please re-authenticate your Google connection.", error_msg)
    end
    
    local mime_type = params.mime_type or "text/plain"
    
    local result = drive_client.upload_file(connection, params.name, params.content, mime_type, params.parent_id)
    if not result.success then
        return nil, "Failed to upload file: " .. (result.error or "Unknown error")
    end
    
    local file = result.data
    local size_str = drive_client.format_file_size(#params.content)
    
    return string.format(
        "## ✅ File Uploaded Successfully!\n\n**Name:** %s\n**ID:** `%s`\n**Size:** %s\n**Type:** %s\n%s%s",
        file.name or params.name,
        file.id,
        size_str,
        mime_type,
        file.webViewLink and ("**Link:** " .. file.webViewLink .. "\n") or "",
        params.parent_id and ("**Parent Folder ID:** " .. params.parent_id .. "\n") or "**Location:** Root of Google Drive\n"
    )
end

local function handle_get_info_command(params)
    if not params.file_id then
        return nil, "file_id parameter is required for get_info command"
    end
    
    local connection = drive_client.open_connection()
    if not connection then
        return nil, "No Google connection found. Please check your Google OAuth connection status."
    end
    
    -- Try to get access token to check if connection is working
    local token_result, token_err = connection:get_access_token()
    if token_err or not token_result.success then
        local error_msg = token_err or token_result.error or "Unknown token error"
        return nil, string.format("Google connection token issue - %s. Please re-authenticate your Google connection.", error_msg)
    end
    
    local result = drive_client.get_file_metadata(connection, params.file_id)
    if not result.success then
        return nil, "Failed to get file metadata: " .. (result.error or "Unknown error")
    end
    
    local file_info = result.data
    local size_str = drive_client.format_file_size(file_info.size)
    local type_str = drive_client.format_mime_type(file_info.mimeType)
    local icon = file_info.mimeType == "application/vnd.google-apps.folder" and "📁" or "📄"
    
    local response_parts = {}
    table.insert(response_parts, string.format("## %s File Information\n", icon))
    table.insert(response_parts, string.format("**Name:** %s\n", file_info.name or "Unknown"))
    table.insert(response_parts, string.format("**ID:** `%s`\n", params.file_id))
    table.insert(response_parts, string.format("**Type:** %s\n", type_str))
    table.insert(response_parts, string.format("**MIME Type:** %s\n", file_info.mimeType))
    table.insert(response_parts, string.format("**Size:** %s\n", size_str))
    
    if file_info.createdTime then
        table.insert(response_parts, string.format("**Created:** %s\n", file_info.createdTime))
    end
    
    if file_info.modifiedTime then
        table.insert(response_parts, string.format("**Modified:** %s\n", file_info.modifiedTime))
    end
    
    if file_info.webViewLink then
        table.insert(response_parts, string.format("**Link:** %s\n", file_info.webViewLink))
    end
    
    if file_info.parents and #file_info.parents > 0 then
        table.insert(response_parts, string.format("**Parent Folder ID:** %s\n", file_info.parents[1]))
    end
    
    return table.concat(response_parts)
end

local function handler(params)
    if not params or not params.command then
        return nil, "command parameter is required"
    end

    if params.command == "list" then
        return handle_list_command(params)
    elseif params.command == "read" then
        return handle_read_command(params)
    elseif params.command == "create" then
        return handle_create_command(params)
    elseif params.command == "write" then
        return handle_write_command(params)
    elseif params.command == "get_info" then
        return handle_get_info_command(params)
    else
        return nil, "Unknown command: " .. params.command .. ". Available commands: list, read, create, write, get_info"
    end
end

return { handler = handler }