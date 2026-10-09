local function handler()
    return {
        success = true,
        status = "healthy",
        message = "Deterministic Attention E2E provider",
    }
end

return { handler = handler }
