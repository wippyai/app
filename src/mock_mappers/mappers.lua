-- The five example mappers (mapper contract section 6). Each function gets
--   { rows, params, args, context = { time_zone, output } }
-- and returns the output, or nil and a message. They are pure: they read nothing else and
-- change nothing. See README.md: this module is a placeholder.
local lib = require("lib")

local fail = lib.fail
local is_empty = lib.is_empty

local M = {}

-- Sorted keys of a set, in byte order.
local function sorted(keys)
    table.sort(keys)
    return keys
end

-- ── rows_to_frame ────────────────────────────────────────────────────

local function rows_to_frame(input)
    local specs = input.params.fields
    local froms = {}
    local fields, names = {}, {}
    for i, spec in ipairs(specs) do
        froms[i] = spec.from
        local name = spec.name or spec.from
        if names[name] then
            fail("two fields have the name '" .. name .. "'")
        end
        names[name] = true
        fields[i] = {
            name = name,
            type = spec.type,
            role = spec.role,
            unit = spec.unit,
            additive = spec.additive,
            nullable = spec.nullable == true,
        }
    end
    lib.require_columns(input.rows, froms)

    local rows = {}
    for r, row in ipairs(input.rows) do
        local line = {}
        for i, spec in ipairs(specs) do
            local v = row[spec.from]
            if is_empty(v) then
                if not fields[i].nullable then
                    fail("column '" .. spec.from .. "' has no value in row " .. r .. ", and the field '" .. fields[i].name .. "' is not nullable")
                end
                line[i] = lib.null()
            else
                line[i] = lib.typed(spec.type, v, spec.from)
            end
        end
        rows[r] = line
    end
    return lib.frame(fields, rows)
end

-- ── bucket_by_time ───────────────────────────────────────────────────

local function bucket_by_time(input)
    local p = input.params
    local count_rows = p.value == "*"
    local columns = { p.time }
    if not count_rows then
        columns[#columns + 1] = p.value
    end
    if p.group then
        columns[#columns + 1] = p.group
    end
    lib.require_columns(input.rows, columns)

    local value_name = count_rows and "count" or p.value
    if value_name == p.bucket or (p.group and p.group == p.bucket) or (p.group and p.group == value_name) then
        fail("the output fields would share a name: '" .. p.bucket .. "', the group and '" .. value_name .. "' must differ")
    end

    local loc = lib.location(input.context and input.context.time_zone or "UTC")
    local cells, order = {}, {}
    for _, row in ipairs(input.rows) do
        if is_empty(row[p.time]) then
            fail("column '" .. p.time .. "' has no date or timestamp in a row")
        end
        local y, m, d = lib.local_date(row[p.time], p.time, loc)
        local bucket = lib.bucket_start(p.bucket, y, m, d)
        local group = nil
        if p.group then
            group = lib.text(row[p.group], p.group)
        end
        local key = bucket .. "\n" .. (group or "")
        local cell = cells[key]
        if not cell then
            cell = { bucket = bucket, group = group, total = 0 }
            cells[key] = cell
            order[#order + 1] = key
        end
        if count_rows then
            cell.total = cell.total + 1
        else
            local v = lib.number(row[p.value], p.value)
            if v ~= nil then
                cell.total = cell.total + v
            end
        end
    end

    -- By bucket, then by group in byte order. The bucket text sorts as the date does.
    table.sort(order, function(a, b)
        local x, y = cells[a], cells[b]
        if x.bucket ~= y.bucket then
            return x.bucket < y.bucket
        end
        return (x.group or "") < (y.group or "")
    end)

    local fields = { { name = p.bucket, type = "date", role = "dimension", nullable = false } }
    if p.group then
        fields[#fields + 1] = { name = p.group, type = "string", role = "dimension", nullable = false }
    end
    fields[#fields + 1] = { name = value_name, type = "number", role = "measure", additive = true, nullable = false }

    local rows = {}
    for i, key in ipairs(order) do
        local cell = cells[key]
        local line = { cell.bucket }
        if p.group then
            line[#line + 1] = cell.group
        end
        line[#line + 1] = cell.total
        rows[i] = line
    end
    return lib.frame(fields, rows)
end

-- ── sum_by ───────────────────────────────────────────────────────────

local function sum_by(input)
    local p = input.params
    local columns = { p.by }
    for _, column in ipairs(p.values) do
        if column == p.by then
            fail("'" .. column .. "' cannot be both the grouping column and a column to sum")
        end
        columns[#columns + 1] = column
    end
    lib.require_columns(input.rows, columns)

    local sums = {}
    for _, row in ipairs(input.rows) do
        local key = lib.text(row[p.by], p.by)
        local line = sums[key]
        if not line then
            line = {}
            for i = 1, #p.values do
                line[i] = 0
            end
            sums[key] = line
        end
        for i, column in ipairs(p.values) do
            local v = lib.number(row[column], column)
            if v ~= nil then
                line[i] = line[i] + v
            end
        end
    end

    local keys = {}
    for key in pairs(sums) do
        keys[#keys + 1] = key
    end
    local fields = { { name = p.by, type = "string", role = "dimension", nullable = false } }
    for _, column in ipairs(p.values) do
        fields[#fields + 1] = { name = column, type = "number", role = "measure", additive = true, nullable = false }
    end
    local rows = {}
    for i, key in ipairs(sorted(keys)) do
        local line = { key }
        for _, total in ipairs(sums[key]) do
            line[#line + 1] = total
        end
        rows[i] = line
    end
    return lib.frame(fields, rows)
end

-- ── top_n ────────────────────────────────────────────────────────────

-- Is the field named `name` additive in the output that the consumer expects?
local function additive_in(output, name)
    local fields = type(output) == "table" and output.fields or nil
    if type(fields) ~= "table" then
        return false
    end
    for _, f in ipairs(fields) do
        if f.name == name then
            return f.additive == true
        end
    end
    return false
end

local function top_n(input)
    local p = input.params
    local additive = additive_in(input.context and input.context.output, p.value)
    -- The rest can be summed only when the consumer says the field is additive.
    if p.other and not additive then
        fail("top_n with other sums the remaining rows, but the output field '" .. p.value .. "' is not additive")
    end
    lib.require_columns(input.rows, { p.by, p.value })

    local ranked = {}
    for i, row in ipairs(input.rows) do
        local v = lib.number(row[p.value], p.value)
        if v ~= nil then
            ranked[#ranked + 1] = { name = lib.text(row[p.by], p.by), value = v, at = i }
        end
    end
    -- Largest first. Rows with equal values keep their input order.
    table.sort(ranked, function(a, b)
        if a.value ~= b.value then
            return a.value > b.value
        end
        return a.at < b.at
    end)

    local rows, rest = {}, 0
    for i, item in ipairs(ranked) do
        if i <= p.n then
            rows[#rows + 1] = { item.name, item.value }
        else
            rest = rest + item.value
        end
    end
    if p.other and #ranked > p.n then
        rows[#rows + 1] = { "Other", rest }
    end
    return lib.frame({
        { name = p.by, type = "string", role = "dimension", nullable = false },
        { name = p.value, type = "number", role = "measure", additive = additive, nullable = false },
    }, rows)
end

-- ── first_row_to_record ──────────────────────────────────────────────

local function first_row_to_record(input)
    local keep = input.params.fields
    if keep then
        lib.require_columns(input.rows, keep)
    end
    local first = input.rows[1]
    local record = {}
    if first == nil then
        return record
    end
    if keep then
        for _, column in ipairs(keep) do
            if first[column] ~= nil then
                record[column] = first[column]
            end
        end
    else
        for column, v in pairs(first) do
            record[column] = v
        end
    end
    return record
end

M.rows_to_frame = lib.guard(rows_to_frame)
M.bucket_by_time = lib.guard(bucket_by_time)
M.sum_by = lib.guard(sum_by)
M.top_n = lib.guard(top_n)
M.first_row_to_record = lib.guard(first_row_to_record)

return M
