-- Status handler for the scripted tool approval demo provider (see generate.lua).
local function handler()
    return {
        success = true,
        status = "healthy",
        message = "Deterministic tool approval demo provider",
    }
end

return { handler = handler }
