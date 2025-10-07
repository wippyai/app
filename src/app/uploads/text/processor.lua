local fs = require("fs")
local content_repo = require("content_repo")

-- Constants
local MAX_SAMPLE_LENGTH = 100
local TRUNCATION_SUFFIX = "..."

-- Simple text processor that processes text file content and stores it
-- @param params Table containing upload information:
--   - upload_id: The UUID of the upload
--   - mime_type: The MIME type of the file
--   - storage_id: The storage identifier
--   - storage_path: The path in the storage
--   - size: The file size in bytes
--   - metadata: Upload metadata
-- @return Table with processing result
local function process(params)
    -- Validate required parameters
    if not params.upload_id or not params.storage_id or not params.storage_path then
        error("Missing required parameters")
    end

    print("Processing text file:", params.upload_id)
    print("  MIME type:", params.mime_type)
    print("  Size:", params.size, "bytes")
    print("  Storage:", params.storage_id, params.storage_path)

    -- Get the file storage
    local storage = fs.get(params.storage_id)
    if not storage then
        error("Failed to get storage")
    end

    -- Check if the file exists
    if not storage:exists(params.storage_path) then
        error("File does not exist in storage")
    end

    -- Read the file content
    local content = storage:readfile(params.storage_path)
    if not content then
        error("Failed to read file")
    end

    -- Store the content in the content repository
    local content_metadata = {
        original_mime_type = params.mime_type,
        filename = params.metadata and params.metadata.filename
    }

    -- Store the content
    local content_record = content_repo.create(
        params.upload_id,
        params.mime_type,
        content,
        content_metadata
    )

    if not content_record then
        error("Failed to store content")
    end

    -- Create a small sample for reporting
    local sample
    if #content <= MAX_SAMPLE_LENGTH then
        sample = content
    else
        sample = content:sub(1, MAX_SAMPLE_LENGTH - 3) .. TRUNCATION_SUFFIX
    end

    -- Return success with minimal metadata
    return {
        success = true,
        metadata = {
            content_sample = sample
        }
    }
end

return { process = process }