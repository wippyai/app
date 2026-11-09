-- Output shape checks for point reads (contracts section 7, spec 6.3).
-- check(output, data) returns "ready" or "empty", or nil plus
-- { field = <field name or rule> } when the data contradicts the declaration.
-- The tile's field mapping is not known to a point read, so the rules that need
-- it are checked as "the frame has a field of the right type".
local json = require("json")

local M = {}

M.FRAME = "wippy.dashboard_frame/v1"
M.MAX_TABLE_ROWS = 1000

local FIELD_TYPES = { time = true, date = true, number = true, decimal = true, string = true, boolean = true }
local FRAME_SHAPES = { scalar = true, series = true, category = true, table = true, options = true }

local function mismatch(field)
    return nil, { field = field }
end

-- A Lua table that decodes from a JSON array: keys 1..n and nothing else.
local function is_array(t)
    if type(t) ~= "table" then
        return false
    end
    local n = 0
    for k in pairs(t) do
        if type(k) ~= "number" or k < 1 or k % 1 ~= 0 then
            return false
        end
        n = n + 1
    end
    for i = 1, n do
        if t[i] == nil then
            return false
        end
    end
    return true
end

local function cell_ok(ftype, v)
    if ftype == "number" then
        return type(v) == "number" and v == v and v ~= math.huge and v ~= -math.huge
    elseif ftype == "decimal" then
        return type(v) == "string" and v:match("^%-?%d+%.?%d*$") ~= nil
    elseif ftype == "boolean" then
        return type(v) == "boolean"
    end
    return type(v) == "string"
end

local function numeric(f)
    return f.type == "number" or f.type == "decimal"
end

-- Some field i and a different field j with a(i) and b(j).
local function pair_exists(fields, a, b)
    for i, fi in ipairs(fields) do
        if a(fi) then
            for j, fj in ipairs(fields) do
                if j ~= i and b(fj) then
                    return true
                end
            end
        end
    end
    return false
end

local function check_frame(shape, data)
    if type(data) ~= "table" then
        return mismatch("data")
    end
    if data.schema ~= M.FRAME then
        return mismatch("schema")
    end
    local fields, rows = data.fields, data.rows
    if not is_array(fields) or #fields == 0 then
        return mismatch("fields")
    end
    local names = {}
    for _, f in ipairs(fields) do
        if type(f) ~= "table" or type(f.name) ~= "string" or f.name == "" or names[f.name] then
            return mismatch("fields")
        end
        names[f.name] = true
        if not FIELD_TYPES[f.type] or type(f.nullable) ~= "boolean" then
            return mismatch(f.name)
        end
    end
    if not is_array(rows) then
        return mismatch("rows")
    end
    local width = #fields
    for _, row in ipairs(rows) do
        if type(row) ~= "table" then
            return mismatch("rows")
        end
        for k in pairs(row) do
            if type(k) ~= "number" or k < 1 or k > width or k % 1 ~= 0 then
                return mismatch("rows")
            end
        end
        for c, f in ipairs(fields) do
            local v = row[c]
            -- The runtime's JSON encoder cannot write null inside an array: a hole
            -- fails the encoding, and a trailing hole would shorten the row. So
            -- a missing cell is refused whether or not the field is nullable.
            if v == nil or not cell_ok(f.type, v) then
                return mismatch(f.name)
            end
        end
    end

    -- Field rules apply to every well-formed frame, also one with no rows.
    -- Only the row-count rules wait until there are rows.
    if shape == "scalar" then
        local has_number = false
        for _, f in ipairs(fields) do
            has_number = has_number or numeric(f)
        end
        if not has_number then
            return mismatch("fields")
        end
        if #rows > 1 then
            return mismatch("rows")
        end
    elseif shape == "series" then
        local x = function(f) return f.type == "date" or f.type == "time" or f.type == "number" end
        if not pair_exists(fields, x, numeric) then
            return mismatch("fields")
        end
    elseif shape == "category" then
        local s = function(f) return f.type == "string" end
        if not pair_exists(fields, s, numeric) then
            return mismatch("fields")
        end
    elseif shape == "table" then
        if #rows > M.MAX_TABLE_ROWS then
            return mismatch("rows")
        end
    elseif shape == "options" then
        local has_value = false
        for _, f in ipairs(fields) do
            has_value = has_value or f.name == "value"
        end
        if not has_value then
            return mismatch("value")
        end
    end
    if #rows == 0 then
        return "empty"
    end
    return "ready"
end

-- ── JSON schema and data for the validator ────────────────────────────
-- An empty Lua table encodes as a list. A schema from YAML has empty maps
-- (properties: {}) and empty lists (required: []), and the data from a
-- function or a request has empty lists and empty objects. Each side is
-- converted by position, so every empty table keeps its meaning.

local SCHEMA_MAP_KEYS = { properties = true, patternProperties = true, definitions = true, ["$defs"] = true, dependentSchemas = true }
local SCHEMA_ONE_KEYS = {
    items = true, additionalItems = true, additionalProperties = true, unevaluatedProperties = true,
    contains = true, propertyNames = true, ["not"] = true, ["if"] = true, ["then"] = true, ["else"] = true,
}
local SCHEMA_LIST_KEYS = { allOf = true, anyOf = true, oneOf = true, prefixItems = true }

local function empty_object()
    return table.create(0, 1)
end

local convert_schema

local function convert_schema_list(list, depth)
    local out = {}
    for i, v in ipairs(list) do
        out[i] = convert_schema(v, depth + 1)
    end
    return out
end

-- A schema node. An empty node ({}) is the schema that accepts anything.
convert_schema = function(node, depth)
    if type(node) ~= "table" or depth > 24 then
        return node
    end
    if next(node) == nil then
        return empty_object()
    end
    local out = {}
    for k, v in pairs(node) do
        if SCHEMA_MAP_KEYS[k] and type(v) == "table" then
            local map = {}
            for name, sub in pairs(v) do
                map[name] = convert_schema(sub, depth + 1)
            end
            out[k] = next(map) == nil and empty_object() or map
        elseif SCHEMA_ONE_KEYS[k] and type(v) == "table" then
            if v[1] ~= nil then
                out[k] = convert_schema_list(v, depth)
            else
                out[k] = convert_schema(v, depth + 1)
            end
        elseif SCHEMA_LIST_KEYS[k] and type(v) == "table" then
            out[k] = convert_schema_list(v, depth)
        else
            out[k] = v
        end
    end
    return out
end

-- The schema as the validator needs it.
function M.schema_value(schema)
    return convert_schema(schema, 1)
end

local function schema_allows(schema, wanted)
    if type(schema) ~= "table" then
        return false
    end
    local t = schema.type
    if t == wanted then
        return true
    end
    if type(t) == "table" then
        for _, v in ipairs(t) do
            if v == wanted then
                return true
            end
        end
    end
    return false
end

local function is_list(t)
    local n = 0
    for k in pairs(t) do
        if type(k) ~= "number" then
            return false
        end
        n = n + 1
    end
    for i = 1, n do
        if t[i] == nil then
            return false
        end
    end
    return n > 0
end

-- Data as the validator needs it. An empty table becomes a list when the schema
-- at that place allows an array, otherwise an object. Without a schema the
-- runtime default stays (a list). Combinators ($ref, oneOf, ...) are not followed.
local function convert_data(data, schema, depth)
    if type(data) ~= "table" or depth > 24 then
        return data
    end
    local node = type(schema) == "table" and schema or nil
    if next(data) == nil then
        if node and not schema_allows(node, "array") and schema_allows(node, "object") then
            return empty_object()
        end
        return {}
    end
    local out = {}
    if is_list(data) then
        local items = node and node.items
        for i, v in ipairs(data) do
            local item_schema = items
            if type(items) == "table" and items[1] ~= nil then
                item_schema = items[i]
            end
            out[i] = convert_data(v, item_schema, depth + 1)
        end
        return out
    end
    local props = node and node.properties
    local extra = node and node.additionalProperties
    for k, v in pairs(data) do
        local sub = type(props) == "table" and props[k] or nil
        if sub == nil and type(extra) == "table" then
            sub = extra
        end
        out[k] = convert_data(v, sub, depth + 1)
    end
    return out
end

-- The data as it goes on the wire. For a declared schema this is the same value
-- that was validated, so an empty table is a list or an object as the schema says
-- (the runtime encoder alone would write every empty table as a list).
function M.wire_data(output, data)
    if type(output) == "table" and output.shape == "schema" and type(output.schema) == "table" then
        return convert_data(data, output.schema, 1)
    end
    return data
end

-- Validates a Lua value against a JSON schema. Returns true, or false plus a
-- short reason ("data" when the value cannot be encoded, "schema" otherwise).
function M.validates(schema, data)
    local text, err = json.encode(convert_data(data, schema, 1))
    if err or type(text) ~= "string" then
        return false, "data"
    end
    local ok, verr = json.validate_string(M.schema_value(schema), text)
    if not ok then
        return false, "schema", verr
    end
    return true
end

local function check_schema(schema, data)
    local ok, why = M.validates(schema, data)
    if not ok then
        return mismatch(why)
    end
    return "ready"
end

function M.check(output, data)
    local shape = type(output) == "table" and output.shape or nil
    if FRAME_SHAPES[shape] then
        return check_frame(shape, data)
    end
    if shape == "record" then
        if type(data) ~= "table" then
            return mismatch("data")
        end
        for k in pairs(data) do
            if type(k) ~= "string" then
                return mismatch("data")
            end
        end
        if next(data) == nil then
            return "empty"
        end
        return "ready"
    end
    if shape == "schema" then
        if type(data) ~= "table" then
            return mismatch("data")
        end
        if output.schema ~= nil then
            return check_schema(output.schema, data)
        end
        return "ready"
    end
    return mismatch("shape")
end

return M
