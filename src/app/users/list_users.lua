local http = require("http")
local user_repo = require("user_repo")
local user_groups_repo = require("user_groups_repo")
local api_error = require("api_error")

local function handler()
    local res = http.response()

    local users, err = user_repo.list()
    if err then
        api_error.fail(res, http.STATUS.INTERNAL_ERROR, "Failed to list users", err)
        return
    end

    for _, user in ipairs(users) do
        local groups_result, groups_err = user_groups_repo.get_user_groups(user.user_id)
        if not groups_err and groups_result then
            user.security_groups = groups_result.groups
        else
            user.security_groups = {}
        end
    end

    res:set_content_type(http.CONTENT.JSON)
    res:set_status(http.STATUS.OK)
    res:write_json({ success = true, users = users })
end

return { handler = handler }
