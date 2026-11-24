-- Fixture functions of the wippy/dashboards browser tests (e2e/dashboards-reads.spec.ts).
-- Points: constant frames in each declared shape, every row of the state table of the data
-- point contract (failure, wrong data, slow, timeout), value cases (decimals, big integers,
-- time offsets, empty cells in each type, malformed values) and a slow action.
-- An empty cell is the marker { ["$null"] = true } (data point contract section 5.1); the
-- engine writes it as JSON null.
local logger = require("logger")
local security = require("security")
local time = require("time")
local clock = require("clock")

local FRAME = "wippy.dashboard_frame/v1"
local NULL = { ["$null"] = true }
local SLOW_SECONDS = 5

-- Each fixture writes a log line when it runs, so a test can show that a refused read never
-- reached the function ("dash fixture ran: <name>").
local function ran(name, extra)
    logger:info("dash fixture ran: " .. name, extra or {})
end

local function args_of(input)
    return type(input) == "table" and type(input.args) == "table" and input.args or {}
end

local function numbers()
    ran("numbers")
    return {
        schema = FRAME,
        fields = { { name = "value", type = "number", role = "measure", nullable = false } },
        rows = { { 42 } },
    }
end

local function series()
    ran("series")
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
    ran("options")
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
    ran("noop")
    return { ok = true }
end

-- Fails with an error text that must never reach a viewer.
local function fails()
    ran("fails")
    return nil, "SECRET internal failure text"
end

-- Declared scalar, returns two rows.
local function wrong_shape()
    ran("wrong_shape")
    return {
        schema = FRAME,
        fields = { { name = "value", type = "number", role = "measure", nullable = false } },
        rows = { { 1 }, { 2 } },
    }
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

-- A well-formed frame with no rows.
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

-- Declared record; echoes the arguments and who the caller is.
local function echo(input)
    local actor = security.actor()
    local args = args_of(input)
    ran("echo", { model = args.model, limit = args.limit })
    return {
        model = args.model,
        limit = args.limit,
        actor = actor and actor:id() or "none",
    }
end

-- Takes longer than its deadline_ms (1 s): the read answers timeout.
local function sleepy()
    ran("sleepy")
    time.sleep("3s")
    return numbers()
end

-- A slow point. The first call starts work that is ready SLOW_SECONDS later (the ready time is
-- inside the function's own token) and answers computing. A call with `operation` only looks.
local function slow(input)
    local now = clock.now()
    if type(input) == "table" and input.operation ~= nil then
        ran("slow_follow")
        local ready_at = tonumber(string.match(input.operation, "^slow%-(%d+)%-"))
        if ready_at == nil then
            return nil, "unknown work"
        end
        if now >= ready_at then
            return {
                schema = FRAME,
                fields = { { name = "value", type = "number", role = "measure", nullable = false } },
                rows = { { 7 } },
            }
        end
        return { computing = true, operation = input.operation, retry_after_ms = 1000 }
    end
    ran("slow_start")
    return {
        computing = true,
        operation = string.format("slow-%d-%d", now + SLOW_SECONDS, math.random(100000, 999999)),
        retry_after_ms = 1000,
    }
end

-- A slow source (RC2-06) for a point with a mapper and for an open point: it works like `slow`, and when the
-- work is ready it gives the rows of three LLM calls. The field `secret` is not in the open point's rows_schema.
local function slow_rows(input)
    local now = clock.now()
    if type(input) == "table" and input.operation ~= nil then
        ran("slow_rows_follow")
        local ready_at = tonumber(string.match(input.operation, "^slowrows%-(%d+)%-"))
        if ready_at == nil then
            return nil, "unknown work"
        end
        if now >= ready_at then
            return {
                { day = "2026-11-17", model_id = "a", prompt_tokens = 10, completion_tokens = 5, secret = "s1" },
                { day = "2026-11-17", model_id = "b", prompt_tokens = 20, completion_tokens = 10, secret = "s2" },
                { day = "2026-11-18", model_id = "a", prompt_tokens = 30, completion_tokens = 15, secret = "s3" },
            }
        end
        return { computing = true, operation = input.operation, retry_after_ms = 1000 }
    end
    ran("slow_rows_start")
    return {
        computing = true,
        operation = string.format("slowrows-%d-%d", now + SLOW_SECONDS, math.random(100000, 999999)),
        retry_after_ms = 1000,
    }
end

-- The same for an action.
local function slow_action(input)
    local now = clock.now()
    if type(input) == "table" and input.operation ~= nil then
        ran("slow_action_follow")
        local ready_at = tonumber(string.match(input.operation, "^slow%-(%d+)%-"))
        if ready_at == nil then
            return nil, "unknown work"
        end
        if now >= ready_at then
            return { done = true }
        end
        return { computing = true, operation = input.operation, retry_after_ms = 1000 }
    end
    ran("slow_action_start")
    return {
        computing = true,
        operation = string.format("slow-%d-%d", now + SLOW_SECONDS, math.random(100000, 999999)),
        retry_after_ms = 1000,
    }
end

-- ── value cases (data point contract sections 5, 5.1 and 9) ──────────
local function values_fields()
    return {
        { name = "d", type = "date", role = "dimension", nullable = true },
        { name = "t", type = "time", role = "dimension", nullable = true },
        { name = "n", type = "number", role = "measure", nullable = true },
        { name = "dec", type = "decimal", role = "measure", nullable = true },
        { name = "s", type = "string", role = "dimension", nullable = true },
        { name = "b", type = "boolean", role = "dimension", nullable = true },
    }
end

local function values_frame(rows, fields)
    return { schema = FRAME, fields = fields or values_fields(), rows = rows }
end

local function values(input)
    local case = args_of(input).case
    ran("values", { case = case })
    if case == "valid" then
        return values_frame({
            { "2026-11-19", "2026-11-19T12:00:00+01:00", 1.5, "12345678901234567890", "text", true },
            { "2024-02-29", "2026-11-19T12:00:00-05:30", 9007199254740992, "-0.10", "$null", false },
            { "2026-12-31", "2026-11-19T12:00:00Z", -3, "+7", "a \"quoted\" {\"$null\":true}", true },
        })
    elseif case == "empty_cells" then
        return values_frame({
            { NULL, "2026-11-19T12:00:00Z", 1, "1.5", "x", true },
            { "2026-11-19", "2026-11-19T12:00:00Z", NULL, "1.5", NULL, true },
            { "2026-11-19", NULL, 2, NULL, "y", NULL },
            { NULL, NULL, NULL, NULL, NULL, NULL },
        })
    elseif case == "no_rows" then
        return values_frame({})
    elseif case == "changed_format" then
        local f = values_frame({ { "2026-11-19", "2026-11-19T12:00:00Z", "1", "1.5", "x", true } })
        f.fields[3] = { name = "n", type = "string", role = "measure", nullable = true }
        return f
    elseif case == "number_as_string" then
        return values_frame({ { "2026-11-19", "2026-11-19T12:00:00Z", "5", "1", "x", true } })
    elseif case == "big_number" then
        return values_frame({ { "2026-11-19", "2026-11-19T12:00:00Z", 12345678901234567890, "1", "x", true } })
    elseif case == "bad_decimal" then
        return values_frame({ { "2026-11-19", "2026-11-19T12:00:00Z", 1, "12abc", "x", true } })
    elseif case == "bad_date" then
        return values_frame({ { "2026-13-01", "2026-11-19T12:00:00Z", 1, "1", "x", true } })
    elseif case == "bad_time" then
        return values_frame({ { "2026-11-19", "2026-11-19T12:00:00", 1, "1", "x", true } })
    elseif case == "marker_extra_key" then
        return values_frame({ { "2026-11-19", "2026-11-19T12:00:00Z", { ["$null"] = true, x = 1 }, "1", "x", true } })
    end
    return values_frame({})
end

-- An empty cell in a field that is not nullable.
local function null_strict()
    ran("null_strict")
    return {
        schema = FRAME,
        fields = { { name = "value", type = "number", role = "measure", nullable = false } },
        rows = { { NULL } },
    }
end

-- A record and schema data with empty cells.
local function record_nulls()
    ran("record_nulls")
    return { name = "a", note = NULL, nested = { count = 2 } }
end

local function schema_nulls()
    ran("schema_nulls")
    return { items = { { label = "a", extra = NULL }, { label = NULL, extra = 1 } } }
end

-- The source of a point whose mapper does not exist.
local function source_rows()
    ran("source_rows")
    return { { a = 1 } }
end

-- Refuses the viewer with a structured error; its text must never reach the viewer.
local function refuse()
    ran("refuse")
    return nil, errors.new({
        kind = errors.PERMISSION_DENIED,
        message = "SECRET refusal text",
        details = { code = "denied" },
    })
end

-- The fixture mapper (mapper contract section 3): params.mode ok gives the example output, fail
-- fails, block takes 3 seconds (longer than the deadline of blocked_mapper).
local function mapper_modes(input)
    local params = type(input) == "table" and type(input.params) == "table" and input.params or {}
    if params.mode == "fail" then
        ran("mapper_fail")
        return nil, "the mapper failed on purpose"
    end
    if params.mode == "block" then
        ran("mapper_block")
        time.sleep("3s")
    end
    return {
        schema = FRAME,
        fields = { { name = "value", type = "number", role = "measure", nullable = false } },
        rows = { { 1 } },
    }
end

return {
    numbers = numbers, series = series, options = options, noop = noop,
    fails = fails, wrong_shape = wrong_shape, bad_cell = bad_cell, empty_series = empty_series,
    echo = echo, sleepy = sleepy, slow = slow, slow_rows = slow_rows, slow_action = slow_action,
    values = values, null_strict = null_strict, record_nulls = record_nulls, schema_nulls = schema_nulls,
    source_rows = source_rows, refuse = refuse, mapper_modes = mapper_modes,
}
