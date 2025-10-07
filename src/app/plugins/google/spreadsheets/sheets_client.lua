-- Google Sheets API client library with comprehensive spreadsheet operations
-- Extends base Google client with Sheets-specific functionality

local json = require("json")
local google_client = require("google_client")

local sheets_client = {}

-- Base Google Sheets API URL
local SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets"

-- Open a Google OAuth connection (delegate to base client)
function sheets_client.open_connection()
    return google_client.open_connection()
end

-- Get spreadsheet metadata
-- @param connection: Google OAuth connection component
-- @param spreadsheet_id: Google Sheets spreadsheet ID
-- @return spreadsheet metadata or error response
function sheets_client.get_spreadsheet(connection, spreadsheet_id)
    if not connection then
        return {success = false, error = "Google connection is required"}
    end

    if not spreadsheet_id then
        return {success = false, error = "Spreadsheet ID is required"}
    end

    local endpoint = SHEETS_API_BASE .. "/" .. spreadsheet_id
    local response = google_client.request(connection, "GET", endpoint)

    if response and response.status_code == 200 then
        return {
            success = true,
            data = json.decode(response.body)
        }
    else
        return {
            success = false,
            error = response and response.body or "Request failed",
            status_code = response and response.status_code or 0
        }
    end
end

-- Read values from a range
-- @param connection: Google OAuth connection component
-- @param spreadsheet_id: Google Sheets spreadsheet ID
-- @param range: A1 notation range (e.g., "Sheet1!A1:B10")
-- @param value_render_option: How values should be rendered (FORMATTED_VALUE, UNFORMATTED_VALUE, FORMULA)
-- @return range values or error response
function sheets_client.get_values(connection, spreadsheet_id, range, value_render_option)
    if not connection then
        return {success = false, error = "Google connection is required"}
    end

    if not spreadsheet_id then
        return {success = false, error = "Spreadsheet ID is required"}
    end

    if not range then
        return {success = false, error = "Range is required"}
    end

    value_render_option = value_render_option or "FORMATTED_VALUE"

    local endpoint = SHEETS_API_BASE .. "/" .. spreadsheet_id .. "/values/" .. range
    endpoint = endpoint .. "?valueRenderOption=" .. value_render_option

    local response = google_client.request(connection, "GET", endpoint)

    if response and response.status_code == 200 then
        return {
            success = true,
            data = json.decode(response.body)
        }
    else
        return {
            success = false,
            error = response and response.body or "Request failed",
            status_code = response and response.status_code or 0
        }
    end
end

-- Write values to a range
-- @param connection: Google OAuth connection component
-- @param spreadsheet_id: Google Sheets spreadsheet ID
-- @param range: A1 notation range (e.g., "Sheet1!A1:B10")
-- @param values: 2D array of values to write
-- @param value_input_option: How values should be interpreted (RAW, USER_ENTERED)
-- @return update response or error response
function sheets_client.update_values(connection, spreadsheet_id, range, values, value_input_option)
    if not connection then
        return {success = false, error = "Google connection is required"}
    end

    if not spreadsheet_id then
        return {success = false, error = "Spreadsheet ID is required"}
    end

    if not range then
        return {success = false, error = "Range is required"}
    end

    if not values then
        return {success = false, error = "Values are required"}
    end

    value_input_option = value_input_option or "USER_ENTERED"

    local endpoint = SHEETS_API_BASE .. "/" .. spreadsheet_id .. "/values/" .. range
    endpoint = endpoint .. "?valueInputOption=" .. value_input_option

    local request_body = {
        values = values
    }

    local response = google_client.request(connection, "PUT", endpoint, request_body)

    if response and response.status_code == 200 then
        return {
            success = true,
            data = json.decode(response.body)
        }
    else
        return {
            success = false,
            error = response and response.body or "Request failed",
            status_code = response and response.status_code or 0
        }
    end
end

-- Append values to a range
-- @param connection: Google OAuth connection component
-- @param spreadsheet_id: Google Sheets spreadsheet ID
-- @param range: A1 notation range (e.g., "Sheet1!A:B")
-- @param values: 2D array of values to append
-- @param value_input_option: How values should be interpreted (RAW, USER_ENTERED)
-- @return append response or error response
function sheets_client.append_values(connection, spreadsheet_id, range, values, value_input_option)
    if not connection then
        return {success = false, error = "Google connection is required"}
    end

    if not spreadsheet_id then
        return {success = false, error = "Spreadsheet ID is required"}
    end

    if not range then
        return {success = false, error = "Range is required"}
    end

    if not values then
        return {success = false, error = "Values are required"}
    end

    value_input_option = value_input_option or "USER_ENTERED"

    local endpoint = SHEETS_API_BASE .. "/" .. spreadsheet_id .. "/values/" .. range .. ":append"
    endpoint = endpoint .. "?valueInputOption=" .. value_input_option

    local request_body = {
        values = values
    }

    local response = google_client.request(connection, "POST", endpoint, request_body)

    if response and response.status_code == 200 then
        return {
            success = true,
            data = json.decode(response.body)
        }
    else
        return {
            success = false,
            error = response and response.body or "Request failed",
            status_code = response and response.status_code or 0
        }
    end
end

-- Clear values from a range
-- @param connection: Google OAuth connection component
-- @param spreadsheet_id: Google Sheets spreadsheet ID
-- @param range: A1 notation range (e.g., "Sheet1!A1:B10")
-- @return clear response or error response
function sheets_client.clear_values(connection, spreadsheet_id, range)
    if not connection then
        return {success = false, error = "Google connection is required"}
    end

    if not spreadsheet_id then
        return {success = false, error = "Spreadsheet ID is required"}
    end

    if not range then
        return {success = false, error = "Range is required"}
    end

    local endpoint = SHEETS_API_BASE .. "/" .. spreadsheet_id .. "/values/" .. range .. ":clear"
    local response = google_client.request(connection, "POST", endpoint, {})

    if response and response.status_code == 200 then
        return {
            success = true,
            data = json.decode(response.body)
        }
    else
        return {
            success = false,
            error = response and response.body or "Request failed",
            status_code = response and response.status_code or 0
        }
    end
end

-- Create a new spreadsheet
-- @param connection: Google OAuth connection component
-- @param title: Title for the new spreadsheet
-- @param sheet_count: Number of sheets to create (default: 1)
-- @return new spreadsheet response or error response
function sheets_client.create_spreadsheet(connection, title, sheet_count)
    if not connection then
        return {success = false, error = "Google connection is required"}
    end

    if not title then
        return {success = false, error = "Title is required"}
    end

    sheet_count = sheet_count or 1

    local endpoint = SHEETS_API_BASE
    local request_body = {
        properties = {
            title = title
        },
        sheets = {}
    }

    -- Create initial sheets
    for i = 1, sheet_count do
        local sheet_name = "Sheet" .. i
        if i == 1 then
            sheet_name = "Sheet1"
        end
        
        table.insert(request_body.sheets, {
            properties = {
                title = sheet_name
            }
        })
    end

    local response = google_client.request(connection, "POST", endpoint, request_body)

    if response and response.status_code == 200 then
        return {
            success = true,
            data = json.decode(response.body)
        }
    else
        return {
            success = false,
            error = response and response.body or "Request failed",
            status_code = response and response.status_code or 0
        }
    end
end

-- Batch update (for complex operations)
-- @param connection: Google OAuth connection component
-- @param spreadsheet_id: Google Sheets spreadsheet ID
-- @param requests: Array of request objects
-- @return batch update response or error response
function sheets_client.batch_update(connection, spreadsheet_id, requests)
    if not connection then
        return {success = false, error = "Google connection is required"}
    end

    if not spreadsheet_id then
        return {success = false, error = "Spreadsheet ID is required"}
    end

    if not requests then
        return {success = false, error = "Requests are required"}
    end

    local endpoint = SHEETS_API_BASE .. "/" .. spreadsheet_id .. ":batchUpdate"
    local request_body = {
        requests = requests
    }

    local response = google_client.request(connection, "POST", endpoint, request_body)

    if response and response.status_code == 200 then
        return {
            success = true,
            data = json.decode(response.body)
        }
    else
        return {
            success = false,
            error = response and response.body or "Request failed",
            status_code = response and response.status_code or 0
        }
    end
end

-- Helper function to format range data as table
function sheets_client.format_as_table(range_data)
    if not range_data or not range_data.values then
        return "No data found"
    end

    local values = range_data.values
    if #values == 0 then
        return "No data found"
    end

    -- Find maximum column width for formatting
    local max_cols = 0
    for _, row in ipairs(values) do
        if #row > max_cols then
            max_cols = #row
        end
    end

    local result = {}
    table.insert(result, "## " .. (range_data.range or "Data") .. "\n")

    -- Add table headers if first row exists
    if values[1] then
        local header_row = "|"
        local separator_row = "|"
        
        for i = 1, max_cols do
            local cell = values[1][i] or ""
            header_row = header_row .. " " .. cell .. " |"
            separator_row = separator_row .. " --- |"
        end
        
        table.insert(result, header_row)
        table.insert(result, separator_row)
        
        -- Add data rows (skip first row if it's headers)
        for i = 2, #values do
            local data_row = "|"
            for j = 1, max_cols do
                local cell = values[i][j] or ""
                data_row = data_row .. " " .. cell .. " |"
            end
            table.insert(result, data_row)
        end
    end

    return table.concat(result, "\n")
end

return sheets_client