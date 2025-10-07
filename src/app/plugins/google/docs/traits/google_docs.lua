local json = require("json")
local docs_client = require("docs_client")

local function handle_create_command(params)
    if not params.title then
        return nil, "title parameter is required for create command"
    end

    local connection = docs_client.open_connection()
    if not connection then
        return nil, "No Google connection found. Please check your Google OAuth connection status."
    end

    -- Try to get access token to check if connection is working
    local token_result, token_err = connection:get_access_token()
    if token_err or not token_result.success then
        local error_msg = token_err or token_result.error or "Unknown token error"
        return nil, string.format("Google connection token issue - %s. Please re-authenticate your Google connection.", error_msg)
    end

    local result
    local document
    
    -- Check if initial content is provided
    if params.content and params.content ~= "" then
        -- Create document with initial content using the specialized function
        result = docs_client.create_document_with_content(connection, params.title, params.content)
        if not result.success then
            return nil, "Failed to create Google Doc with initial content: " .. (result.error or "Unknown error")
        end
        document = result.data
    else
        -- Create empty document
        result = docs_client.create_document(connection, params.title)
        if not result.success then
            return nil, "Failed to create Google Doc: " .. (result.error or "Unknown error")
        end
        document = result.data
    end

    local response_parts = {}
    table.insert(response_parts, "## ✅ Google Doc Created Successfully!\n")
    table.insert(response_parts, string.format("**Title:** %s\n", document.title or params.title))
    table.insert(response_parts, string.format("**Document ID:** `%s`\n", document.documentId))
    
    if document.revisionId then
        table.insert(response_parts, string.format("**Revision ID:** %s\n", document.revisionId))
    end

    -- If content was provided and successfully added
    if params.content and params.content ~= "" then
        table.insert(response_parts, string.format("\n**Initial Content Added:** %d characters\n", #params.content))
    end

    -- Add instructions for accessing the document
    table.insert(response_parts, "\n**Next Steps:**\n")
    table.insert(response_parts, "- Use the Document ID above to write additional content\n")
    table.insert(response_parts, "- The document is now available in your Google Drive\n")
    table.insert(response_parts, "- You can access it directly through Google Docs\n")

    return table.concat(response_parts)
end

local function handle_write_command(params)
    if not params.document_id then
        return nil, "document_id parameter is required for write command"
    end
    
    if not params.content then
        return nil, "content parameter is required for write command"
    end

    local connection = docs_client.open_connection()
    if not connection then
        return nil, "No Google connection found. Please check your Google OAuth connection status."
    end

    -- Try to get access token to check if connection is working
    local token_result, token_err = connection:get_access_token()
    if token_err or not token_result.success then
        local error_msg = token_err or token_result.error or "Unknown token error"
        return nil, string.format("Google connection token issue - %s. Please re-authenticate your Google connection.", error_msg)
    end

    -- Get document info first to verify it exists and get current state
    local doc_result = docs_client.get_document(connection, params.document_id)
    if not doc_result.success then
        return nil, "Failed to access document: " .. (doc_result.error or "Unknown error") .. ". Please verify the document ID is correct and you have access to it."
    end

    local document = doc_result.data
    local append_mode = params.append
    if append_mode == nil then
        append_mode = true  -- Default to append mode
    end

    -- Write content to the document
    local result = docs_client.write_content(connection, params.document_id, params.content, append_mode)
    if not result.success then
        return nil, "Failed to write content to Google Doc: " .. (result.error or "Unknown error")
    end

    local response_parts = {}
    table.insert(response_parts, "## ✅ Content Written Successfully!\n")
    table.insert(response_parts, string.format("**Document:** %s\n", document.title or "Unknown"))
    table.insert(response_parts, string.format("**Document ID:** `%s`\n", params.document_id))
    table.insert(response_parts, string.format("**Operation:** %s content\n", append_mode and "Appended" or "Replaced"))
    table.insert(response_parts, string.format("**Content Length:** %d characters\n", #params.content))

    -- Show content preview
    local preview = params.content:sub(1, 100)
    if #params.content > 100 then
        preview = preview .. "..."
    end
    table.insert(response_parts, string.format("\n**Content Preview:**\n%s\n", preview))

    -- Add helpful information
    table.insert(response_parts, "\n**Result:**\n")
    if append_mode then
        table.insert(response_parts, "- Content has been added to the end of the document\n")
    else
        table.insert(response_parts, "- All previous content has been replaced\n")
    end
    table.insert(response_parts, "- Changes are automatically saved in Google Docs\n")
    table.insert(response_parts, "- Document is ready for viewing or further editing\n")

    return table.concat(response_parts)
end

local function handle_read_command(params)
    if not params.document_id then
        return nil, "document_id parameter is required for read command"
    end
    
    local connection = docs_client.open_connection()
    if not connection then
        return nil, "No Google connection found. Please check your Google OAuth connection status."
    end
    
    -- Try to get access token to check if connection is working
    local token_result, token_err = connection:get_access_token()
    if token_err or not token_result.success then
        local error_msg = token_err or token_result.error or "Unknown token error"
        return nil, string.format("Google connection token issue - %s. Please re-authenticate your Google connection.", error_msg)
    end
    
    local result = docs_client.get_document(connection, params.document_id)
    if not result.success then
        return nil, "Failed to read document: " .. (result.error or "Unknown error") .. ". Please verify the document ID is correct and you have access to it."
    end
    
    local document = result.data
    
    -- Extract document content
    local content_result = docs_client.extract_text_content(document)
    if not content_result.success then
        return nil, "Failed to extract document content: " .. (content_result.error or "Unknown error")
    end
    
    local content = content_result.data or ""
    
    -- Truncate very long content
    if #content > 10000 then
        content = content:sub(1, 10000) .. "\n\n[Content truncated - showing first 10,000 characters]"
    end
    
    local response_parts = {}
    table.insert(response_parts, "## 📄 Google Document Content\n")
    table.insert(response_parts, string.format("**Title:** %s\n", document.title or "Unknown"))
    table.insert(response_parts, string.format("**Document ID:** `%s`\n", params.document_id))
    
    if document.revisionId then
        table.insert(response_parts, string.format("**Revision ID:** %s\n", document.revisionId))
    end
    
    table.insert(response_parts, string.format("**Content Length:** %d characters\n\n", #(content_result.data or "")))
    table.insert(response_parts, "### Content:\n\n")
    table.insert(response_parts, content)
    
    return table.concat(response_parts)
end

local function handle_get_info_command(params)
    if not params.document_id then
        return nil, "document_id parameter is required for get_info command"
    end
    
    local connection = docs_client.open_connection()
    if not connection then
        return nil, "No Google connection found. Please check your Google OAuth connection status."
    end
    
    -- Try to get access token to check if connection is working
    local token_result, token_err = connection:get_access_token()
    if token_err or not token_result.success then
        local error_msg = token_err or token_result.error or "Unknown token error"
        return nil, string.format("Google connection token issue - %s. Please re-authenticate your Google connection.", error_msg)
    end
    
    local result = docs_client.get_document(connection, params.document_id)
    if not result.success then
        return nil, "Failed to get document info: " .. (result.error or "Unknown error") .. ". Please verify the document ID is correct and you have access to it."
    end
    
    local document = result.data
    
    local response_parts = {}
    table.insert(response_parts, "## 📄 Document Information\n")
    table.insert(response_parts, string.format("**Title:** %s\n", document.title or "Unknown"))
    table.insert(response_parts, string.format("**Document ID:** `%s`\n", params.document_id))
    
    if document.revisionId then
        table.insert(response_parts, string.format("**Revision ID:** %s\n", document.revisionId))
    end
    
    -- Extract and count content
    local content_result = docs_client.extract_text_content(document)
    if content_result.success then
        local content = content_result.data or ""
        table.insert(response_parts, string.format("**Content Length:** %d characters\n", #content))
        
        -- Count approximate word count
        local word_count = 0
        for word in content:gmatch("%S+") do
            word_count = word_count + 1
        end
        table.insert(response_parts, string.format("**Approximate Word Count:** %d words\n", word_count))
    end
    
    -- Get sharing/access info if available
    table.insert(response_parts, "\n**Access:**\n")
    table.insert(response_parts, "- Document accessible via Google Docs\n")
    table.insert(response_parts, "- You have read/write permissions\n")
    
    return table.concat(response_parts)
end

local function handle_list_command(params)
    local connection = docs_client.open_connection()
    if not connection then
        return nil, "No Google connection found. Please check your Google OAuth connection status."
    end
    
    -- Try to get access token to check if connection is working
    local token_result, token_err = connection:get_access_token()
    if token_err or not token_result.success then
        local error_msg = token_err or token_result.error or "Unknown token error"
        return nil, string.format("Google connection token issue - %s. Please re-authenticate your Google connection.", error_msg)
    end
    
    local page_size = params.page_size or 10
    
    -- List Google Docs files by filtering for Google Docs MIME type
    local query = "mimeType='application/vnd.google-apps.document'"
    local result = docs_client.list_documents(connection, query, page_size)
    if not result.success then
        return nil, "Failed to list Google Documents: " .. (result.error or "Unknown error")
    end
    
    local files_data = result.data
    if not files_data.files or #files_data.files == 0 then
        return "No Google Documents found in your Google Drive."
    end
    
    -- Format response
    local response_parts = {"## 📄 Google Documents\n\n"}
    
    for _, file in ipairs(files_data.files) do
        table.insert(response_parts, string.format(
            "**%s**\n- ID: `%s`\n- Modified: %s\n%s\n",
            file.name or "Unknown",
            file.id,
            file.modifiedTime or "Unknown",
            file.webViewLink and ("- Link: " .. file.webViewLink .. "\n") or ""
        ))
    end
    
    -- Add pagination info if available
    if files_data.nextPageToken then
        table.insert(response_parts, "**Note:** More documents available. Use pagination to see additional results.\n")
    end
    
    table.insert(response_parts, string.format("**Showing %d documents**", #files_data.files))
    
    return table.concat(response_parts)
end

local function handler(params)
    if not params or not params.command then
        return nil, "command parameter is required"
    end

    if params.command == "create" then
        return handle_create_command(params)
    elseif params.command == "write" then
        return handle_write_command(params)
    elseif params.command == "read" then
        return handle_read_command(params)
    elseif params.command == "get_info" then
        return handle_get_info_command(params)
    elseif params.command == "list" then
        return handle_list_command(params)
    else
        return nil, "Unknown command: " .. params.command .. ". Available commands: create, write, read, get_info, list"
    end
end

return { handler = handler }