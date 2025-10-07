local fs = require("fs")

-- Simple image processor that just validates the upload and marks it as processed
-- Images don't need content extraction - they're stored as-is for agent viewing
local function process(params)
    -- Validate required parameters
    if not params.upload_id or not params.storage_id or not params.storage_path then
        error("Missing required parameters")
    end

    print("Processing image upload:", params.upload_id)
    print("  MIME type:", params.mime_type)
    print("  Size:", params.size, "bytes")
    print("  Storage:", params.storage_id, params.storage_path)

    -- Get the file storage to verify file exists
    local storage = fs.get(params.storage_id)
    if not storage then
        error("Failed to get storage")
    end

    -- Check if the file exists
    if not storage:exists(params.storage_path) then
        error("Image file does not exist in storage")
    end

    -- Get basic file info
    local file_info = storage:stat(params.storage_path)
    if not file_info then
        error("Failed to get image file information")
    end

    print("Image file verified:", file_info.size, "bytes")

    -- Create metadata with image-specific information
    local image_metadata = {
        file_size = file_info.size,
        ready_for_viewing = true,
        processing_complete = true
    }

    -- Add original filename if available
    if params.metadata and params.metadata.filename then
        image_metadata.original_filename = params.metadata.filename
    end

    -- Return success - no content extraction needed for images
    return {
        success = true,
        metadata = image_metadata
    }
end

return { process = process }