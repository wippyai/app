-- Helpers of the example mappers. Pure: no database, no network, no files, no registry and no
-- clock. Only the `time` module is used, to read a timestamp in a named time zone.
local time = require("time")

local M = {}

M.FRAME = "wippy.dashboard_frame/v1"

-- ── errors ───────────────────────────────────────────────────────────

-- Stops the mapper with a message. guard() turns it into the `nil, message` that a mapper returns.
function M.fail(message)
    error({ mapper_message = message }, 0)
end

-- Wraps a mapper function: a stop from fail() becomes `nil, message`, any other error too.
function M.guard(fn)
    return function(input)
        local ok, result = pcall(fn, input)
        if ok then
            return result
        end
        if type(result) == "table" and result.mapper_message then
            return nil, result.mapper_message
        end
        return nil, "mapper stopped: " .. tostring(result)
    end
end

-- ── cells ────────────────────────────────────────────────────────────

function M.null()
    return { ["$null"] = true }
end

-- An empty cell is nil (missing) or the marker { ["$null"] = true }.
function M.is_empty(v)
    if type(v) ~= "table" or v["$null"] ~= true then
        return v == nil
    end
    local first = next(v)
    return first == "$null" and next(v, first) == nil
end

local function finite(v)
    return type(v) == "number" and v == v and v ~= math.huge and v ~= -math.huge
end

-- A `number` value to sum or compare. Returns nil for an empty cell. A value of another type,
-- a `decimal` (a string) among them, stops the mapper and names the column.
function M.number(v, column)
    if M.is_empty(v) then
        return nil
    end
    if not finite(v) then
        M.fail("column '" .. column .. "' holds a value that is not a number (" .. type(v) .. "); only number values are summed or compared, not decimal")
    end
    return v
end

-- A text value of a grouping column. An empty cell stops the mapper.
function M.text(v, column)
    if type(v) ~= "string" then
        M.fail("column '" .. column .. "' must hold text in every row")
    end
    return v
end

-- A cell of a frame field of the given type. Returns the cell, or stops and names the column.
function M.typed(ftype, v, column)
    local ok
    if ftype == "number" then
        ok = finite(v)
    elseif ftype == "decimal" then
        ok = type(v) == "string" and v:match("^%-?%d+%.?%d*$") ~= nil
    elseif ftype == "boolean" then
        ok = type(v) == "boolean"
    else
        ok = type(v) == "string"
    end
    if not ok then
        M.fail("column '" .. column .. "' holds a value that is not of type " .. ftype)
    end
    return v
end

-- With rows, each column must appear in at least one row. With no rows nothing is checked.
function M.require_columns(rows, columns)
    if #rows == 0 then
        return
    end
    for _, column in ipairs(columns) do
        local found = false
        for _, row in ipairs(rows) do
            if type(row) == "table" and row[column] ~= nil then
                found = true
                break
            end
        end
        if not found then
            M.fail("column '" .. column .. "' is missing from every row")
        end
    end
end

function M.frame(fields, rows)
    return { schema = M.FRAME, fields = fields, rows = rows }
end

-- ── dates ────────────────────────────────────────────────────────────

-- Days since 1970-01-01 of a calendar date (proleptic Gregorian).
local function days_from_civil(y, m, d)
    if m <= 2 then
        y = y - 1
    end
    local era = math.floor(y / 400)
    local yoe = y - era * 400
    local mp = (m + 9) % 12
    local doy = math.floor((153 * mp + 2) / 5) + d - 1
    local doe = yoe * 365 + math.floor(yoe / 4) - math.floor(yoe / 100) + doy
    return era * 146097 + doe - 719468
end

local function civil_from_days(z)
    z = z + 719468
    local era = math.floor(z / 146097)
    local doe = z - era * 146097
    local yoe = math.floor((doe - math.floor(doe / 1460) + math.floor(doe / 36524) - math.floor(doe / 146096)) / 365)
    local y = yoe + era * 400
    local doy = doe - (365 * yoe + math.floor(yoe / 4) - math.floor(yoe / 100))
    local mp = math.floor((5 * doy + 2) / 153)
    local d = doy - math.floor((153 * mp + 2) / 5) + 1
    local m = mp < 10 and mp + 3 or mp - 9
    if m <= 2 then
        y = y + 1
    end
    return y, m, d
end

local function date_text(y, m, d)
    return string.format("%04d-%02d-%02d", y, m, d)
end

-- The location of a time zone name. A name that the runtime does not know stops the mapper.
function M.location(name)
    local loc, err = time.load_location(name or "UTC")
    if err or not loc then
        M.fail("unknown time zone '" .. tostring(name) .. "'")
    end
    return loc
end

-- The calendar date (year, month, day) of a date or timestamp value in a time zone.
-- A date (YYYY-MM-DD) is that date. A timestamp is read as RFC 3339; one with no zone is UTC.
function M.local_date(value, column, loc)
    if type(value) ~= "string" then
        M.fail("column '" .. column .. "' must hold a date or a timestamp")
    end
    local y, m, d = value:match("^(%d%d%d%d)-(%d%d)-(%d%d)$")
    if y then
        return tonumber(y), tonumber(m), tonumber(d)
    end
    local text = (value:gsub("^(%d%d%d%d%-%d%d%-%d%d) ", "%1T"))
    if not text:match("^%d%d%d%d%-%d%d%-%d%dT%d%d:%d%d:%d%d") then
        M.fail("column '" .. column .. "' holds a value that is not a date or a timestamp")
    end
    if not (text:match("Z$") or text:match("[+-]%d%d:%d%d$")) then
        text = text .. "Z"
    end
    local t, err = time.parse(time.RFC3339, text)
    if err or not t then
        M.fail("column '" .. column .. "' holds a value that is not a date or a timestamp")
    end
    return t:in_location(loc):date()
end

-- The first day of the bucket that holds a date, as YYYY-MM-DD. A week starts on Monday.
function M.bucket_start(bucket, y, m, d)
    if bucket == "month" then
        return date_text(y, m, 1)
    elseif bucket == "week" then
        local z = days_from_civil(y, m, d)
        -- 1970-01-01 was a Thursday: with Monday as 0, the weekday of day z is (z + 3) % 7.
        return date_text(civil_from_days(z - (z + 3) % 7))
    end
    return date_text(y, m, d)
end

return M
