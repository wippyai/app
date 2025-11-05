local http = require("http")
local json = require("json")
local security = require("security")
local openrouter_client = require("openrouter_client")
local keys_repo = require("keys_repo")

local function handler()
    local req = http.request()
    local res = http.response()

    local actor = security.actor()
    if not actor then
        res:set_status(http.STATUS.UNAUTHORIZED)
        res:write_json({
            success = false,
            error = "Authentication required"
        })
        return
    end

    local key_id = req:param("key_id")
    if not key_id or key_id == "" then
        res:set_status(http.STATUS.BAD_REQUEST)
        res:write_json({
            success = false,
            error = "key_id path parameter is required"
        })
        return
    end

    local existing_key, get_err = keys_repo.get_by_key_id(key_id)
    if not existing_key then
        if get_err and get_err:find("not found") then
            res:set_status(http.STATUS.NOT_FOUND)
            res:write_json({
                success = false,
                error = "Key not found"
            })
        else
            res:set_status(http.STATUS.INTERNAL_ERROR)
            res:write_json({
                success = false,
                error = "Failed to retrieve key: " .. (get_err or "unknown error")
            })
        end
        return
    end

    local response, err = openrouter_client.provisioning_request("DELETE", "/keys/" .. key_id)
    if not response then
        if err and (err:find("404") or err:find("not found")) then
        else
            res:set_status(http.STATUS.INTERNAL_ERROR)
            res:write_json({
                success = false,
                error = "Failed to delete key via OpenRouter API: " .. err
            })
            return
        end
    elseif response.status >= 400 then
        if response.status == 404 then
        else
            local error_msg = "OpenRouter API error (status " .. response.status .. ")"
            if response.data and response.data.error then
                if response.data.error.message then
                    error_msg = error_msg .. ": " .. response.data.error.message
                end
            end
            res:set_status(http.STATUS.INTERNAL_ERROR)
            res:write_json({
                success = false,
                error = error_msg
            })
            return
        end
    end

    local db_result, db_err = keys_repo.hard_delete(key_id)
    if not db_result then
        res:set_status(http.STATUS.INTERNAL_ERROR)
        res:write_json({
            success = false,
            error = "Failed to delete key from database: " .. db_err
        })
        return
    end

    res:set_status(http.STATUS.OK)
    res:write_json({
        success = true,
        key_id = key_id,
        deleted = true
    })
end

return {
    handler = handler
}
