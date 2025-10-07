local box_client = require("box_client")
local json = require("json")

local function handle(args)
    args = args or {}
    
    -- Input validation
    local folder_id = args.folder_id or "0"  -- "0" is Box root folder
    local limit = args.limit or 20
    
    if limit < 1 or limit > 100 then
        return "Error: Limit must be between 1 and 100"
    end
    
    -- Open Box connection using the client library
    local connection = box_client.open_connection()
    if not connection then
        return "Error: No Box connection found. Please check your Box OAuth connection status."
    end

    -- Try to get access token to check if connection is working
    local token_result, token_err = connection:get_access_token()
    if token_err or not token_result.success then
        local error_msg = token_err or token_result.error or "Unknown token error"
        return string.format("Error: Box connection token issue - %s. Please re-authenticate your Box connection.", error_msg)
    end

    -- List folder items using the client library with enhanced error handling
    local box_data = box_client.list_folder(connection, folder_id)
    if not box_data then
        -- Get more detailed error by making the request directly
        local response = box_client.request(connection, "GET", "/folders/" .. folder_id .. "/items")

        if not response then
            return "Error: Failed to connect to Box API. Please check your internet connection."
        end

        local error_details = "HTTP " .. (response.status_code or "unknown")

        if response.body then
            local ok, error_data = pcall(json.decode, response.body)
            if ok and error_data and error_data.message then
                error_details = error_details .. " - " .. error_data.message
            elseif response.body then
                error_details = error_details .. " - " .. response.body
            end
        end

        if response.status_code == 401 then
            return "Error: Box authentication expired. Please re-authenticate your Box connection. Details: " .. error_details
        elseif response.status_code == 403 then
            return "Error: Access denied to Box folder. Check permissions. Details: " .. error_details
        elseif response.status_code == 404 then
            return "Error: Box folder not found (folder_id: " .. folder_id .. "). Details: " .. error_details
        else
            return "Error: Failed to list Box files. Details: " .. error_details
        end
    end
    
    -- Format response for user
    local response_parts = {"## Box Files\n"}
    
    if not box_data.entries or #box_data.entries == 0 then
        table.insert(response_parts, "No files found in this folder.\n")
        return table.concat(response_parts)
    end
    
    -- Add folder info if available
    if box_data.name and box_data.name ~= "All Files" then
        table.insert(response_parts, string.format("**Folder:** %s\n\n", box_data.name))
    end
    
    -- Helper function to format file size
    local function format_file_size(bytes)
        if not bytes or bytes == 0 then
            return "0 B"
        end
        
        local units = {"B", "KB", "MB", "GB", "TB"}
        local size = bytes
        local unit_index = 1
        
        while size >= 1024 and unit_index < #units do
            size = size / 1024
            unit_index = unit_index + 1
        end
        
        return string.format("%.1f %s", size, units[unit_index])
    end

    -- List files and folders
    for _, item in ipairs(box_data.entries) do
        local size_str = format_file_size(item.size)
        local type_icon = item.type == "folder" and "📁" or "📄"
        
        table.insert(response_parts, string.format(
            "%s **%s** (%s)\n- ID: `%s`\n- Type: %s\n%s\n\n",
            type_icon,
            item.name or "Unknown",
            size_str,
            item.id,
            item.type,
            item.modified_at and ("- Modified: " .. item.modified_at) or ""
        ))
    end
    
    -- Add pagination info if available
    if box_data.total_count and box_data.total_count > limit then
        table.insert(response_parts, string.format(
            "**Showing %d of %d items** • Use different folder_id to browse folders\n",
            #box_data.entries,
            box_data.total_count
        ))
    else
        table.insert(response_parts, string.format("**Showing all %d items**\n", #box_data.entries))
    end
    
    return table.concat(response_parts)
end

return { handle = handle }