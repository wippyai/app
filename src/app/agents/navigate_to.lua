local ctx = require("ctx")

local USER_HUB_PREFIX = "user."
local MAX_PATH = 300

local PAGES: {[string]: string} = {
    home = "/",
    users = "/users",
}

-- An app path the UI may open: it starts with one slash, carries no scheme or
-- host ("//"), no backslash and no control or space characters. The UI
-- resolves it in its own router, where a registry page (a dashboard) opens
-- inside the app, and an unknown path falls back to Home.
local function valid_path(path)
    if type(path) ~= "string" or path == "" or #path > MAX_PATH then
        return false
    end
    if path:sub(1, 1) ~= "/" or path:sub(1, 2) == "//" then
        return false
    end
    return not path:find("[%c%s\\]")
end

local function handler(params)
    local user_id = ctx.get("user_id")
    if not user_id then
        return { error = "User context not available" }
    end

    params = params or {}
    local has_page = type(params.page) == "string" and params.page ~= ""
    local has_path = type(params.path) == "string" and params.path ~= ""
    if has_page == has_path then
        return { error = "Give either page or path" }
    end

    local path
    if has_page then
        path = PAGES[params.page]
        if not path then
            local valid = {}
            for k, _ in pairs(PAGES) do
                table.insert(valid, k)
            end
            return { error = "Unknown page: " .. params.page .. ". Valid pages: " .. table.concat(valid, ", ") }
        end
    else
        if not valid_path(params.path) then
            return { error = "path must be an app path that starts with /, for example /reports/llm-usage" }
        end
        path = params.path
    end

    local hub_pid = process.registry.lookup(USER_HUB_PREFIX .. user_id)
    if hub_pid then
        process.send(hub_pid, "action:navigate", { path = path })
    end

    return {
        success = true,
        message = "Opened " .. path,
        page = params.page,
        path = path,
    }
end

return { handler = handler }
