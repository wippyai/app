-- The Session title function contract: a table with the title, not a bare string.
local function handler()
    return {
        success = true,
        title = "Attention E2E",
        tokens = { prompt_tokens = 0, completion_tokens = 0, total_tokens = 0 },
    }
end

return { handler = handler }
