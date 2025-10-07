local json = require("json")
local sheets_client = require("sheets_client")

local function handle_get_info_command(params)
    if not params.spreadsheet_id then
        return nil, "spreadsheet_id parameter is required for get_info command"
    end

    local connection = sheets_client.open_connection()
    if not connection then
        return nil, "No Google connection found. Please check your Google OAuth connection status."
    end

    -- Try to get access token to check if connection is working
    local token_result, token_err = connection:get_access_token()
    if token_err or not token_result.success then
        local error_msg = token_err or token_result.error or "Unknown token error"
        return nil, string.format("Google connection token issue - %s. Please re-authenticate your Google connection.", error_msg)
    end

    local result = sheets_client.get_spreadsheet(connection, params.spreadsheet_id)
    if not result.success then
        return nil, "Failed to get spreadsheet info: " .. (result.error or "Unknown error")
    end

    local spreadsheet = result.data
    
    local response_parts = {"## Google Spreadsheet Info\n"}
    table.insert(response_parts, string.format("**Title:** %s\n", spreadsheet.properties.title or "Unknown"))
    table.insert(response_parts, string.format("**ID:** `%s`\n", params.spreadsheet_id))
    
    if spreadsheet.spreadsheetUrl then
        table.insert(response_parts, string.format("**URL:** %s\n", spreadsheet.spreadsheetUrl))
    end
    
    table.insert(response_parts, "\n### Sheets:\n")
    
    if spreadsheet.sheets then
        for _, sheet in ipairs(spreadsheet.sheets) do
            local sheet_props = sheet.properties
            table.insert(response_parts, string.format(
                "- **%s** (ID: %d) - %d rows × %d columns\n",
                sheet_props.title,
                sheet_props.sheetId,
                sheet_props.gridProperties.rowCount,
                sheet_props.gridProperties.columnCount
            ))
        end
    end

    return table.concat(response_parts)
end

local function handle_read_command(params)
    if not params.spreadsheet_id then
        return nil, "spreadsheet_id parameter is required for read command"
    end
    
    if not params.range then
        return nil, "range parameter is required for read command"
    end

    local connection = sheets_client.open_connection()
    if not connection then
        return nil, "No Google connection found. Please check your Google OAuth connection status."
    end

    -- Try to get access token to check if connection is working
    local token_result, token_err = connection:get_access_token()
    if token_err or not token_result.success then
        local error_msg = token_err or token_result.error or "Unknown token error"
        return nil, string.format("Google connection token issue - %s. Please re-authenticate your Google connection.", error_msg)
    end

    local value_render_option = params.value_render_option or "FORMATTED_VALUE"
    
    local result = sheets_client.get_values(connection, params.spreadsheet_id, params.range, value_render_option)
    if not result.success then
        return nil, "Failed to read spreadsheet data: " .. (result.error or "Unknown error")
    end

    local range_data = result.data
    
    if not range_data.values or #range_data.values == 0 then
        return string.format("No data found in range: %s", params.range)
    end

    return sheets_client.format_as_table(range_data)
end

local function handle_write_command(params)
    if not params.spreadsheet_id then
        return nil, "spreadsheet_id parameter is required for write command"
    end
    
    if not params.range then
        return nil, "range parameter is required for write command"
    end
    
    if not params.values then
        return nil, "values parameter is required for write command"
    end

    local connection = sheets_client.open_connection()
    if not connection then
        return nil, "No Google connection found. Please check your Google OAuth connection status."
    end

    -- Try to get access token to check if connection is working
    local token_result, token_err = connection:get_access_token()
    if token_err or not token_result.success then
        local error_msg = token_err or token_result.error or "Unknown token error"
        return nil, string.format("Google connection token issue - %s. Please re-authenticate your Google connection.", error_msg)
    end

    local value_input_option = params.value_input_option or "USER_ENTERED"
    
    local result = sheets_client.update_values(connection, params.spreadsheet_id, params.range, params.values, value_input_option)
    if not result.success then
        return nil, "Failed to write spreadsheet data: " .. (result.error or "Unknown error")
    end

    local update_data = result.data
    return string.format(
        "Successfully updated %d cells in range %s. Updated %d rows and %d columns.",
        update_data.updatedCells or 0,
        update_data.updatedRange or params.range,
        update_data.updatedRows or 0,
        update_data.updatedColumns or 0
    )
end

local function handle_append_command(params)
    if not params.spreadsheet_id then
        return nil, "spreadsheet_id parameter is required for append command"
    end
    
    if not params.range then
        return nil, "range parameter is required for append command"
    end
    
    if not params.values then
        return nil, "values parameter is required for append command"
    end

    local connection = sheets_client.open_connection()
    if not connection then
        return nil, "No Google connection found. Please check your Google OAuth connection status."
    end

    -- Try to get access token to check if connection is working
    local token_result, token_err = connection:get_access_token()
    if token_err or not token_result.success then
        local error_msg = token_err or token_result.error or "Unknown token error"
        return nil, string.format("Google connection token issue - %s. Please re-authenticate your Google connection.", error_msg)
    end

    local value_input_option = params.value_input_option or "USER_ENTERED"
    
    local result = sheets_client.append_values(connection, params.spreadsheet_id, params.range, params.values, value_input_option)
    if not result.success then
        return nil, "Failed to append spreadsheet data: " .. (result.error or "Unknown error")
    end

    local update_data = result.data.updates
    return string.format(
        "Successfully appended %d rows to range %s. Updated range: %s",
        #params.values,
        params.range,
        update_data.updatedRange or "unknown"
    )
end

local function handle_clear_command(params)
    if not params.spreadsheet_id then
        return nil, "spreadsheet_id parameter is required for clear command"
    end
    
    if not params.range then
        return nil, "range parameter is required for clear command"
    end

    local connection = sheets_client.open_connection()
    if not connection then
        return nil, "No Google connection found. Please check your Google OAuth connection status."
    end

    -- Try to get access token to check if connection is working
    local token_result, token_err = connection:get_access_token()
    if token_err or not token_result.success then
        local error_msg = token_err or token_result.error or "Unknown token error"
        return nil, string.format("Google connection token issue - %s. Please re-authenticate your Google connection.", error_msg)
    end

    local result = sheets_client.clear_values(connection, params.spreadsheet_id, params.range)
    if not result.success then
        return nil, "Failed to clear spreadsheet data: " .. (result.error or "Unknown error")
    end

    return string.format("Successfully cleared range: %s", params.range)
end

local function handle_create_command(params)
    if not params.title then
        return nil, "title parameter is required for create command"
    end

    local connection = sheets_client.open_connection()
    if not connection then
        return nil, "No Google connection found. Please check your Google OAuth connection status."
    end

    -- Try to get access token to check if connection is working
    local token_result, token_err = connection:get_access_token()
    if token_err or not token_result.success then
        local error_msg = token_err or token_result.error or "Unknown token error"
        return nil, string.format("Google connection token issue - %s. Please re-authenticate your Google connection.", error_msg)
    end

    local result = sheets_client.create_spreadsheet(connection, params.title)
    if not result.success then
        return nil, "Failed to create spreadsheet: " .. (result.error or "Unknown error")
    end

    local spreadsheet = result.data
    return string.format(
        "Successfully created new spreadsheet!\n\n**Title:** %s\n**ID:** `%s`\n**URL:** %s",
        spreadsheet.properties.title,
        spreadsheet.spreadsheetId,
        spreadsheet.spreadsheetUrl or "N/A"
    )
end

local function handle_list_command(params)
    local connection = sheets_client.open_connection()
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
    
    -- List Google Sheets files by filtering for Google Sheets MIME type
    local query = "mimeType='application/vnd.google-apps.spreadsheet'"
    local result = sheets_client.list_spreadsheets(connection, query, page_size)
    if not result.success then
        return nil, "Failed to list Google Spreadsheets: " .. (result.error or "Unknown error")
    end
    
    local files_data = result.data
    if not files_data.files or #files_data.files == 0 then
        return "No Google Spreadsheets found in your Google Drive."
    end
    
    -- Format response
    local response_parts = {"## 📊 Google Spreadsheets\n\n"}
    
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
        table.insert(response_parts, "**Note:** More spreadsheets available. Use pagination to see additional results.\n")
    end
    
    table.insert(response_parts, string.format("**Showing %d spreadsheets**", #files_data.files))
    
    return table.concat(response_parts)
end

local function handler(params)
    if not params or not params.command then
        return nil, "command parameter is required"
    end

    if params.command == "get_info" then
        return handle_get_info_command(params)
    elseif params.command == "read" then
        return handle_read_command(params)
    elseif params.command == "write" then
        return handle_write_command(params)
    elseif params.command == "append" then
        return handle_append_command(params)
    elseif params.command == "clear" then
        return handle_clear_command(params)
    elseif params.command == "create" then
        return handle_create_command(params)
    elseif params.command == "list" then
        return handle_list_command(params)
    else
        return nil, "Unknown command: " .. params.command .. ". Available commands: get_info, read, write, append, clear, create, list"
    end
end

return { handler = handler }