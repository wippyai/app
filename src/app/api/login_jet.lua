local http = require("http")
local registry = require("registry")
local templates = require("templates")

-- Jet-rendered login example. Demonstrates server-side cookie theme rendering:
-- the chosen theme (persisted by window.wippyThemePersist as a cookie) is read
-- from the request and baked onto <html> before the response is sent, so the
-- login page paints in the right theme with no flash — the same technique the
-- facade's Jet shell uses. Compare with the static static/login.html example.

local TEMPLATE_SET = "app.api:login_templates"

-- Read a facade requirement's default (the configured theme key / mode).
local function facade_req(name: string): string
    local entry, _ = registry.get("wippy.facade:" .. name)
    if entry and entry.data then
        return entry.data.default or ""
    end
    return ""
end

local function cookie_value(header: string?, name: string): string?
    if not header or header == "" then
        return nil
    end
    for pair in header:gmatch("[^;]+") do
        local k, v = pair:match("^%s*(.-)%s*=%s*(.*)$")
        if k == name then
            return v
        end
    end
    return nil
end

local function handler()
    local req = http.request()
    local res = http.response()

    local persist = facade_req("theme_persist")
    local key = facade_req("theme_storage_key")
    if key == "" then
        key = "@wippy-theme-mode"
    end

    local has_theme = false
    local theme_class = ""
    local color_scheme = ""
    if persist == "cookie" and req then
        local stored = cookie_value(req:header("Cookie"), key)
        if stored == "dark" then
            has_theme = true
            theme_class = "w-theme-dark"
            color_scheme = "dark"
        elseif stored == "light" then
            has_theme = true
            theme_class = "w-theme-light"
            color_scheme = "light"
        end
    end

    local set, get_err = templates.get(TEMPLATE_SET)
    if not set then
        res:set_status(http.STATUS.INTERNAL_ERROR)
        res:set_content_type("text/html")
        res:write("Failed to load login template set: " .. tostring(get_err))
        return nil, get_err
    end
    local html, err = set:render("login", {
        hasTheme = has_theme,
        themeClass = theme_class,
        colorScheme = color_scheme,
    })
    if err then
        res:set_status(http.STATUS.INTERNAL_ERROR)
        res:set_content_type("text/html")
        res:write("Failed to render login page")
        set:release()
        return nil, err
    end

    res:set_content_type("text/html")
    res:set_header("Cache-Control", "no-store")
    res:set_status(http.STATUS.OK)
    res:write(html)
    set:release()
end

return { handler = handler }
