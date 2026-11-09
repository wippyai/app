-- demo.user_status:list_users is the function of the point demo.user_status:users.
-- It lists the users of the template (app_users, app_user_groups) in a stable
-- order for the user-status tile. The engine calls it as the viewer with
-- { args, point_id, point_meta } and checks the result against the point's schema.
local user_repo = require("user_repo")
local user_groups_repo = require("user_groups_repo")

-- The template lists 50 users unless asked for more. The tile is a demo, not a pager.
local MAX_USERS = 200

local function text(value)
    if type(value) == "string" then
        return value
    end
    return ""
end

local function list()
    local rows, err = user_repo.list({ limit = MAX_USERS })
    if err then
        return nil, "cannot list users: " .. tostring(err)
    end

    local users = {}
    for _, row in ipairs(rows or {}) do
        local result, gerr = user_groups_repo.get_user_groups(row.user_id)
        if gerr then
            return nil, "cannot read groups of " .. tostring(row.user_id) .. ": " .. tostring(gerr)
        end
        local groups = {}
        for _, group in ipairs(result and result.groups or {}) do
            groups[#groups + 1] = group
        end
        table.sort(groups)

        local name = text(row.full_name)
        if name == "" then
            name = text(row.email)
        end
        users[#users + 1] = {
            user_id = text(row.user_id),
            name = name,
            status = text(row.status),
            groups = groups,
        }
    end

    -- Stable order: name (case-insensitive), then user id.
    table.sort(users, function(a, b)
        local an, bn = a.name:lower(), b.name:lower()
        if an ~= bn then
            return an < bn
        end
        return a.user_id < b.user_id
    end)

    return { users = users }
end

return { list = list }
