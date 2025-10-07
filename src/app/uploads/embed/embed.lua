local text = require("text")
local embeddings = require("embeddings")
local content_repo = require("content_repo")

-- Constants
local MAX_TOKENS_PER_BATCH = 8000
local DEFAULT_CHUNK_SIZE = 1000
local DEFAULT_OVERLAP = 150

-- Pre-compiled regex patterns for maximum performance (global)
local page_pattern_re, page_err = text.regexp.compile('<document-page number="(\\d+)">(.*?)</document-page>')
local tag_pattern_re, tag_err = text.regexp.compile('<[^>]*>')
local whitespace_pattern_re, ws_err = text.regexp.compile('^\\s+|\\s+$')

-- Validate patterns compiled successfully
if page_err then error("Failed to compile page pattern: " .. page_err) end
if tag_err then error("Failed to compile tag pattern: " .. tag_err) end
if ws_err then error("Failed to compile whitespace pattern: " .. ws_err) end

-- Helper function to estimate tokens in text
local function estimate_tokens(text)
    return math.ceil(#text / 4)
end

-- Get document content
local function get_document_content(upload_id)
    local content_record = content_repo.get_by_upload(upload_id)
    if not content_record then
        error("Failed to retrieve content for upload_id: " .. upload_id)
    end
    return content_record
end

-- Parse document pages using fast regex - MUCH faster than gmatch
local function parse_document_pages(content)
    local pages = {}

    -- Use fast regex to find all document pages with captures
    local matches = page_pattern_re:find_all_string_submatch(content)
    if not matches then
        return pages -- No pages found
    end

    -- Process each match: [1] = full match, [2] = page number, [3] = content
    for _, match in ipairs(matches) do
        local page_number = tonumber(match[2])
        local page_content = match[3]

        -- Fast whitespace trimming using regex
        local trimmed_content = whitespace_pattern_re:replace_all_string(page_content, '')

        table.insert(pages, {
            number = page_number,
            content = trimmed_content
        })
    end

    -- Sort pages by number to ensure correct order
    table.sort(pages, function(a, b) return a.number < b.number end)

    return pages
end

-- Create text splitter using the text module
local function create_text_splitter(chunk_size, overlap)
    local splitter, err = text.splitter.recursive({
        chunk_size = chunk_size,
        chunk_overlap = overlap,
        separators = {"\n\n", "\n", ". ", " ", ""},
        keep_separator = false
    })

    if err then
        error("Failed to create text splitter: " .. err)
    end

    return splitter
end

-- Process pages into chunks with metadata
local function process_pages_to_chunks(pages, document_id, splitter)
    local all_chunks = {}

    -- Create pages array for batch processing
    local page_items = {}
    for _, page in ipairs(pages) do
        table.insert(page_items, {
            content = page.content,
            metadata = {
                page_number = page.number,
                document_id = document_id
            }
        })
    end

    -- Use splitter's batch processing
    local chunks, err = splitter:split_batch(page_items)
    if err then
        error("Failed to split pages: " .. err)
    end

    -- Add chunk index to metadata
    for i, chunk in ipairs(chunks) do
        chunk.metadata.chunk_index = i
        table.insert(all_chunks, {
            text = chunk.content,
            metadata = chunk.metadata
        })
    end

    return all_chunks
end

-- Fast tag stripping using pre-compiled regex - MUCH faster than gsub
local function strip_tags(content)
    if not content then return "" end
    return tag_pattern_re:replace_all_string(content, '')
end

-- Group into batches
local function create_batches(chunks, document_id)
    local items = {}

    -- Convert chunks to embedding items
    for i, chunk in ipairs(chunks) do
        if chunk.text and #chunk.text > 0 then
            table.insert(items, {
                content = chunk.text,
                content_type = "chunk/document",
                origin_id = document_id,
                context_id = document_id,
                meta = chunk.metadata
            })
        end
    end

    -- Create batches
    local batches = {}
    local current_batch = {}
    local current_tokens = 0

    for i, item in ipairs(items) do
        local item_tokens = estimate_tokens(item.content)

        if current_tokens + item_tokens > MAX_TOKENS_PER_BATCH and #current_batch > 0 then
            table.insert(batches, current_batch)
            current_batch = {}
            current_tokens = 0
        end

        table.insert(current_batch, item)
        current_tokens = current_tokens + item_tokens
    end

    if #current_batch > 0 then
        table.insert(batches, current_batch)
    end

    return batches
end

-- Main process function
local function process(params)
    if not params.upload_id then
        error("Missing required parameter: upload_id")
    end

    print("Processing document: " .. params.upload_id)

    -- Get document content
    local content_record = get_document_content(params.upload_id)

    -- Get raw content
    local raw_content = content_record.content or ""
    print("Raw content length: " .. #raw_content)

    -- Configure chunking parameters
    local chunk_size = DEFAULT_CHUNK_SIZE
    local chunk_overlap = DEFAULT_OVERLAP

    if params.metadata then
        if params.metadata.chunk_size and tonumber(params.metadata.chunk_size) then
            chunk_size = tonumber(params.metadata.chunk_size)
        end

        if params.metadata.chunk_overlap and tonumber(params.metadata.chunk_overlap) then
            chunk_overlap = tonumber(params.metadata.chunk_overlap)
        end
    end

    -- Create text splitter
    local splitter = create_text_splitter(chunk_size, chunk_overlap)

    -- Try to parse document pages first using fast regex
    local pages = parse_document_pages(raw_content)
    local chunks = {}

    if #pages > 0 then
        print("Found " .. #pages .. " document pages, processing with page structure")
        chunks = process_pages_to_chunks(pages, params.upload_id, splitter)
    else
        print("No document pages found, processing as plain text")
        -- Fallback to plain text processing with fast tag stripping
        local stripped_content = strip_tags(raw_content)
        print("Stripped content length: " .. #stripped_content)

        local chunk_texts, err = splitter:split_text(stripped_content)
        if err then
            error("Failed to split text: " .. err)
        end

        -- Convert to chunk format
        for i, chunk_text in ipairs(chunk_texts) do
            table.insert(chunks, {
                text = chunk_text,
                metadata = {
                    chunk_index = i,
                    document_id = params.upload_id,
                }
            })
        end
    end

    print("Created " .. #chunks .. " chunks")

    -- Create batches
    local batches = create_batches(chunks, params.upload_id)
    print("Created " .. #batches .. " batches")

    -- Embed each batch
    local chunks_embedded = 0
    local errors = {}

    for i, batch in ipairs(batches) do
        print("Processing batch " .. i .. " of " .. #batches .. " with " .. #batch .. " chunks")

        local batch_result, err = embeddings.add_batch(batch)

        if err then
            table.insert(errors, {
                batch = i,
                error = err
            })
            print("Error processing batch " .. i .. ": " .. err)
        else
            local count = batch_result and batch_result.count or 0
            chunks_embedded = chunks_embedded + count
            print("Successfully embedded " .. count .. " chunks")
        end
    end

    -- Return results
    return {
        success = chunks_embedded > 0,
        metadata = {
            chunks_count = #chunks,
            chunks_embedded = chunks_embedded,
            errors_count = #errors,
            batches_count = #batches,
            pages_found = #pages
        }
    }
end

return { process = process }