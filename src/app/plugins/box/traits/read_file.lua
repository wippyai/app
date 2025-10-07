local box_client = require("box_client")
local json = require("json")

local function handle(args)
    args = args or {}

    -- Input validation
    if not args.file_id or args.file_id == "" then
        return "Error: file_id is required"
    end

    -- Helper function to format file size
    local function format_file_size(bytes)
        if not bytes or bytes == 0 then
            return "0 B"
        end

        local units = { "B", "KB", "MB", "GB", "TB" }
        local size = bytes
        local unit_index = 1

        while size >= 1024 and unit_index < #units do
            size = size / 1024
            unit_index = unit_index + 1
        end

        return string.format("%.1f %s", size, units[unit_index])
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

    -- Get text representation using the client method with enhanced error handling
    local result = box_client.get_text_representation(connection, args.file_id)

    if not result.success then
        -- Enhanced error reporting based on the specific failure
        local error_msg = result.error or "Unknown error"

        -- Check if it's a file access issue by trying to get basic file info
        if not result.file_info then
            local file_response = box_client.request(connection, "GET", "/files/" .. args.file_id .. "?fields=name,size,content_type")

            if not file_response then
                return "Error: Failed to connect to Box API. Please check your internet connection."
            end

            local error_details = "HTTP " .. (file_response.status_code or "unknown")

            if file_response.body then
                local ok, error_data = pcall(json.decode, file_response.body)
                if ok and error_data and error_data.message then
                    error_details = error_details .. " - " .. error_data.message
                elseif file_response.body then
                    error_details = error_details .. " - " .. file_response.body
                end
            end

            if file_response.status_code == 401 then
                return "Error: Box authentication expired. Please re-authenticate your Box connection. Details: " .. error_details
            elseif file_response.status_code == 403 then
                return "Error: Access denied to Box file. Check permissions for file ID: " .. args.file_id .. ". Details: " .. error_details
            elseif file_response.status_code == 404 then
                return "Error: Box file not found (file_id: " .. args.file_id .. "). The file may have been moved or deleted. Details: " .. error_details
            else
                return "Error: Failed to access Box file. Details: " .. error_details
            end
        end

        -- If we have file info but text extraction failed, show file details with specific error
        local file_info = result.file_info
        local filename = file_info.name or "unknown"
        local size = file_info.size or 0
        local content_type = file_info.content_type or "application/octet-stream"
        local size_str = format_file_size(size)

        local detailed_error = error_msg

        -- Provide specific guidance based on error type
        if error_msg:find("Text extraction not available for this file type") then
            detailed_error = "Text extraction is not supported for this file type (" .. content_type .. "). Box can only extract text from documents, PDFs, and some image files."
        elseif error_msg:find("Text extraction status:") then
            detailed_error = error_msg .. " Text extraction is still processing - this can take a few minutes for large files."
        elseif error_msg:find("Failed to download text content") then
            detailed_error = error_msg .. " The text extraction completed but couldn't be downloaded. Please try again."
        end

        return string.format(
            "## Box File: %s\n\n**Size:** %s  \n**Type:** %s  \n**ID:** `%s`\n\n**Error:** %s",
            filename, size_str, content_type, args.file_id, detailed_error
        )
    end

    -- Format successful response with extracted text
    local file_info = result.file_info
    local filename = file_info.name or "unknown"
    local size = file_info.size or 0
    local content_type = file_info.content_type or "application/octet-stream"
    local size_str = format_file_size(size)
    local extracted_text = result.text or "*No text content extracted*"

    -- Truncate very long text content
    if #extracted_text > 10000 then
        extracted_text = extracted_text:sub(1, 10000) .. "\n\n[Text truncated - showing first 10,000 characters]"
    end

    return string.format(
        "## Box File: %s\n\n**Size:** %s  \n**Type:** %s  \n**ID:** `%s`\n\n### Extracted Text:\n\n```\n%s\n```",
        filename, size_str, content_type, args.file_id, extracted_text
    )
end

return { handle = handle }