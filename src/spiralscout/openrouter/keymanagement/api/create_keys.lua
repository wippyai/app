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

    if not data.emails or type(data.emails) ~= "table" or #data.emails == 0 then
        res:set_status(http.STATUS.BAD_REQUEST)
        res:write_json({
            success = false,
            error = "emails array is required and must not be empty"
        })
        return
    end

    local credit_limit = data.credit_limit or 0.0
    if type(credit_limit) ~= "number" or credit_limit < 0 then
        res:set_status(http.STATUS.BAD_REQUEST)
        res:write_json({
            success = false,
            error = "credit_limit must be a non-negative number"
        })
        return
    end

    local results = {}
    local failures = {}

    for _, email in ipairs(data.emails) do
        local request_body = {
            name = "SpiralScout Key for " .. email
        }
        if credit_limit > 0 then
            request_body.limit = credit_limit
        end

        local response, err = openrouter_client.provisioning_request("POST", "/keys", request_body)
        if response and response.status < 400 then
            if response.data and response.data.data and response.data.key then
                local key_data = {
                    key_id = response.data.data.hash,
                    email = email,
                    key_value = response.data.key,
                    credit_limit = credit_limit,
                    is_active = true
                }

                local db_result, db_err = keys_repo.create(key_data)
                if db_result then
                    table.insert(results, {
                        key_id = key_data.key_id,
                        email = key_data.email,
                        credit_limit = key_data.credit_limit,
                        created = true
                    })
                else
                    table.insert(failures, {
                        email = email,
                        error = "Database error: " .. db_err
                    })
                end
            else
                table.insert(failures, {
                    email = email,
                    error = "Invalid API response format"
                })
            end
        else
            local error_msg = "API error"
            if response and response.data and response.data.error then
                if response.data.error.message then
                    error_msg = error_msg .. ": " .. response.data.error.message
                end
            elseif err then
                error_msg = error_msg .. ": " .. err
            end
            table.insert(failures, {
                email = email,
                error = error_msg
            })
        end
    end

    local response_data = {
        success = true,
        total_requested = #data.emails,
        successful_count = #results,
        failed_count = #failures,
        keys = results
    }

    if #failures > 0 then
        response_data.failures = failures
    end

    res:set_status(http.STATUS.OK)
    res:write_json(response_data)
end

return {
    handler = handler
}
