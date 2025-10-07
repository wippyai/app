local fs = require("fs")
local env = require("env")
local http_client = require("http_client")
local json = require("json")
local content_repo = require("content_repo")

-- Conversion status constants
local CONVERSION_STATUS = {
    NONE = "none",
    STARTED = "started",
    COMPLETED = "completed"
}

-- Supported MIME types that need conversion (based on official Microsoft MarkItDown docs)
local NEEDS_CONVERSION = {
    -- PDF files
    ["application/pdf"] = true,

    -- Word documents
    ["application/msword"] = true,
    ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"] = true,

    -- Excel spreadsheets
    ["application/vnd.ms-excel"] = true,
    ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"] = true,

    -- PowerPoint presentations
    ["application/vnd.ms-powerpoint"] = true,
    ["application/vnd.openxmlformats-officedocument.presentationml.presentation"] = true,

    -- Images (EXIF metadata and OCR)
    ["image/jpeg"] = true,
    ["image/jpg"] = true,
    ["image/png"] = true,
    ["image/gif"] = true,
    ["image/bmp"] = true,
    ["image/tiff"] = true,
    ["image/webp"] = true,

    -- Audio (EXIF metadata and speech transcription)
    ["audio/wav"] = true,
    ["audio/mpeg"] = true,
    ["audio/mp3"] = true,

    -- HTML
    ["text/html"] = true,

    -- Text-based formats
    ["text/csv"] = true,
    ["application/json"] = true,
    ["application/xml"] = true,
    ["text/xml"] = true,

    -- ZIP files (iterates over contents)
    ["application/zip"] = true,
    ["application/x-zip-compressed"] = true,

    -- Outlook messages
    ["application/vnd.ms-outlook"] = true,

    -- EPubs
    ["application/epub+zip"] = true
}

local function convert_to_markdown(file_path, mime_type, filename, storage)
    local api_url, err = env.get("app.uploads.markitdown:api_url")
    if err or not api_url or api_url == "" then
        return nil, "app.uploads.markitdown:api_url not set: " .. (err or "empty")
    end

    if not string.match(api_url, "/process_file$") then
        api_url = api_url .. (string.match(api_url, "/$") and "process_file" or "/process_file")
    end

    local file, err = storage:open(file_path, "r")
    if not file then
        return nil, "Failed to open file: " .. (err or "unknown")
    end

    local response, err = http_client.post(api_url, {
        timeout = "5m",
        files = { {
            name = "file",
            filename = filename or "document",
            content_type = mime_type,
            reader = file
        } }
    })

    file:close()

    if err then
        return nil, "API request failed: " .. err
    end
    if response.status_code ~= 200 then
        return nil, "API error: " .. response.status_code .. " - " .. response.body
    end

    local data = json.decode(response.body)
    if not data.markdown or data.markdown == "" then
        return nil, "No markdown content received"
    end

    return data.markdown, nil
end

-- Process a document upload to extract and store its content
local function process(params)
    -- Validate required parameters
    if not params.upload_id or not params.storage_id or not params.storage_path then
        return nil, "Missing required parameters"
    end

    -- Get the file storage
    local storage = fs.get(params.storage_id)
    if not storage then
        return nil, "Failed to get storage"
    end

    -- Check if the file exists
    if not storage:exists(params.storage_path) then
        return nil, "File does not exist in storage"
    end

    -- Determine if we need to convert the file
    local needs_conversion = NEEDS_CONVERSION[params.mime_type] or false
    local content = nil
    local content_mime_type = params.mime_type
    local conversion_metadata = {}
    local conversion_status = CONVERSION_STATUS.NONE

    if needs_conversion then
        conversion_status = CONVERSION_STATUS.STARTED
        -- Convert the document to markdown
        local md_content, err = convert_to_markdown(
            params.storage_path,
            params.mime_type,
            params.metadata and params.metadata.filename,
            storage
        )

        if err then
            return nil, "Conversion failed: " .. err
        end

        content = md_content
        content_mime_type = "text/markdown"
        conversion_status = CONVERSION_STATUS.COMPLETED
    else
        -- For text files, just read the content
        local file_content = storage:readfile(params.storage_path)
        if not file_content then
            return nil, "Failed to read file"
        end

        content = file_content
    end

    -- Prepare metadata for content storage
    local content_metadata = {
        original_mime_type = params.mime_type,
        conversion = needs_conversion,
        filename = params.metadata and params.metadata.filename
    }

    -- Add conversion metadata if available
    if conversion_metadata and next(conversion_metadata) then
        content_metadata.conversion_details = conversion_metadata
    end

    -- Store the content
    local content_record = content_repo.create(
        params.upload_id,
        content_mime_type,
        content,
        content_metadata
    )

    if not content_record then
        return nil, "Failed to store content"
    end

    -- Generate a sample of the content
    local sample
    if #content <= 100 then
        sample = content
    else
        sample = content:sub(1, 97) .. "..."
    end

    -- Return success with minimal metadata
    return {
        success = true,
        metadata = {
            content_sample = sample
        }
    }, nil
end

return { process = process }
