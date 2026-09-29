-- DEV FIXTURE — status handler for the deterministic Session Forms demo
-- provider. See generate.lua for the fixture's request behavior.
local function handler()
    return {
        success = true,
        status = "healthy",
        message = "Deterministic Session Forms demo provider",
    }
end

return { handler = handler }
