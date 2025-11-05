local http = require("http")
local json = require("json")
local security = require("security")
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

    local limit = tonumber(req:query("limit")) or 500
    local offset = tonumber(req:query("offset")) or 0
    local is_active = req:query("is_active")

    if limit < 1 or limit > 1000 then
        res:set_status(http.STATUS.BAD_REQUEST)
        res:write_json({
            success = false,
            error = "limit must be between 1 and 1000"
        })
        return
    end

    if offset < 0 then
        res:set_status(http.STATUS.BAD_REQUEST)
        res:write_json({
            success = false,
            error = "offset must be non-negative"
        })
        return
    end

    local options = {
        limit = limit,
        offset = offset
    }

    if is_active == "true" then
        options.is_active = true
    elseif is_active == "false" then
        options.is_active = false
    end

    local keys, err = keys_repo.list_all(options)
    if not keys then
        res:set_status(http.STATUS.INTERNAL_ERROR)
        res:write_json({
            success = false,
            error = "Failed to retrieve keys: " .. err
        })
        return
    end

    local total_count, count_err = keys_repo.count(options)
    if not total_count then
        res:set_status(http.STATUS.INTERNAL_ERROR)
        res:write_json({
            success = false,
            error = "Failed to get total count: " .. count_err
        })
        return
    end

    local keys_with_values = {}
    for _, key in ipairs(keys) do
        local full_key, get_err = keys_repo.get_by_key_id(key.key_id)
        if full_key then
            table.insert(keys_with_values, {
                id = full_key.id,
                key_id = full_key.key_id,
                email = full_key.email,
                key_value = full_key.key_value,
                credit_limit = full_key.credit_limit,
                is_active = full_key.is_active,
                is_disabled = full_key.is_disabled,
                created_at = full_key.created_at,
                updated_at = full_key.updated_at
            })
        else
            table.insert(keys_with_values, key)
        end
    end

    res:set_status(http.STATUS.OK)
    res:write_json({
        success = true,
        count = #keys_with_values,
        total_count = total_count,
        limit = limit,
        offset = offset,
        keys = keys_with_values
    })
end

return {
    handler = handler
}
