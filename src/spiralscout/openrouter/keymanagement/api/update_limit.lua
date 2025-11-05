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

    local body = req:body()
    if not body or body == "" then
        res:set_status(http.STATUS.BAD_REQUEST)
        res:write_json({
            success = false,
            error = "Request body is required"
        })
        return
    end

    local data, parse_err = json.decode(body)
    if parse_err then
        res:set_status(http.STATUS.BAD_REQUEST)
        res:write_json({
            success = false,
            error = "Invalid JSON: " .. parse_err
        })
        return
    end

    if not data.credit_limit then
        res:set_status(http.STATUS.BAD_REQUEST)
        res:write_json({
            success = false,
            error = "credit_limit is required"
        })
        return
    end

    if type(data.credit_limit) ~= "number" or data.credit_limit < 0 then
        res:set_status(http.STATUS.BAD_REQUEST)
        res:write_json({
            success = false,
            error = "credit_limit must be a non-negative number"
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
                error = "Failed to retrieve key: " .. get_err
            })
        end
        return
    end

    local response, err = openrouter_client.provisioning_request("PATCH", "/keys/" .. key_id, {
        limit = data.credit_limit
    })
    if not response then
        res:set_status(http.STATUS.INTERNAL_ERROR)
        res:write_json({
            success = false,
            error = "Failed to update limit via OpenRouter API: " .. err
        })
        return
    end

    if response.status >= 400 then
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

    local db_result, db_err = keys_repo.update_limit(key_id, data.credit_limit)
    if not db_result then
        res:set_status(http.STATUS.INTERNAL_ERROR)
        res:write_json({
            success = false,
            error = "Failed to update limit in database: " .. db_err
        })
        return
    end

    res:set_status(http.STATUS.OK)
    res:write_json({
        success = true,
        key_id = key_id,
        credit_limit = data.credit_limit,
        updated = true
    })
end

return {
    handler = handler
}
