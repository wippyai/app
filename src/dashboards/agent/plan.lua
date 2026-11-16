-- Turns an agent's dashboard plan (the input of the BuildDashboard tool) into a
-- wippy.dashboard_page/v1 spec. The agent chooses the content: points, tiles,
-- fields, labels, filters, click behaviour and the order of rows. This code
-- builds what must always be right: ids, the route, argument bindings and the
-- two layout trees. compile() returns the spec, or nil and a list of errors in
-- words the agent can act on. The engine validates the spec again on publish.
local catalog = require("catalog")

local M = {}

M.NOTE_POINT = "wippy.dashboards.agent:note"
M.MAX_TILES = 12
M.ROUTE_PREFIX = "/dash/"

local CHART_KINDS = { bar = true, line = true, pie = true, doughnut = true, polarArea = true, radar = true }

-- Heights when a descriptor names none.
local FALLBACK_HEIGHT = { kpi = "140px", ["control.select"] = "120px", text = "140px", chart = "320px", table = "320px" }

local function is_name(v)
    return type(v) == "string" and v:match("^[a-z][a-z0-9_]*$") ~= nil and #v <= 41
end

-- Lower case letters and digits joined by `sep` ("_" or "-"), with no separator at either end.
local function slug(text, sep)
    local esc = sep == "-" and "%-" or sep
    local s = tostring(text or ""):lower():gsub("[^a-z0-9]+", sep)
    s = s:gsub("^" .. esc .. "+", "")
    s = s:gsub(esc .. "+$", "")
    return s
end

local function px(height)
    return tonumber(tostring(height or ""):match("^(%d+)px$")) or 0
end

local function field_names(point)
    local names, by_role = {}, { dimension = {}, measure = {} }
    for _, f in ipairs(point.fields) do
        names[f.name] = f
        if by_role[f.role] then
            table.insert(by_role[f.role], f.name)
        end
    end
    return names, by_role
end

-- Fills the fields a tile type needs from the point's fields, when the plan leaves them out.
local function default_fields(tile_type, point)
    local _, by_role = field_names(point)
    if tile_type == "kpi" then
        local first = by_role.measure[1] or (point.fields[1] and point.fields[1].name)
        return first and { value = first } or nil
    end
    if tile_type == "chart" then
        local x = by_role.dimension[1]
        local series = by_role.dimension[2]
        local y = by_role.measure[1]
        if x and y then
            return { x = x, y = { y }, series = series }
        end
    end
    return nil
end

-- Checks a tile's field mapping against the point's fields.
local function check_fields(errs, where, fields, point)
    local names = field_names(point)
    if #point.fields == 0 then
        return
    end
    for key, value in pairs(fields) do
        local list = type(value) == "table" and value or { value }
        for _, name in ipairs(list) do
            if not names[name] then
                local known = {}
                for _, f in ipairs(point.fields) do known[#known + 1] = f.name end
                errs[#errs + 1] = where .. ": field " .. key .. " maps to '" .. tostring(name)
                    .. "', but point " .. point.id .. " has only " .. table.concat(known, ", ")
            end
        end
    end
end

local function bind_args(errs, where, args, point, filters)
    local out = {}
    if args == nil then
        return out
    end
    if type(args) ~= "table" then
        errs[#errs + 1] = where .. ": args must be an object"
        return out
    end
    for name, value in pairs(args) do
        if point.args[name] == nil then
            local known = {}
            for n in pairs(point.args) do known[#known + 1] = n end
            table.sort(known)
            errs[#errs + 1] = where .. ": point " .. point.id .. " has no argument '" .. tostring(name)
                .. "'" .. (#known > 0 and (" (it takes " .. table.concat(known, ", ") .. ")") or " (it takes none)")
        elseif type(value) == "table" and value.filter ~= nil then
            if not filters[value.filter] then
                errs[#errs + 1] = where .. ": argument " .. name .. " uses filter '" .. tostring(value.filter) .. "', which the plan does not declare"
            else
                out[name] = { ["$param"] = value.filter }
            end
        else
            out[name] = value
        end
    end
    return out
end

-- Rows: a list of rows, each a list of { tile, width }. Tiles left out get rows of their own kind.
local function arrange(plan_rows, tiles, order)
    local placed, rows = {}, {}
    if type(plan_rows) == "table" then
        for _, row in ipairs(plan_rows) do
            local out = {}
            for _, slot in ipairs(type(row) == "table" and row or {}) do
                local id = type(slot) == "table" and slot.tile or slot
                if tiles[id] and not placed[id] then
                    placed[id] = true
                    out[#out + 1] = { id = id, width = tonumber(type(slot) == "table" and slot.width or nil) or 0 }
                end
            end
            if #out > 0 then
                rows[#rows + 1] = out
            end
        end
    end
    -- Unplaced tiles: small tiles four to a row, others two to a row, in plan order.
    local pending = {}
    for _, id in ipairs(order) do
        if not placed[id] then
            pending[#pending + 1] = id
        end
    end
    local i = 1
    while i <= #pending do
        local small = px(tiles[pending[i]].height) <= 140
        local per_row = small and 4 or 2
        local out = {}
        while i <= #pending and #out < per_row and (px(tiles[pending[i]].height) <= 140) == small do
            out[#out + 1] = { id = pending[i], width = 0 }
            i = i + 1
        end
        rows[#rows + 1] = out
    end
    -- Widths: keep the plan's proportions, fill missing ones equally, sum to 100.
    for _, row in ipairs(rows) do
        local given, missing = 0, 0
        for _, slot in ipairs(row) do
            if slot.width > 0 then given = given + slot.width else missing = missing + 1 end
        end
        local fill = missing > 0 and math.max((100 - math.min(given, 100)) / missing, 100 / #row / 2) or 0
        local total = 0
        for _, slot in ipairs(row) do
            if slot.width <= 0 then slot.width = fill end
            total = total + slot.width
        end
        local used = 0
        for n, slot in ipairs(row) do
            if n < #row then
                slot.width = math.floor(slot.width / total * 100 + 0.5)
                used = used + slot.width
            else
                slot.width = 100 - used
            end
        end
    end
    return rows
end

local function layouts(rows, tiles)
    local wide, narrow = {}, {}
    for _, row in ipairs(rows) do
        local height, children = 0, {}
        for _, slot in ipairs(row) do
            local h = px(tiles[slot.id].height)
            if h > height then height = h end
            children[#children + 1] = { panel = slot.id, size = slot.width .. "%" }
            narrow[#narrow + 1] = { panel = slot.id, size = tiles[slot.id].height }
        end
        wide[#wide + 1] = { direction = "horizontal", size = height .. "px", children = children }
    end
    return {
        breakpoints = { lg = 1024 },
        layouts = {
            default = { direction = "vertical", children = narrow },
            lg = { direction = "vertical", children = wide },
        },
    }
end

-- Adds one planned tile to state.tiles, or an error to state.errs.
function M.compile_tile(state, n, t)
    local errs, data, filters = state.errs, state.data, state.filters
    if type(t) ~= "table" then
        errs[#errs + 1] = "tile " .. n .. " must be an object"
        return
    end
    local id = is_name(t.id) and t.id or ("tile_" .. n)
    if state.tiles[id] then
        id = id .. "_" .. n
    end
    local where = "tile " .. id
    local desc = catalog.tile_by_type(t.type)
    if not desc then
        errs[#errs + 1] = where .. ": unknown tile type '" .. tostring(t.type) .. "'"
        return
    end
    local tile = { type = desc.tile_type }
    local options = {}
    if type(t.label) == "string" and t.label ~= "" then
        options.label = t.label
    end
    if desc.has_actions then
        state.needs_confirmation = true
    end

    if desc.tile_type == "control.select" then
        if filters[t.filter] ~= "select" then
            errs[#errs + 1] = where .. ": a control.select tile needs filter = the name of a select filter"
        else
            tile.param = t.filter
        end
    elseif desc.self_contained then
        -- A plugin tile brings its own point.
    elseif desc.tile_type == "text" and type(t.text) == "string" and t.text ~= "" then
        data[id] = { kind = "function", ref = M.NOTE_POINT, args = { text = t.text:sub(1, 500) } }
        tile.data = { main = id }
    else
        local point = catalog.point_by_id(t.point)
        if not point then
            errs[#errs + 1] = where .. ": unknown point '" .. tostring(t.point) .. "'"
            return
        end
        local shape_ok = false
        for _, s in ipairs(desc.shapes) do
            if s == point.shape or s == "none" then shape_ok = true end
        end
        if not shape_ok then
            errs[#errs + 1] = where .. ": tile type " .. desc.tile_type .. " needs a point of shape "
                .. table.concat(desc.shapes, " or ") .. ", and " .. point.id .. " is " .. point.shape
        end
        data[id] = { kind = "function", ref = point.id, args = bind_args(errs, where, t.args, point, filters) }
        tile.data = { main = id }
        local fields = type(t.fields) == "table" and next(t.fields) ~= nil and t.fields or default_fields(desc.tile_type, point)
        if fields then
            check_fields(errs, where, fields, point)
            tile.fields = fields
        end
    end

    if desc.tile_type == "chart" then
        if t.kind ~= nil and not CHART_KINDS[t.kind] then
            errs[#errs + 1] = where .. ": kind must be bar, line, pie, doughnut, polarArea or radar"
        else
            options.kind = t.kind
        end
        if t.click_sets ~= nil then
            if not filters[t.click_sets] then
                errs[#errs + 1] = where .. ": click_sets names filter '" .. tostring(t.click_sets) .. "', which the plan does not declare"
            else
                tile.on = { select = { set = { [t.click_sets] = { ["$event"] = "x" } } } }
            end
        end
    end

    if next(options) ~= nil then
        tile.options = options
    end
    state.tiles[id] = tile
    state.plan_tiles[id] = { height = desc.height or FALLBACK_HEIGHT[desc.tile_type] or "320px" }
    state.order[#state.order + 1] = id
end

-- compile(plan) -> spec | nil, { errors }
function M.compile(plan)
    local errs = {}
    if type(plan) ~= "table" then
        return nil, { "the plan must be an object" }
    end
    local title = type(plan.title) == "string" and plan.title:gsub("^%s+", ""):gsub("%s+$", "") or ""
    if title == "" or #title > 80 then
        errs[#errs + 1] = "title is required, up to 80 characters"
    end

    -- filters -> page parameters
    local params, data, filters = {}, {}, {}
    for n, f in ipairs(type(plan.filters) == "table" and plan.filters or {}) do
        local where = "filter " .. n
        if type(f) ~= "table" or not is_name(f.name) then
            errs[#errs + 1] = where .. ": name must be lower case letters, digits and _"
        elseif f.type == "select" then
            local options = catalog.point_by_id(f.options_point)
            if not options or options.shape ~= "options" then
                errs[#errs + 1] = "filter " .. f.name .. ": options_point must be a point of shape options"
            else
                local key = f.name .. "_options"
                data[key] = { kind = "function", ref = options.id }
                params[f.name] = { type = "select", label = f.label or f.name, options = { data = key } }
                filters[f.name] = "select"
            end
        elseif f.type == "date" then
            params[f.name] = { type = "date", label = f.label or f.name }
            filters[f.name] = "date"
        else
            errs[#errs + 1] = "filter " .. f.name .. ": type must be select or date"
        end
    end

    -- tiles
    local state = { errs = errs, data = data, filters = filters, tiles = {}, plan_tiles = {}, order = {}, needs_confirmation = false }
    local list = type(plan.tiles) == "table" and plan.tiles or {}
    if #list == 0 then
        errs[#errs + 1] = "tiles must list at least one tile"
    elseif #list > M.MAX_TILES then
        errs[#errs + 1] = "use at most " .. M.MAX_TILES .. " tiles"
    end
    for n, t in ipairs(list) do
        M.compile_tile(state, n, t)
    end
    local tiles, plan_tiles, order = state.tiles, state.plan_tiles, state.order

    if state.needs_confirmation and plan.confirmed ~= true then
        errs[#errs + 1] = "this page has a tile that lets viewers change data; ask the user to confirm, then call again with confirmed: true"
    end
    if #errs > 0 then
        return nil, errs
    end

    local base = slug(title, "_")
    if base == "" then base = "page" end
    local id = ("gen_" .. base):sub(1, 41):gsub("_+$", "")
    local route = M.ROUTE_PREFIX .. slug(title, "-"):sub(1, 40):gsub("%-+$", "")
    if route == M.ROUTE_PREFIX then route = M.ROUTE_PREFIX .. "page" end

    return {
        spec = "wippy.dashboard_page/v1",
        publish = true,
        id = id,
        title = title,
        route = route,
        icon = "tabler:layout-dashboard",
        order = 90,
        params = params,
        actions = {},
        data = data,
        tiles = tiles,
        layout = layouts(arrange(plan.rows, plan_tiles, order), plan_tiles),
    }
end

return M
