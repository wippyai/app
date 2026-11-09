-- Writes the view.page entry of a published page (contracts section 11).
-- registry.apply cannot be scoped to a namespace (contracts section 13), so
-- this module refuses in code any change outside wippy.dashboards.pages.
local registry = require("registry")
local spec_lib = require("spec")

local M = {}

local PREFIX = spec_lib.ENTRY_NAMESPACE .. ":"

local function inside_namespace(id)
    return type(id) == "string"
        and id:sub(1, #PREFIX) == PREFIX
        and spec_lib.is_page_id(id:sub(#PREFIX + 1))
end

function M.build_entry(spec)
    local dashed = (spec.id:gsub("_", "-"))
    return {
        id = spec_lib.entry_id(spec.id),
        kind = "registry.entry",
        meta = {
            type = "view.page",
            name = "dash-" .. dashed,
            title = spec.title,
            icon = spec.icon or "tabler:layout-dashboard",
            order = spec.order or 100,
            announced = true,
            secure = true,
            url = "/app",
            base_path = "app/dashboard-page",
            entry_point = "app.html",
            mountRoute = spec_lib.mount_route(spec.route),
            resource_id = spec.id,
            managed_by = "wippy.dashboards",
        },
    }
end

-- Every id an operation touches must sit inside wippy.dashboards.pages.
local function ops_inside_namespace(changes)
    local ops = changes:ops()
    if type(ops) ~= "table" then
        return false
    end
    local count = 0
    for _, op in ipairs(ops) do
        count = count + 1
        local id = (type(op.entry) == "table" and op.entry.id) or op.id
        if not inside_namespace(id) then
            return false
        end
    end
    return count > 0
end

-- Creates the entry, or updates it when it exists. Returns entry_id, or nil, err.
function M.write(spec)
    local entry = M.build_entry(spec)
    if not inside_namespace(entry.id) then
        return nil, "refused: entry id outside " .. spec_lib.ENTRY_NAMESPACE
    end

    local existing = registry.get(entry.id)
    local snap, err = registry.snapshot()
    if err then
        return nil, "snapshot failed"
    end
    local changes, cerr = snap:changes()
    if cerr then
        return nil, "changeset failed"
    end

    local _, werr
    if existing then
        _, werr = changes:update(entry)
    else
        _, werr = changes:create(entry)
    end
    if werr then
        return nil, "changeset rejected the entry"
    end

    if not ops_inside_namespace(changes) then
        return nil, "refused: change outside " .. spec_lib.ENTRY_NAMESPACE
    end

    local _, aerr = changes:apply()
    if aerr then
        return nil, "apply failed"
    end
    return entry.id
end

return M
