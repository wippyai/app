local http = require("http")
local json = require("json")
local models = require("models")

local function handler()
    -- Get response object
    local res = http.response()
    local req = http.request()
    if not res or not req then
        return nil, "Failed to get HTTP context"
    end

    -- Get all models from the models library
    local all_models = models.get_all()

    -- Format the models to only include required fields
    local formatted_models = {}
    for _, model in ipairs(all_models) do
        -- Skip embedding models - only include models that can generate or call tools
        local is_embedding = (model.type == "llm.embedding")
        local can_generate = false

        -- Check if model has generate capability or generate handler
        if model.capabilities then
            for _, capability in ipairs(model.capabilities) do
                if capability == "generate" or capability == "tool_use" then
                    can_generate = true
                    break
                end
            end
        end

        -- Also check for generate handler if capabilities not explicitly listed
        if model.handlers and model.handlers.generate then
            can_generate = true
        end

        -- Skip this model if it's an embedding model or can't generate
        if is_embedding or not can_generate then
            goto continue
        end
        -- Determine provider from providers array
        local provider = "unknown"
        if model.providers and #model.providers > 0 then
            -- Extract provider from provider ID (e.g., "wippy.llm.openai:provider" -> "openai")
            local provider_match = model.providers[1].id:match("wippy%.llm%.([^:]+):")
            if provider_match then
                provider = provider_match
            end
        elseif model.handlers and model.handlers.embeddings then
            local provider_match = model.handlers.embeddings:match("wippy%.llm%.([^:]+):")
            if provider_match then
                provider = provider_match
            end
        end

        table.insert(formatted_models, {
            name = model.name,
            title = model.title or model.name,
            description = model.description or "",
            provider = provider
        })

        ::continue::
    end

    -- Return JSON response
    res:set_content_type(http.CONTENT.JSON)
    res:set_status(http.STATUS.OK)
    res:write_json({
        success = true,
        count = #formatted_models,
        models = formatted_models
    })
end

return {
    handler = handler
}