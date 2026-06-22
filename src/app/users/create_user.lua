local http = require("http")
local json = require("json")
local user_repo = require("user_repo")
local api_error = require("api_error")

local function handler()
    local req = http.request()
    local res = http.response()

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

    if not data.email or data.email == "" then
        res:set_status(http.STATUS.BAD_REQUEST)
        res:write_json({ success = false, error = "Email is required" })
        return
    end

    if not data.password or data.password == "" then
        res:set_status(http.STATUS.BAD_REQUEST)
        res:write_json({ success = false, error = "Password is required" })
        return
    end

    local user_id = data.user_id
    if not user_id or user_id == "" then
        user_id = data.email:gsub("[^%w]", "_")
    end

    local result, err = user_repo.create({
        user_id = user_id,
        email = data.email,
        full_name = data.full_name or "",
        password = data.password,
        status = data.status or "active",
    })

    if err then
        api_error.fail(res, http.STATUS.BAD_REQUEST, "Failed to create user", err)
        return
    end

    res:set_content_type(http.CONTENT.JSON)
    res:set_status(http.STATUS.CREATED)
    res:write_json({ success = true, user = result })
end

return { handler = handler }
