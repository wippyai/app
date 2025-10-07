-- Google Docs API client library with comprehensive document operations
-- Extends base Google client with Docs-specific functionality
local json = require("json")
local google_client = require("google_client")

local docs_client = {}

-- Base Google Docs API URL
local DOCS_API_BASE = "https://docs.googleapis.com/v1/documents"

-- Open a Google OAuth connection (delegate to base client)
function docs_client.open_connection()
    return google_client.open_connection()
end

-- Create a new Google Doc
-- @param connection: Google OAuth connection component
-- @param title: Title for the new document
-- @return document creation response or error response
function docs_client.create_document(connection, title)
    if not connection then
        return {success = false, error = "Google connection is required"}
    end
    if not title then
        return {success = false, error = "Document title is required"}
    end

    local endpoint = DOCS_API_BASE
    local request_body = {
        title = title
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

-- Create a new Google Doc with initial content
-- @param connection: Google OAuth connection component  
-- @param title: Title for the new document
-- @param content: Initial content to add to the document
-- @return document creation response or error response
function docs_client.create_document_with_content(connection, title, content)
    if not connection then
        return {success = false, error = "Google connection is required"}
    end
    if not title then
        return {success = false, error = "Document title is required"}
    end
    if not content then
        return {success = false, error = "Content is required"}
    end

    -- First create the document
    local create_result = docs_client.create_document(connection, title)
    if not create_result.success then
        return create_result
    end

    local document = create_result.data
    local document_id = document.documentId

    -- Add initial content using a simple insert at index 1
    -- For brand new documents, we just insert at the beginning without deleting anything
    local endpoint = DOCS_API_BASE .. "/" .. document_id .. ":batchUpdate"
    local requests = {
        {
            insertText = {
                location = {
                    index = 1
                },
                text = content
            }
        }
    }

    local request_body = {
        requests = requests
    }

    local response = google_client.request(connection, "POST", endpoint, request_body)
    
    if response and response.status_code == 200 then
        return {
            success = true,
            data = document
        }
    else
        return {
            success = false,
            error = response and response.body or "Failed to add initial content",
            status_code = response and response.status_code or 0
        }
    end
end

-- Get document metadata and content
-- @param connection: Google OAuth connection component
-- @param document_id: Google Docs document ID
-- @return document data or error response
function docs_client.get_document(connection, document_id)
    if not connection then
        return {success = false, error = "Google connection is required"}
    end
    if not document_id then
        return {success = false, error = "Document ID is required"}
    end

    local endpoint = DOCS_API_BASE .. "/" .. document_id
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

-- Calculate the actual document length for proper index calculations
-- Uses Google Docs API's actual endIndex when available, falls back to manual calculation
-- @param document_data: Document data from get_document
-- @return total character count including structure
function docs_client.calculate_document_length(document_data)
    if not document_data or not document_data.body then
        return 1  -- Empty document still has at least 1 character
    end

    -- Use the document's endIndex if available (most reliable)
    if document_data.body.content and #document_data.body.content > 0 then
        local last_element = document_data.body.content[#document_data.body.content]
        if last_element.endIndex then
            return last_element.endIndex
        end
    end

    -- Fallback to manual calculation if endIndex not available
    if not document_data.body.content then
        return 1
    end

    local total_length = 0
    
    for _, element in ipairs(document_data.body.content) do
        if element.paragraph then
            if element.paragraph.elements then
                for _, para_element in ipairs(element.paragraph.elements) do
                    if para_element.textRun and para_element.textRun.content then
                        total_length = total_length + #para_element.textRun.content
                    end
                end
            end
            -- Each paragraph has an implicit newline - but count carefully
            total_length = total_length + 1
        elseif element.table then
            -- Handle table content
            if element.table.tableRows then
                for _, row in ipairs(element.table.tableRows) do
                    if row.tableCells then
                        for _, cell in ipairs(row.tableCells) do
                            if cell.content then
                                for _, cell_element in ipairs(cell.content) do
                                    if cell_element.paragraph and cell_element.paragraph.elements then
                                        for _, cell_para_element in ipairs(cell_element.paragraph.elements) do
                                            if cell_para_element.textRun and cell_para_element.textRun.content then
                                                total_length = total_length + #cell_para_element.textRun.content
                                            end
                                        end
                                    end
                                    -- Each cell paragraph adds a newline
                                    total_length = total_length + 1
                                end
                            end
                        end
                    end
                end
            end
        end
    end

    -- Ensure minimum length of 1 for empty documents
    return math.max(total_length, 1)
end

-- Write content to a document using batch update
-- @param connection: Google OAuth connection component
-- @param document_id: Google Docs document ID
-- @param content: Text content to write
-- @param append: Whether to append (true) or replace (false) content
-- @return batch update response or error response
function docs_client.write_content(connection, document_id, content, append)
    if not connection then
        return {success = false, error = "Google connection is required"}
    end
    if not document_id then
        return {success = false, error = "Document ID is required"}
    end
    if not content then
        return {success = false, error = "Content is required"}
    end

    append = append or false

    local endpoint = DOCS_API_BASE .. "/" .. document_id .. ":batchUpdate"
    local requests = {}

    -- Always get document first to understand current state and calculate proper indices
    local doc_result = docs_client.get_document(connection, document_id)
    if not doc_result.success then
        return doc_result
    end

    -- Calculate document length using proper Google Docs content structure
    local doc_length = docs_client.calculate_document_length(doc_result.data)

    if not append then
        -- For replace mode: delete existing content except the final newline
        -- Use doc_length - 1 as endIndex since Google Docs indices are exclusive at the end
        if doc_length > 1 then
            table.insert(requests, {
                deleteContentRange = {
                    range = {
                        startIndex = 1,
                        endIndex = doc_length - 1  -- Exclusive end index
                    }
                }
            })
        end
        -- Insert new content at the beginning
        table.insert(requests, {
            insertText = {
                location = {
                    index = 1
                },
                text = content
            }
        })
    else
        -- For append mode: insert at the end before the final newline
        table.insert(requests, {
            insertText = {
                location = {
                    index = math.max(1, doc_length - 1)  -- Ensure we never go below index 1
                },
                text = content
            }
        })
    end

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

-- Extract plain text content from document structure
-- @param document_data: Document data from get_document
-- @return plain text content
function docs_client.extract_text_content(document_data)
    if not document_data or not document_data.body or not document_data.body.content then
        return ""
    end

    local text_parts = {}
    
    for _, element in ipairs(document_data.body.content) do
        if element.paragraph and element.paragraph.elements then
            for _, para_element in ipairs(element.paragraph.elements) do
                if para_element.textRun and para_element.textRun.content then
                    table.insert(text_parts, para_element.textRun.content)
                end
            end
        elseif element.table then
            -- Handle table content
            if element.table.tableRows then
                for _, row in ipairs(element.table.tableRows) do
                    if row.tableCells then
                        for _, cell in ipairs(row.tableCells) do
                            if cell.content then
                                for _, cell_element in ipairs(cell.content) do
                                    if cell_element.paragraph and cell_element.paragraph.elements then
                                        for _, cell_para_element in ipairs(cell_element.paragraph.elements) do
                                            if cell_para_element.textRun and cell_para_element.textRun.content then
                                                table.insert(text_parts, cell_para_element.textRun.content)
                                            end
                                        end
                                    end
                                end
                            end
                        end
                        table.insert(text_parts, "\n") -- Row separator
                    end
                end
            end
        end
    end

    return table.concat(text_parts)
end

-- Format document info for display
-- @param document_data: Document data from get_document
-- @return formatted string
function docs_client.format_document_info(document_data)
    if not document_data then
        return "No document data available"
    end

    local result = {}
    table.insert(result, "## Google Document Info\n")
    table.insert(result, string.format("**Title:** %s\n", document_data.title or "Unknown"))
    table.insert(result, string.format("**Document ID:** `%s`\n", document_data.documentId or "Unknown"))
    
    if document_data.documentStyle and document_data.documentStyle.pageSize then
        local page_size = document_data.documentStyle.pageSize
        table.insert(result, string.format("**Page Size:** %.1f x %.1f pts\n", 
            page_size.width and page_size.width.magnitude or 0,
            page_size.height and page_size.height.magnitude or 0
        ))
    end

    if document_data.revisionId then
        table.insert(result, string.format("**Revision ID:** %s\n", document_data.revisionId))
    end

    -- Add content preview
    local text_content = docs_client.extract_text_content(document_data)
    if text_content and text_content ~= "" then
        local preview = text_content:sub(1, 200)
        if #text_content > 200 then
            preview = preview .. "..."
        end
        table.insert(result, string.format("\n**Content Preview:**\n%s\n", preview))
        table.insert(result, string.format("**Character Count:** %d\n", #text_content))
    else
        table.insert(result, "\n**Content:** Empty document\n")
    end

    return table.concat(result)
end

return docs_client