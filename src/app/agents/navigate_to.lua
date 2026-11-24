local ctx = require("ctx")

local USER_HUB_PREFIX = "user."
local MAX_PATH = 300

local PAGES: {[string]: string} = {
    home = "/",
    users = "/users",
}

-- True when a segment of the path part (before any ? or #) is "." or "..",
-- also when written with %2e.
local function has_dot_segment(path)
    local bare = path:match("^[^?#]*") or ""
    for segment in bare:gmatch("[^/]+") do
        local decoded = segment:gsub("%%2[eE]", ".")
        if decoded == "." or decoded == ".." then
            return true
        end
    end
    return false
end

-- An app path the UI may open: it starts with one slash, carries no scheme or
-- host ("//"), no backslash, no control or space characters and no "." or
-- ".." segments. The UI resolves it in its own router, where a registry page
-- (a dashboard) opens inside the app, and an unknown path falls back to Home.
local function valid_path(path)
    if type(path) ~= "string" or path == "" or #path > MAX_PATH then
        return false
    end
    if path:sub(1, 1) ~= "/" or path:sub(1, 2) == "//" then
        return false
    end
    if path:find("[%c%s\\]") then
        return false
    end
    return not has_dot_segment(path)
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
            return { error = "path must be an app path that starts with /, for example /reports/llm-usage, with no . or .. segments" }
        end
        path = params.path
    end

    -- wippy/relay starts the user's hub when the user's first browser connects,
    -- and keeps it for a while after the last one leaves (its inactivity
    -- timeout). So a hub means the user was here recently, not that a browser
    -- is open now, and the relay offers no way to ask how many are connected.
    local hub_pid = process.registry.lookup(USER_HUB_PREFIX .. user_id)
    if not hub_pid then
        return { error = "The user has no open app window, so nothing was opened. Give the user the link instead." }
    end
    local sent, serr = process.send(hub_pid, "action:navigate", { path = path })
    if not sent then
        return { error = "The page could not be opened: " .. tostring(serr) }
    end

    return {
        success = true,
        delivered = "unconfirmed",
        message = "Sent " .. path .. " to the user's app. It opens there when the app is open in a browser; "
            .. "this cannot be confirmed, so also give the user the link.",
        page = params.page,
        path = path,
    }
end

return { handler = handler }
