-- Page spec validation for wippy.dashboard_page/v1 (contracts sections 3, 4, 5, 11).
-- Every function returns the value, or nil plus an error table { code, message }.
-- Error codes are the publication codes of contracts section 3.
local registry = require("registry")

local M = {}

M.SPEC_NAME = "wippy.dashboard_page/v1"
M.ENTRY_NAMESPACE = "wippy.dashboards.pages"
M.MOUNT_SUFFIX = "/:part(.*)*"

M.LIMITS = { tiles = 30, points = 12, params = 8, title = 120, breakpoints = 8, depth = 8, nodes = 200 }

local RESERVED = {
    login = true, logout = true, chat = true, keeper = true, c = true,
    web = true, page = true, app = true, api = true, wc = true,
}

local PARAM_TYPES = { select = true, date = true, text = true, number = true, boolean = true }

local function fail(code, message)
    return nil, { code = code, message = message }
end

local function is_table(v)
    return type(v) == "table"
end

-- A Lua table that decodes from a JSON array: keys 1..n and nothing else.
local function is_array(t)
    if type(t) ~= "table" then
        return false
    end
    local n = 0
    for _ in pairs(t) do
        n = n + 1
    end
    for i = 1, n do
        if t[i] == nil then
            return false
        end
    end
    return true
end

local function is_name(v)
    return type(v) == "string" and v:match("^[a-z][a-z0-9_]*$") ~= nil and #v >= 1 and #v <= 41
end

function M.is_page_id(v)
    return type(v) == "string" and #v >= 2 and #v <= 41 and v:match("^[a-z][a-z0-9_]*$") ~= nil
end

function M.entry_id(page_id)
    return M.ENTRY_NAMESPACE .. ":" .. page_id
end

function M.mount_route(route)
    return route .. M.MOUNT_SUFFIX
end

-- ── registry lookups (also used by compile.lua) ───────────────────────

-- A declaration must have the wanted type and an args_schema (a non-empty JSON
-- schema table). Without a schema the engine could not validate request values.
local function get_decl(id, wanted_type)
    if type(id) ~= "string" or id == "" then
        return nil
    end
    local entry, err = registry.get(id)
    if err or not entry or type(entry.meta) ~= "table" or entry.meta.type ~= wanted_type then
        return nil
    end
    local schema = entry.meta.args_schema
    if type(schema) ~= "table" or next(schema) == nil then
        return nil
    end
    return entry
end

function M.point_decl(id)
    return get_decl(id, "wippy.dashboards.point")
end

function M.action_decl(id)
    return get_decl(id, "wippy.dashboards.action")
end

function M.tile_descriptor(tile_type)
    if type(tile_type) ~= "string" or tile_type == "" then
        return nil
    end
    local entries, err = registry.find({
        ["meta.type"] = "wippy.dashboards.tile",
        ["meta.tile_type"] = tile_type,
    })
    if err or not entries or #entries == 0 then
        return nil
    end
    return entries[1]
end

-- ── route rules ───────────────────────────────────────────────────────

local function split_segments(path)
    local segs = {}
    for seg in tostring(path):gmatch("[^/]+") do
        table.insert(segs, seg)
    end
    return segs
end

function M.validate_route(route)
    if type(route) ~= "string" then
        return fail("invalid_route", "route must be a string")
    end
    if route:sub(1, 1) ~= "/" or route:sub(-1) == "/" then
        return fail("invalid_route", "route must start with / and must not end with /")
    end
    local segs = split_segments(route)
    if #segs < 1 or #segs > 4 or route ~= "/" .. table.concat(segs, "/") then
        return fail("invalid_route", "route must have 1 to 4 segments")
    end
    for _, seg in ipairs(segs) do
        if not seg:match("^[a-z0-9][a-z0-9%-]*$") then
            return fail("invalid_route", "route segments use lower case letters, digits and hyphens")
        end
    end
    if RESERVED[segs[1]] then
        return fail("reserved_route", "the first route segment '" .. segs[1] .. "' is reserved")
    end
    return route
end

-- Static segments of a route or mountRoute: everything before the first
-- parameter segment (a segment that starts with ':').
local function static_segments(path)
    local out = {}
    for _, seg in ipairs(split_segments(path)) do
        if seg:sub(1, 1) == ":" then
            break
        end
        table.insert(out, seg:lower())
    end
    return out
end

-- Two mount routes collide when one static prefix contains the other.
local function routes_overlap(a, b)
    local sa, sb = static_segments(a), static_segments(b)
    local n = math.min(#sa, #sb)
    if n == 0 then
        return false
    end
    for i = 1, n do
        if sa[i] ~= sb[i] then
            return false
        end
    end
    return true
end

-- Refuses a route that collides with a mountRoute of any view.page entry in
-- the registry (except the page's own entry), or with the route of another
-- stored page. other_rows: { { page_id, route }, ... } from dash_pages.
function M.check_route_free(route, own_entry_id, own_page_id, other_rows)
    local pages, err = registry.find({ ["meta.type"] = "view.page" })
    if err then
        return fail("internal", "cannot read the registry")
    end
    for _, e in ipairs(pages or {}) do
        local mount = e.meta and e.meta.mountRoute
        if e.id ~= own_entry_id and type(mount) == "string" and routes_overlap(route, mount) then
            return fail("duplicate_route", "route '" .. route .. "' collides with an existing page")
        end
    end
    for _, row in ipairs(other_rows or {}) do
        if row.page_id ~= own_page_id and routes_overlap(route, row.route) then
            return fail("duplicate_route", "route '" .. route .. "' is used by another stored page")
        end
    end
    return true
end

-- ── layout size grammar ───────────────────────────────────────────────

local function positive_number(text)
    if not (text:match("^%d+$") or text:match("^%d+%.%d+$")) then
        return false
    end
    local n = tonumber(text)
    return n ~= nil and n > 0
end

-- Nfr, Npx or N%, with N a positive number. 'auto' is not allowed.
function M.valid_size(size)
    if type(size) ~= "string" then
        return false
    end
    local num = size:match("^(.-)fr$") or size:match("^(.-)px$") or size:match("^(.-)%%$")
    return num ~= nil and positive_number(num)
end

local function walk_layout(node, is_root, tile_ids, seen, where, depth, counter)
    if not is_table(node) then
        return fail("invalid_spec", where .. ": layout node must be an object")
    end
    counter.n = counter.n + 1
    if counter.n > M.LIMITS.nodes or depth > M.LIMITS.depth then
        return fail("invalid_spec", where .. ": layout is too large or too deep")
    end

    if node.panel ~= nil then
        if type(node.panel) ~= "string" then
            return fail("invalid_spec", where .. ": panel id must be a string")
        end
        if not tile_ids[node.panel] then
            return fail("invalid_spec", where .. ": panel '" .. node.panel .. "' is not a tile")
        end
        if seen[node.panel] then
            return fail("invalid_spec", where .. ": panel '" .. node.panel .. "' appears twice")
        end
        seen[node.panel] = true
        if node.size ~= nil and not M.valid_size(node.size) then
            return fail("invalid_spec", where .. ": size of panel '" .. node.panel .. "' must be Nfr, Npx or N%")
        end
        -- The layout package takes min and max track sizes in pixels only.
        for _, key in ipairs({ "minSize", "maxSize" }) do
            local v = node[key]
            if v ~= nil and not (M.valid_size(v) and type(v) == "string" and v:match("px$")) then
                return fail("invalid_spec", where .. ": " .. key .. " of panel '" .. node.panel .. "' must be Npx")
            end
        end
        for _, key in ipairs({ "fixed", "borderBefore" }) do
            if node[key] ~= nil and type(node[key]) ~= "boolean" then
                return fail("invalid_spec", where .. ": " .. key .. " of panel '" .. node.panel .. "' must be true or false")
            end
        end
        local divider = node.dividerBefore
        if divider ~= nil and divider ~= "default" and divider ~= "none" and divider ~= "line" then
            return fail("invalid_spec", where .. ": dividerBefore of panel '" .. node.panel .. "' must be default, none or line")
        end
        return true
    end

    if node.direction ~= "horizontal" and node.direction ~= "vertical" then
        return fail("invalid_spec", where .. ": a tree needs direction horizontal or vertical")
    end
    if not is_array(node.children) then
        return fail("invalid_spec", where .. ": children must be a list")
    end
    if not is_root and node.size ~= nil and not M.valid_size(node.size) then
        return fail("invalid_spec", where .. ": size of a nested tree must be Nfr, Npx or N%")
    end
    for _, child in ipairs(node.children) do
        local ok, err = walk_layout(child, false, tile_ids, seen, where, depth + 1, counter)
        if not ok then
            return nil, err
        end
    end
    return true
end

local function validate_layout(layout, tile_ids)
    if not is_table(layout) then
        return fail("invalid_spec", "layout must be an object")
    end
    local breakpoints = layout.breakpoints or {}
    if not is_table(breakpoints) then
        return fail("invalid_spec", "layout.breakpoints must be an object")
    end
    local bp_count = 0
    for name, px in pairs(breakpoints) do
        bp_count = bp_count + 1
        if not is_name(name) or name == "default" then
            return fail("invalid_spec", "bad breakpoint name")
        end
        if type(px) ~= "number" or px <= 0 then
            return fail("invalid_spec", "breakpoint '" .. name .. "' must be a positive number")
        end
    end
    if bp_count > M.LIMITS.breakpoints then
        return fail("invalid_spec", "too many breakpoints")
    end
    local layouts = layout.layouts
    if not is_table(layouts) or not is_table(layouts.default) then
        return fail("invalid_spec", "layout.layouts.default is required")
    end
    for name in pairs(layouts) do
        if name ~= "default" and breakpoints[name] == nil then
            return fail("invalid_spec", "layout '" .. tostring(name) .. "' is not a breakpoint")
        end
    end
    local expected = 0
    for _ in pairs(tile_ids) do
        expected = expected + 1
    end
    -- Every breakpoint needs its layout, and every layout holds every tile once.
    local names = { "default" }
    for name in pairs(breakpoints) do
        table.insert(names, name)
    end
    for _, name in ipairs(names) do
        local tree = layouts[name]
        if tree == nil then
            return fail("invalid_spec", "breakpoint '" .. name .. "' has no layout")
        end
        local seen = {}
        local ok, err = walk_layout(tree, true, tile_ids, seen, "layout '" .. name .. "'", 1, { n = 0 })
        if not ok then
            return nil, err
        end
        for id in pairs(tile_ids) do
            if not seen[id] then
                return fail("invalid_spec", "layout '" .. name .. "' does not place tile '" .. id .. "'")
            end
        end
    end
    return true
end

-- ── parts of the spec ─────────────────────────────────────────────────

-- True when a $param or $event reference sits anywhere inside the value (or
-- the value is nested too deeply to check).
local function holds_reference(value, depth)
    if type(value) ~= "table" then
        return false
    end
    if depth > 8 or value["$param"] ~= nil or value["$event"] ~= nil then
        return true
    end
    for _, v in pairs(value) do
        if holds_reference(v, depth + 1) then
            return true
        end
    end
    return false
end

-- Each value in a point or action args table is either a constant with no
-- reference inside it, or exactly { "$param": "<declared parameter>" }. A mix
-- would let a request replace the constant part of a structured value.
local function check_args(args, params, where)
    for key, value in pairs(args) do
        if type(key) ~= "string" then
            return fail("invalid_spec", where .. ": args must be an object")
        end
        if is_table(value) and value["$param"] ~= nil then
            local count = 0
            for _ in pairs(value) do
                count = count + 1
            end
            local name = value["$param"]
            if count ~= 1 or type(name) ~= "string" or params[name] == nil then
                return fail("invalid_spec", where .. ": arg '" .. key .. "' must be exactly { \"$param\": <declared parameter> }")
            end
        elseif holds_reference(value, 1) then
            return fail("invalid_spec", where .. ": arg '" .. key .. "' mixes a constant with a $param or $event; a $param must be the whole value")
        end
    end
    return true
end

local function validate_params(params)
    local out, count = {}, 0
    for name, p in pairs(params) do
        count = count + 1
        if not is_name(name) then
            return fail("invalid_spec", "bad parameter name")
        end
        if not is_table(p) or not PARAM_TYPES[p.type] then
            return fail("invalid_spec", "parameter '" .. name .. "' needs a type: select, date, text, number or boolean")
        end
        if p.label ~= nil and (type(p.label) ~= "string" or #p.label > 120) then
            return fail("invalid_spec", "parameter '" .. name .. "' has a bad label")
        end
        if p.from_path ~= nil and (type(p.from_path) ~= "number" or p.from_path < 0 or p.from_path % 1 ~= 0) then
            return fail("invalid_spec", "parameter '" .. name .. "' has a bad from_path")
        end
        out[name] = p
    end
    if count > M.LIMITS.params then
        return fail("invalid_spec", "at most " .. M.LIMITS.params .. " parameters per page")
    end
    return out
end

local function validate_points(data, params)
    local decls, count = {}, 0
    for name, p in pairs(data) do
        count = count + 1
        if not is_name(name) then
            return fail("invalid_spec", "bad data point name")
        end
        if not is_table(p) or (p.kind ~= nil and p.kind ~= "function") then
            return fail("invalid_spec", "data point '" .. name .. "' must be of kind function")
        end
        local decl = M.point_decl(p.ref)
        if not decl then
            return fail("undeclared_point", "data point '" .. name .. "' does not name a point declaration with an args_schema")
        end
        if p.args ~= nil then
            if not is_table(p.args) then
                return fail("invalid_spec", "data point '" .. name .. "' args must be an object")
            end
            local ok, err = check_args(p.args, params, "data point '" .. name .. "'")
            if not ok then
                return nil, err
            end
        end
        decls[name] = decl
    end
    if count > M.LIMITS.points then
        return fail("invalid_spec", "at most " .. M.LIMITS.points .. " data points per page")
    end
    return decls
end

local function validate_actions(actions, params)
    local decls = {}
    for name, a in pairs(actions) do
        if not is_name(name) then
            return fail("invalid_spec", "bad action name")
        end
        if not is_table(a) or (a.kind ~= nil and a.kind ~= "function") then
            return fail("invalid_spec", "action '" .. name .. "' must be of kind function")
        end
        local decl = M.action_decl(a.ref)
        if not decl then
            return fail("undeclared_action", "action '" .. name .. "' does not name an action declaration with an args_schema")
        end
        if a.args ~= nil then
            if not is_table(a.args) then
                return fail("invalid_spec", "action '" .. name .. "' args must be an object")
            end
            local ok, err = check_args(a.args, params, "action '" .. name .. "'")
            if not ok then
                return nil, err
            end
        end
        decls[name] = decl
    end
    return decls
end

-- shape_ok: does a point's output shape satisfy a tile input's shape?
-- A descriptor shape is a string or a list of strings. 'none' accepts any.
local function shape_ok(want, got)
    if type(want) == "table" then
        for _, w in ipairs(want) do
            if shape_ok(w, got) then
                return true
            end
        end
        return false
    end
    return want == "none" or want == got
end

local function point_with_ref(data, ref)
    for name, p in pairs(data) do
        if p.ref == ref then
            return name
        end
    end
    return nil
end

-- A plugin tile names its default points and actions in its descriptor (spec 8.6). When the
-- page does not declare one, add it to the page under a free local name, so a page can place
-- the tile with only its type. The validated spec, with these additions, is what gets stored.
local function free_name(map, preferred, fallback)
    if map[preferred] == nil then
        return preferred
    end
    if map[fallback] == nil then
        return fallback
    end
    return nil
end

local function add_tile_defaults(spec)
    for id, tile in pairs(spec.tiles) do
        local desc = is_table(tile) and type(tile.type) == "string" and M.tile_descriptor(tile.type) or nil
        local dmeta = desc and desc.meta or {}
        if is_table(dmeta.default_data) then
            for input, decl_id in pairs(dmeta.default_data) do
                local set_by_tile = is_table(tile.data) and tile.data[input] ~= nil
                if type(decl_id) == "string" and not set_by_tile and point_with_ref(spec.data, decl_id) == nil then
                    local name = free_name(spec.data, id, id .. "_" .. tostring(input))
                    if name then
                        spec.data[name] = { kind = "function", ref = decl_id }
                    end
                end
            end
        end
        if is_table(dmeta.default_actions) then
            for action, decl_id in pairs(dmeta.default_actions) do
                local set_by_tile = is_table(tile.actions) and tile.actions[action] ~= nil
                if type(decl_id) == "string" and not set_by_tile and point_with_ref(spec.actions, decl_id) == nil then
                    local name = free_name(spec.actions, tostring(action), id .. "_" .. tostring(action))
                    if name then
                        spec.actions[name] = { kind = "function", ref = decl_id }
                    end
                end
            end
        end
    end
end

local function validate_tile(id, tile, spec, point_decls, action_decls)
    local where = "tile '" .. id .. "'"
    if not is_name(id) then
        return fail("invalid_spec", "bad tile id")
    end
    if not is_table(tile) or type(tile.type) ~= "string" then
        return fail("invalid_spec", where .. " needs a type")
    end
    local desc = M.tile_descriptor(tile.type)
    if not desc then
        return fail("unknown_tile", where .. " has an unknown type '" .. tile.type .. "'")
    end
    local dmeta = desc.meta
    local inputs = is_table(dmeta.inputs) and dmeta.inputs or {}

    -- data: input name -> page-local point name; defaults fill the rest.
    local data = {}
    if tile.data ~= nil then
        if not is_table(tile.data) then
            return fail("invalid_spec", where .. ": data must be an object")
        end
        for input, point in pairs(tile.data) do
            if not is_name(input) then
                return fail("invalid_spec", where .. ": data keys must be input names")
            end
            data[input] = point
        end
    end
    if is_table(dmeta.default_data) then
        for input, decl_id in pairs(dmeta.default_data) do
            if data[input] == nil then
                local local_name = point_with_ref(spec.data, decl_id)
                if not local_name then
                    return fail("undeclared_point", where .. ": the page does not declare the default point of input '" .. input .. "'")
                end
                data[input] = local_name
            end
        end
    end
    for input, point in pairs(data) do
        if type(point) ~= "string" or spec.data[point] == nil then
            return fail("undeclared_point", where .. ": input '" .. tostring(input) .. "' names a point the page does not declare")
        end
        local input_def = inputs[input]
        if not is_table(input_def) then
            return fail("invalid_spec", where .. ": the tile type has no input '" .. tostring(input) .. "'")
        end
        local out = point_decls[point].meta.output
        local got = is_table(out) and out.shape or nil
        if not shape_ok(input_def.shape, got) then
            return fail("format_mismatch", where .. ": input '" .. input .. "' does not accept the shape of point '" .. point .. "'")
        end
    end

    -- actions: tile action name -> page-local action name.
    local actions = {}
    if tile.actions ~= nil then
        if not is_table(tile.actions) then
            return fail("invalid_spec", where .. ": actions must be an object")
        end
        for name, action in pairs(tile.actions) do
            if not is_name(name) then
                return fail("invalid_spec", where .. ": action keys must be action names")
            end
            actions[name] = action
        end
    end
    if is_table(dmeta.default_actions) then
        for name, decl_id in pairs(dmeta.default_actions) do
            if actions[name] == nil then
                local local_name
                for aname, a in pairs(spec.actions) do
                    if a.ref == decl_id then
                        local_name = aname
                    end
                end
                if not local_name then
                    return fail("undeclared_action", where .. ": the page does not declare the default action '" .. name .. "'")
                end
                actions[name] = local_name
            end
        end
    end
    for name, action in pairs(actions) do
        if type(action) ~= "string" or spec.actions[action] == nil then
            return fail("undeclared_action", where .. ": action '" .. tostring(name) .. "' names an action the page does not declare")
        end
    end

    -- param: a control tile writes one page parameter.
    if tile.param ~= nil then
        local p = type(tile.param) == "string" and spec.params[tile.param] or nil
        if not p then
            return fail("invalid_spec", where .. ": param names an undeclared parameter")
        end
        if p.options ~= nil then
            if not is_table(p.options) or type(p.options.data) ~= "string" or spec.data[p.options.data] == nil then
                return fail("undeclared_point", where .. ": the options point of parameter '" .. tile.param .. "' is not declared")
            end
            local out = point_decls[p.options.data].meta.output
            if not is_table(out) or out.shape ~= "options" then
                return fail("format_mismatch", where .. ": the options point of parameter '" .. tile.param .. "' must have the shape options")
            end
        end
    end

    -- params the tile reads directly
    if tile.params ~= nil then
        if not is_array(tile.params) then
            return fail("invalid_spec", where .. ": params must be a list")
        end
        for _, name in ipairs(tile.params) do
            if type(name) ~= "string" or spec.params[name] == nil then
                return fail("invalid_spec", where .. ": params names an undeclared parameter")
            end
        end
    end

    -- fields
    if tile.fields ~= nil then
        if not is_table(tile.fields) then
            return fail("invalid_spec", where .. ": fields must be an object")
        end
        local allowed = {}
        local has_allowed = false
        if is_table(dmeta.fields) then
            for _, f in ipairs(dmeta.fields) do
                allowed[f] = true
                has_allowed = true
            end
        end
        for key, value in pairs(tile.fields) do
            if has_allowed and not allowed[key] then
                return fail("invalid_spec", where .. ": the tile type has no field '" .. tostring(key) .. "'")
            end
            local ok = type(value) == "string"
            if is_table(value) then
                ok = is_array(value)
                for _, v in ipairs(value) do
                    ok = ok and type(v) == "string"
                end
            end
            if not ok then
                return fail("invalid_spec", where .. ": field '" .. tostring(key) .. "' must map to a field name or a list of them")
            end
        end
    end

    if tile.options ~= nil and not is_table(tile.options) then
        return fail("invalid_spec", where .. ": options must be an object")
    end

    -- on: event name -> { set = { param = value | { $event = "x" } } }
    if tile.on ~= nil then
        if not is_table(tile.on) then
            return fail("invalid_spec", where .. ": on must be an object")
        end
        local events = is_table(dmeta.events) and dmeta.events or {}
        for event, handler in pairs(tile.on) do
            if events[event] == nil then
                return fail("invalid_spec", where .. ": the tile type has no event '" .. tostring(event) .. "'")
            end
            if not is_table(handler) or not is_table(handler.set) then
                return fail("invalid_spec", where .. ": handler of '" .. event .. "' needs a 'set' object")
            end
            for pname in pairs(handler.set) do
                if spec.params[pname] == nil then
                    return fail("invalid_spec", where .. ": handler of '" .. event .. "' sets an undeclared parameter")
                end
            end
        end
    end

    return { descriptor = desc, data = data, actions = actions }
end

-- ── public: validate a whole page spec ────────────────────────────────

-- Returns the checked spec (with defaults for missing tables) or nil, err.
function M.validate(spec)
    if not is_table(spec) then
        return fail("invalid_spec", "the body must be a JSON object")
    end
    if spec.spec ~= M.SPEC_NAME then
        return fail("invalid_spec", "spec must be '" .. M.SPEC_NAME .. "'")
    end
    if not M.is_page_id(spec.id) then
        return fail("invalid_spec", "id must match ^[a-z][a-z0-9_]{1,40}$")
    end
    if type(spec.title) ~= "string" or #spec.title < 1 or #spec.title > M.LIMITS.title or spec.title:find("%c") then
        return fail("invalid_spec", "title must be a string of 1 to " .. M.LIMITS.title .. " characters without control characters")
    end
    if spec.icon ~= nil and (type(spec.icon) ~= "string" or #spec.icon > 80 or spec.icon:find("%c")) then
        return fail("invalid_spec", "icon must be a string of at most 80 characters without control characters")
    end
    if spec.order ~= nil and (type(spec.order) ~= "number" or spec.order % 1 ~= 0 or spec.order < 0 or spec.order > 10000) then
        return fail("invalid_spec", "order must be an integer from 0 to 10000")
    end
    if spec.time_zone ~= nil and (type(spec.time_zone) ~= "string" or #spec.time_zone > 64) then
        return fail("invalid_spec", "bad time_zone")
    end

    local ok, err = M.validate_route(spec.route)
    if not ok then
        return nil, err
    end

    for _, key in ipairs({ "params", "data", "actions", "tiles" }) do
        if spec[key] == nil then
            spec[key] = {}
        elseif not is_table(spec[key]) then
            return fail("invalid_spec", key .. " must be an object")
        end
    end

    local tile_count = 0
    for _ in pairs(spec.tiles) do
        tile_count = tile_count + 1
    end
    if tile_count > M.LIMITS.tiles then
        return fail("invalid_spec", "at most " .. M.LIMITS.tiles .. " tiles per page")
    end

    local params, perr = validate_params(spec.params)
    if not params then
        return nil, perr
    end
    add_tile_defaults(spec)
    local point_decls, derr = validate_points(spec.data, spec.params)
    if not point_decls then
        return nil, derr
    end
    local action_decls, aerr = validate_actions(spec.actions, spec.params)
    if not action_decls then
        return nil, aerr
    end

    -- A parameter's option source must be a declared point.
    for name, p in pairs(spec.params) do
        if p.options ~= nil then
            if not is_table(p.options) or type(p.options.data) ~= "string" or spec.data[p.options.data] == nil then
                return fail("undeclared_point", "parameter '" .. name .. "' options name a point the page does not declare")
            end
        end
    end

    local tile_ids = {}
    for id, tile in pairs(spec.tiles) do
        local info, terr = validate_tile(id, tile, spec, point_decls, action_decls)
        if not info then
            return nil, terr
        end
        tile_ids[id] = true
    end

    local lok, lerr = validate_layout(spec.layout, tile_ids)
    if not lok then
        return nil, lerr
    end

    return spec
end

return M
