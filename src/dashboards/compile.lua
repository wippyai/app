-- Compiles a stored page spec into the props of dashboard-layout (contracts
-- section 6). The output is built field by field from an allowlist. It never
-- holds a function id, a declaration id, a workflow reference, point_meta or
-- the raw spec. Page-local point and action names stay.
local spec_lib = require("spec")

local M = {}

-- An empty Lua table encodes as []; maps must encode as {}.
local function obj(t)
    if next(t) == nil then
        return table.create(0, 1)
    end
    return t
end

local function copy_json(value, depth)
    if type(value) ~= "table" then
        return value
    end
    if depth > 8 then
        return nil
    end
    local out = {}
    for k, v in pairs(value) do
        out[k] = copy_json(v, depth + 1)
    end
    return out
end

local SLOT_KEYS = { "panel", "size", "minSize", "maxSize", "dividerBefore", "borderBefore", "fixed" }

local function compile_node(node)
    if node.panel ~= nil then
        local out = {}
        for _, key in ipairs(SLOT_KEYS) do
            if node[key] ~= nil then
                out[key] = copy_json(node[key], 1)
            end
        end
        return out
    end
    local out = { direction = node.direction, size = node.size, children = {} }
    for _, child in ipairs(node.children) do
        table.insert(out.children, compile_node(child))
    end
    return out
end

local function compile_layout(layout)
    local breakpoints = {}
    for name, px in pairs(layout.breakpoints or {}) do
        breakpoints[name] = px
    end
    local layouts = {}
    for name, tree in pairs(layout.layouts) do
        layouts[name] = compile_node(tree)
    end
    return { breakpoints = obj(breakpoints), layouts = layouts }
end

-- An action declaration lists the points it refreshes by declaration name.
-- The board works with page-local names, so map each one to the local points
-- of this page that use that declaration.
local function refreshed_points(spec, listed)
    local out, seen = {}, {}
    for _, r in ipairs(listed or {}) do
        for name, p in pairs(spec.data) do
            local short = type(p.ref) == "string" and p.ref:match(":([^:]+)$") or nil
            if (name == r or p.ref == r or short == r) and not seen[name] then
                seen[name] = true
                table.insert(out, name)
            end
        end
    end
    table.sort(out)
    return out
end

local function point_input(spec, point_name, point_decl)
    local p = spec.data[point_name]
    local meta = point_decl.meta
    local out = {
        point = point_name,
        args = obj(copy_json(p.args or {}, 1)),
    }
    if meta.refresh_ms ~= nil then
        out.refresh_ms = meta.refresh_ms
    end
    if meta.live_topic ~= nil then
        out.live_topic = meta.live_topic
    end
    return out
end

-- Returns the props table, or nil plus an error string when a declaration the
-- stored page names has gone from the registry.
function M.compile(spec, page_id, revision)
    -- The stored spec is the request body, so optional maps may be absent.
    spec.params = spec.params or {}
    spec.data = spec.data or {}
    spec.actions = spec.actions or {}
    spec.tiles = spec.tiles or {}
    local tiles = {}
    for tile_id, tile in pairs(spec.tiles) do
        local desc = spec_lib.tile_descriptor(tile.type)
        if not desc then
            return nil, "tile type of '" .. tile_id .. "' is gone"
        end
        local dmeta = desc.meta

        -- data: explicit input mapping, then the descriptor defaults
        local data_map = {}
        for input, point in pairs(tile.data or {}) do
            data_map[input] = point
        end
        for input, decl_id in pairs(dmeta.default_data or {}) do
            if data_map[input] == nil then
                for name, p in pairs(spec.data) do
                    if p.ref == decl_id then
                        data_map[input] = name
                    end
                end
            end
        end
        -- A control tile gets the options point of its parameter as 'main'.
        local param = tile.param
        if param ~= nil then
            local p = spec.params[param]
            if p and p.options and p.options.data then
                data_map.main = p.options.data
            end
        end

        local data = {}
        for input, point in pairs(data_map) do
            local decl = spec_lib.point_decl(spec.data[point].ref)
            if not decl then
                return nil, "point '" .. point .. "' is gone"
            end
            data[input] = point_input(spec, point, decl)
        end

        -- actions
        local action_map = {}
        for name, action in pairs(tile.actions or {}) do
            action_map[name] = action
        end
        for name, decl_id in pairs(dmeta.default_actions or {}) do
            if action_map[name] == nil then
                for aname, a in pairs(spec.actions) do
                    if a.ref == decl_id then
                        action_map[name] = aname
                    end
                end
            end
        end
        local actions = {}
        for name, action in pairs(action_map) do
            local decl = spec_lib.action_decl(spec.actions[action].ref)
            if not decl then
                return nil, "action '" .. action .. "' is gone"
            end
            local refreshes = refreshed_points(spec, decl.meta.refreshes)
            actions[name] = {
                action = action,
                confirm = decl.meta.confirm == true,
                refreshes = refreshes,
            }
        end

        -- params the tile reads directly: descriptor list plus the spec's list
        local params, seen = {}, {}
        for _, list in ipairs({ dmeta.params or {}, tile.params or {} }) do
            for _, name in ipairs(list) do
                if not seen[name] then
                    seen[name] = true
                    table.insert(params, name)
                end
            end
        end

        local on = {}
        for event, handler in pairs(tile.on or {}) do
            on[event] = { set = obj(copy_json(handler.set, 1)) }
        end

        tiles[tile_id] = {
            tag = dmeta.tag,
            fields = obj(copy_json(tile.fields or {}, 1)),
            options = obj(copy_json(tile.options or {}, 1)),
            data = obj(data),
            actions = obj(actions),
            params = params,
            param = param,
            on = obj(on),
        }
    end

    local params = {}
    for name, p in pairs(spec.params) do
        params[name] = {
            type = p.type,
            label = p.label,
            default = p.default,
            from_path = p.from_path,
        }
    end

    return {
        id = page_id,
        title = spec.title,
        revision = revision,
        ["page-url"] = "/api/v1/dashboards/pages/" .. page_id,
        layout = compile_layout(spec.layout),
        tiles = obj(tiles),
        params = obj(params),
    }
end

return M
