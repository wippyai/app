local function handler()
    return {
        success = true,
        status = "healthy",
        message = "Local deterministic compatibility provider",
    }
end

return { handler = handler }
