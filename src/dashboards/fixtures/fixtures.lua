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

-- ── stage C2 fixtures: failure, wrong shape, bound args, empty ─────────
-- Each one writes a log line when it runs, so a test can show that a refused
-- read never reached the function ("dash fixture ran: <name>").
local logger = require("logger")
local security = require("security")

local function ran(name, extra)
    logger:info("dash fixture ran: " .. name, extra or {})
end

-- Fails with an error text that must never reach a viewer.
local function fails()
    ran("fails")
    return nil, "SECRET internal failure text"
end

-- Declared scalar, returns a two-row series frame.
local function wrong_shape()
    ran("wrong_shape")
    return series()
end

-- Declared series, but the number field holds text.
local function bad_cell()
    ran("bad_cell")
    return {
        schema = FRAME,
        fields = {
            { name = "day", type = "date", role = "dimension", nullable = false },
            { name = "tokens", type = "number", role = "measure", nullable = false },
        },
        rows = { { "2026-06-10", "ten" } },
    }
end

-- Declared record; echoes what the engine passed in, and who the caller is.
local function echo(input)
    local meta_keys = {}
    for k in pairs(input.point_meta or {}) do
        table.insert(meta_keys, k)
    end
    table.sort(meta_keys)
    local actor = security.actor()
    ran("echo", { model = input.args and input.args.model, limit = input.args and input.args.limit })
    return {
        model = input.args and input.args.model,
        limit = input.args and input.args.limit,
        point_id = input.point_id,
        meta_keys = meta_keys,
        actor = actor and actor:id() or "none",
    }
end

local function empty_series()
    ran("empty_series")
    return {
        schema = FRAME,
        fields = {
            { name = "day", type = "date", role = "dimension", nullable = false },
            { name = "tokens", type = "number", role = "measure", nullable = false },
        },
        rows = {},
    }
end

local function empty_record()
    ran("empty_record")
    return {}
end

-- A series frame with a nullable number field and a nil cell in the middle row.
local function null_cells()
    ran("null_cells")
    return {
        schema = FRAME,
        fields = {
            { name = "day", type = "date", role = "dimension", nullable = false },
            { name = "tokens", type = "number", role = "measure", nullable = true },
            { name = "cost", type = "number", role = "measure", nullable = false },
        },
        rows = { { "2026-06-10", 10, 1 }, { "2026-06-11", nil, 2 }, { "2026-06-12", 30, 3 } },
    }
end

-- Nodes with empty lists and an empty object, as plugin 1 returns them.
local function tree(input)
    ran("tree")
    return {
        name = "root",
        tags = input.args and input.args.tags or {},
        meta = {},
        children = { { name = "leaf", children = {} } },
    }
end

local function tree_empty(input)
    ran("tree_empty")
    return { name = "solo", tags = input.args and input.args.tags or {}, meta = {}, children = {} }
end

local function tree_bad()
    ran("tree_bad")
    return { children = "not a list" }
end

-- A well-formed frame with no rows, but no number field for a scalar.
local function empty_scalar_wrong()
    ran("empty_scalar_wrong")
    return {
        schema = FRAME,
        fields = { { name = "label", type = "string", role = "dimension", nullable = false } },
        rows = {},
    }
end

return {
    tree = tree, tree_empty = tree_empty, tree_bad = tree_bad, empty_scalar_wrong = empty_scalar_wrong,
    null_cells = null_cells,
    numbers = numbers, series = series, options = options, noop = noop,
    fails = fails, wrong_shape = wrong_shape, bad_cell = bad_cell, echo = echo,
    empty_series = empty_series, empty_record = empty_record,
}
