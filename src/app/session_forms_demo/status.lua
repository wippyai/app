-- Status handler for the scripted Session Forms demo provider (see generate.lua).
local function handler()
    return {
        success = true,
        status = "healthy",
        message = "Deterministic Session Forms demo provider",
    }
end

return { handler = handler }
