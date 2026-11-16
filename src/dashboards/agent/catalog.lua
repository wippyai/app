-- The catalogue an agent builds pages from (spec section 10): the declared data
-- points and the tile types, read from the registry at the time of the call.
-- Test fixtures are left out. A point whose output shape is `schema` belongs to a
-- plugin tile, which names it as its default point, so it is not listed alone.
local registry = require("registry")

local M = {}

local HIDDEN_NAMESPACES = { ["wippy.dashboards.fixtures"] = true }

local function namespace_of(id)
    return tostring(id):match("^(.*):[^:]+$") or ""
end

local function sorted(list, key)
    table.sort(list, function(a, b) return tostring(a[key]) < tostring(b[key]) end)
    return list
end

local function find(meta_type)
    local entries, err = registry.find({ [".kind"] = "registry.entry", ["meta.type"] = meta_type })
    if err or type(entries) ~= "table" then
        return {}
    end
    local out = {}
    for _, entry in ipairs(entries) do
        if type(entry.meta) == "table" and not HIDDEN_NAMESPACES[namespace_of(entry.id)] then
            out[#out + 1] = entry
        end
    end
    return out
end

-- Points: { id, title, description, shape, args = { name = schema }, fields = { { name, type, role } } }
function M.points()
    local out = {}
    for _, entry in ipairs(find("wippy.dashboards.point")) do
        local meta = entry.meta
        local shape = type(meta.output) == "table" and meta.output.shape or nil
        if shape and shape ~= "schema" then
            local args = {}
            local props = type(meta.args_schema) == "table" and meta.args_schema.properties or nil
            if type(props) == "table" then
                for name, schema in pairs(props) do
                    args[name] = schema
                end
            end
            out[#out + 1] = {
                id = entry.id,
                title = meta.title or entry.id,
                description = meta.description or "",
                shape = shape,
                args = args,
                fields = type(meta.fields) == "table" and meta.fields or {},
            }
        end
    end
    return sorted(out, "id")
end

-- Tiles: { tile_type, title, shapes = {...}, fields = {...}, events = {...}, self_contained, has_actions, height }
function M.tiles()
    local out = {}
    for _, entry in ipairs(find("wippy.dashboards.tile")) do
        local meta = entry.meta
        local shapes = {}
        local main = type(meta.inputs) == "table" and meta.inputs.main or nil
        local shape = type(main) == "table" and main.shape or nil
        if type(shape) == "table" then
            for _, s in ipairs(shape) do shapes[#shapes + 1] = s end
        elseif type(shape) == "string" then
            shapes[1] = shape
        end
        local events = {}
        for name in pairs(type(meta.events) == "table" and meta.events or {}) do
            events[#events + 1] = name
        end
        table.sort(events)
        local default_size = type(meta.default_size) == "table" and meta.default_size or {}
        out[#out + 1] = {
            tile_type = meta.tile_type,
            title = meta.title or meta.tile_type,
            shapes = shapes,
            fields = type(meta.fields) == "table" and meta.fields or {},
            events = events,
            self_contained = type(meta.default_data) == "table" and next(meta.default_data) ~= nil,
            has_actions = type(meta.default_actions) == "table" and next(meta.default_actions) ~= nil,
            height = type(default_size.h) == "string" and default_size.h or nil,
        }
    end
    return sorted(out, "tile_type")
end

function M.point_by_id(id)
    for _, p in ipairs(M.points()) do
        if p.id == id then
            return p
        end
    end
    return nil
end

function M.tile_by_type(tile_type)
    for _, t in ipairs(M.tiles()) do
        if t.tile_type == tile_type then
            return t
        end
    end
    return nil
end

local function arg_text(name, schema)
    local t = type(schema) == "table" and schema.type or nil
    if type(t) == "table" then
        t = table.concat(t, "|")
    end
    return name .. " (" .. tostring(t or "any") .. ")"
end

-- The Markdown catalogue appended to the agent's prompt.
function M.prompt()
    local lines = { "## Dashboard catalogue", "", "### Data points", "" }
    for _, p in ipairs(M.points()) do
        local args = {}
        for name, schema in pairs(p.args) do
            args[#args + 1] = arg_text(name, schema)
        end
        table.sort(args)
        local fields = {}
        for _, f in ipairs(p.fields) do
            fields[#fields + 1] = tostring(f.name) .. ":" .. tostring(f.type or "?") .. (f.role and ("/" .. f.role) or "")
        end
        lines[#lines + 1] = "- `" .. p.id .. "` (" .. p.shape .. ") " .. p.title
            .. (p.description ~= "" and (": " .. p.description) or "")
        if #fields > 0 then
            lines[#lines + 1] = "  fields: " .. table.concat(fields, ", ")
        end
        lines[#lines + 1] = "  args: " .. (#args > 0 and table.concat(args, ", ") or "none")
    end
    lines[#lines + 1] = ""
    lines[#lines + 1] = "### Tile types"
    lines[#lines + 1] = ""
    for _, t in ipairs(M.tiles()) do
        local line = "- `" .. t.tile_type .. "` " .. t.title
        if t.self_contained then
            line = line .. ": brings its own data, give no point"
        else
            line = line .. ": point shape " .. table.concat(t.shapes, " or ")
        end
        if #t.fields > 0 then
            line = line .. "; fields " .. table.concat(t.fields, ", ")
        end
        if #t.events > 0 then
            line = line .. "; events " .. table.concat(t.events, ", ")
        end
        if t.has_actions then
            line = line .. "; viewers can change data with it, so ask the user to confirm and pass confirmed: true"
        end
        lines[#lines + 1] = line
    end
    return table.concat(lines, "\n")
end

return M
