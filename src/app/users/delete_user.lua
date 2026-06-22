local http = require("http")
local user_repo = require("user_repo")
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

    local result, err = user_repo.delete(user_id)
    if err then
        api_error.fail(res, http.STATUS.INTERNAL_ERROR, "Failed to delete user", err)
        return
    end

    res:set_status(http.STATUS.OK)
    res:write_json({ success = true, result = result })
end

return { handler = handler }
