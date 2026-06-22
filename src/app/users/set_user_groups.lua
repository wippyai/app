local http = require("http")
local json = require("json")
local user_groups_repo = require("user_groups_repo")
local api_error = require("api_error")

local function handler()
    local req = http.request()
    local res = http.response()

    res:set_content_type(http.CONTENT.JSON)

    local user_id = req:param("id")
    if not user_id or user_id == "" then
        res:set_status(http.STATUS.BAD_REQUEST)
        res:write_json({ success = false, error = "User ID is required" })
        return
    end

    local body = req:body()
    if not body or body == "" then
        res:set_status(http.STATUS.BAD_REQUEST)
        res:write_json({ success = false, error = "Request body is required" })
        return
    end

    local data, err = json.decode(body)
    if err then
        api_error.fail(res, http.STATUS.BAD_REQUEST, "Invalid JSON", err)
        return
    end

    if not data.groups or type(data.groups) ~= "table" then
        res:set_status(http.STATUS.BAD_REQUEST)
        res:write_json({ success = false, error = "groups array is required" })
        return
    end

    local result, err = user_groups_repo.set_user_groups(user_id, data.groups)
    if err then
        api_error.fail(res, http.STATUS.INTERNAL_ERROR, "Failed to set user groups", err)
        return
    end

    res:set_status(http.STATUS.OK)
    res:write_json({ success = true, result = result })
end

return { handler = handler }
