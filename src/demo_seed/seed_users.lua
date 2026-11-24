-- POST /api/v1/demo/seed-users: creates the test users of demo.seed:test_users
-- when they are missing. Safe to repeat. Admin only. Never returns a password.
local http = require("http")
local registry = require("registry")
local security = require("security")
local user_repo = require("user_repo")
local user_groups_repo = require("user_groups_repo")

local function fail(res, status, code, message)
    res:set_status(status)
    res:write_json({ error = { code = code, message = message } })
end

local function has_group(user_id, group)
    local groups = user_groups_repo.get_user_groups(user_id)
    if groups and groups.groups then
        for _, g in ipairs(groups.groups) do
            if g == group then
                return true
            end
        end
    end
    return false
end

local function handler()
    local res = http.response()
    res:set_content_type(http.CONTENT.JSON)

    if not security.can("demo.seed_users", "demo.seed:users") then
        return fail(res, http.STATUS.FORBIDDEN, "denied", "Admin only")
    end

    local entry, err = registry.get("demo.seed:test_users")
    if err or not entry or not entry.meta or type(entry.meta.users) ~= "table" then
        return fail(res, http.STATUS.INTERNAL_ERROR, "seed_config_missing", "demo.seed:test_users has no users")
    end

    local report = {}
    for _, u in ipairs(entry.meta.users) do
        local email = tostring(u.email or ""):lower()
        local item = { email = email, created = false, group_added = false }

        local existing = user_repo.get(email)
        if not existing then
            local _, create_err = user_repo.create({
                user_id = email,
                email = email,
                full_name = u.name or "",
                password = u.password,
                status = "active",
            })
            if create_err then
                return fail(res, http.STATUS.INTERNAL_ERROR, "seed_failed", "Could not create " .. email)
            end
            item.created = true
        end

        if u.group and not has_group(email, u.group) then
            local _, group_err = user_groups_repo.assign_user_to_group(email, u.group)
            if group_err then
                return fail(res, http.STATUS.INTERNAL_ERROR, "seed_failed", "Could not assign group for " .. email)
            end
            item.group_added = true
        end
        item.group = u.group
        table.insert(report, item)
    end

    res:set_status(http.STATUS.OK)
    res:write_json({ users = report })
end

return { handler = handler }
