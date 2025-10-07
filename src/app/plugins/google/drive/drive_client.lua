-- Google Drive API client library with specialized Drive operations
-- Extends base Google client with Drive-specific functionality

local json = require("json")
local google_client = require("google_client")

local drive_client = {}

-- Base Google Drive API URL
local DRIVE_API_BASE = "https://www.googleapis.com/drive/v3"

-- Open a Google OAuth connection (delegate to base client)
function drive_client.open_connection()
    return google_client.open_connection()
end

-- List files from Google Drive
-- @param connection: Google OAuth connection component
-- @param query: Optional Drive query string
-- @param page_size: Number of files to return (default: 10, max: 1000)
-- @param page_token: Token for pagination
-- @return drive files response or nil on error
function drive_client.list_files(connection, query, page_size, page_token)
    if not connection then
        return {success = false, error = "Google connection is required"}
    end

    page_size = page_size or 10
    if page_size > 1000 then page_size = 1000 end

    local endpoint = DRIVE_API_BASE .. "/files"
    local params = {
        pageSize = tostring(page_size),
        fields = "nextPageToken,files(id,name,mimeType,size,modifiedTime,parents,webViewLink)"
    }

    if query then
        params.q = query
    end

    if page_token then
        params.pageToken = page_token
    end

    local query_string = {}
    for k, v in pairs(params) do
        table.insert(query_string, k .. "=" .. v)
    end
    endpoint = endpoint .. "?" .. table.concat(query_string, "&")

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

-- Get file metadata
-- @param connection: Google OAuth connection component
-- @param file_id: Google Drive file ID
-- @return file metadata or error response
function drive_client.get_file_metadata(connection, file_id)
    if not connection then
        return {success = false, error = "Google connection is required"}
    end

    if not file_id then
        return {success = false, error = "File ID is required"}
    end

    local endpoint = DRIVE_API_BASE .. "/files/" .. file_id .. "?fields=id,name,mimeType,size,modifiedTime,parents,webViewLink,exportLinks"
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

-- Download file content (for text files and exportable formats)
-- @param connection: Google OAuth connection component
-- @param file_id: Google Drive file ID
-- @param export_mime_type: MIME type for export (optional, for Google Docs/Sheets/Slides)
-- @return file content or error response
function drive_client.get_file_content(connection, file_id, export_mime_type)
    if not connection then
        return {success = false, error = "Google connection is required"}
    end

    if not file_id then
        return {success = false, error = "File ID is required"}
    end

    local endpoint
    if export_mime_type then
        -- Export Google Docs/Sheets/Slides
        endpoint = DRIVE_API_BASE .. "/files/" .. file_id .. "/export?mimeType=" .. export_mime_type
    else
        -- Download regular files
        endpoint = DRIVE_API_BASE .. "/files/" .. file_id .. "?alt=media"
    end

    local response = google_client.request(connection, "GET", endpoint)

    if response and response.status_code == 200 then
        return {
            success = true,
            data = response.body
        }
    else
        return {
            success = false,
            error = response and response.body or "Request failed",
            status_code = response and response.status_code or 0
        }
    end
end

-- Helper function to determine if file is exportable and get appropriate export format
-- @param mime_type: File MIME type
-- @return export MIME type or nil if not exportable
function drive_client.get_export_mime_type(mime_type)
    local export_map = {
        ["application/vnd.google-apps.document"] = "text/plain",
        ["application/vnd.google-apps.spreadsheet"] = "text/csv",
        ["application/vnd.google-apps.presentation"] = "text/plain"
    }
    return export_map[mime_type]
end

-- Format file size helper
function drive_client.format_file_size(bytes)
    if not bytes or bytes == 0 then
        return "Unknown size"
    end

    local size = tonumber(bytes)
    if not size then
        return "Unknown size"
    end

    local units = {"B", "KB", "MB", "GB", "TB"}
    local unit_index = 1

    while size >= 1024 and unit_index < #units do
        size = size / 1024
        unit_index = unit_index + 1
    end

    return string.format("%.1f %s", size, units[unit_index])
end

-- Format MIME type to human readable
function drive_client.format_mime_type(mime_type)
    local type_map = {
        ["application/vnd.google-apps.folder"] = "Folder",
        ["application/vnd.google-apps.document"] = "Google Doc",
        ["application/vnd.google-apps.spreadsheet"] = "Google Sheets",
        ["application/vnd.google-apps.presentation"] = "Google Slides",
        ["application/pdf"] = "PDF",
        ["text/plain"] = "Text File",
        ["image/jpeg"] = "JPEG Image",
        ["image/png"] = "PNG Image",
        ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"] = "Word Document",
        ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"] = "Excel Spreadsheet"
    }
    return type_map[mime_type] or mime_type
end

return drive_client