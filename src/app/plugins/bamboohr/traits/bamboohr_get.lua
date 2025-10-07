local ctx = require("ctx")
local json = require("json")
local bamboohr = require("bamboohr")

local function handle(args)
    args = args or {}

    -- Validate required fields
    if not args.path or args.path == "" then
        return nil, "API path is required"
    end

    -- Determine component_id - from args, ctx, or auto-discover
    local component_id = args.component_id
    if not component_id then
        component_id = ctx.get("component_id") -- May be nil, that's ok
    end

    -- Open BambooHR connection (will auto-discover if component_id is nil)
    local service, err = bamboohr.open(component_id)
    if err then
        return nil, "Error connecting to BambooHR: " .. err
    end

    if not service then
        return nil, "No BambooHR connection available"
    end

    -- Make the GET request
    local response, request_err = service:get({
        path = args.path,
        query = args.query
    })

    if request_err then
        return nil, "Error making request: " .. request_err
    end

    if not response then
        return nil, "No response received"
    end

    -- Format the response
    local result = {}
    result.status_code = response.status_code
    result.path = args.path

    if response.status_code >= 200 and response.status_code < 300 then
        result.success = true
        result.data = response.body

        -- If it's JSON and parseable, format it nicely
        if type(response.body) == "table" then
            result.formatted = json.encode(response.body, { indent = 2 })
        else
            result.formatted = tostring(response.body)
        end
    else
        result.success = false
        result.error = response.body

        -- Common BambooHR error handling
        if response.status_code == 401 then
            result.error_message = "Authentication failed - check API credentials"
        elseif response.status_code == 403 then
            result.error_message = "Access denied - insufficient permissions"
        elseif response.status_code == 404 then
            result.error_message = "Resource not found - check the API path"
        else
            result.error_message = "HTTP " .. response.status_code .. " error"
        end
    end

    -- Return formatted result
    if result.success then
        return "BambooHR GET " .. args.path .. " - Success\n\n" .. (result.formatted or "No data"), nil
    else
        local error_msg = "BambooHR GET " .. args.path .. " - Failed (Status: " .. result.status_code .. "): " .. (result.error_message or "Unknown error")
        return nil, error_msg
    end
end

return { handle = handle }