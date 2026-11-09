-- Fixture functions: constant frames in the declared shapes (contracts section 7).
local FRAME = "wippy.dashboard_frame/v1"

local function numbers()
    return {
        schema = FRAME,
        fields = { { name = "value", type = "number", role = "measure", nullable = false } },
        rows = { { 42 } },
    }
end

local function series()
    return {
        schema = FRAME,
        fields = {
            { name = "day", type = "date", role = "dimension", nullable = false },
            { name = "tokens", type = "number", role = "measure", nullable = false },
        },
        rows = { { "2026-06-10", 10 }, { "2026-06-11", 20 } },
    }
end

local function options()
    return {
        schema = FRAME,
        fields = {
            { name = "value", type = "string", role = "dimension", nullable = false },
            { name = "label", type = "string", role = "dimension", nullable = false },
        },
        rows = { { "a", "Option A" }, { "b", "Option B" } },
    }
end

local function noop()
    return { ok = true }
end

return { numbers = numbers, series = series, options = options, noop = noop }
