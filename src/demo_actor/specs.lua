-- The page specs of the mock actor (plan section 4). Each function returns one
-- wippy.dashboard_page/v1 spec as a Lua table. build.lua publishes them.
-- Stages E1 and E2 add the tiles `run` and `users` to app_activity(): add the
-- point, the tile and a slot in both layouts, and change the row 2 widths.
local M = {}

local function param(name)
    return { ["$param"] = name }
end

local function point(ref, args)
    return { kind = "function", ref = "demo.actor:" .. ref, args = args }
end

local function panel(id, size)
    return { panel = id, size = size }
end

-- A horizontal row of panels: row("320px", { "a", "25%" }, { "b", "75%" }).
local function row(height, ...)
    local children = {}
    for _, slot in ipairs({ ... }) do
        children[#children + 1] = panel(slot[1], slot[2])
    end
    return { direction = "horizontal", size = height, children = children }
end

-- A vertical column of panels: column({ "a", "96px" }, { "b", "140px" }).
local function column(...)
    local children = {}
    for _, slot in ipairs({ ... }) do
        children[#children + 1] = panel(slot[1], slot[2])
    end
    return { direction = "vertical", children = children }
end

function M.llm_usage()
    return {
        spec = "wippy.dashboard_page/v1",
        publish = true,
        id = "llm_usage",
        title = "LLM usage",
        route = "/reports/llm-usage",
        icon = "tabler:chart-bar",
        order = 50,
        time_zone = "Europe/Warsaw",
        actions = {},
        params = {
            model = { type = "select", label = "Model", from_path = 0, options = { data = "models" } },
            day = { type = "date", label = "Day" },
        },
        data = {
            models = point("usage_models"),
            summary = point("usage_summary"),
            tokens = point("usage_tokens", { model = param("model") }),
            by_day = point("usage_by_day", { model = param("model") }),
            by_model = point("usage_by_model", { model = param("model"), day = param("day") }),
        },
        tiles = {
            text = { type = "text", data = { main = "summary" } },
            model_picker = { type = "control.select", param = "model" },
            tokens = {
                type = "kpi",
                data = { main = "tokens" },
                fields = { value = "tokens" },
                options = { label = "Tokens" },
            },
            by_day = {
                type = "chart",
                data = { main = "by_day" },
                fields = { x = "day", series = "model", y = { "tokens" } },
                options = { label = "Tokens by day" },
                on = { select = { set = { day = { ["$event"] = "x" } } } },
            },
            by_model = { type = "table", data = { main = "by_model" } },
        },
        layout = {
            breakpoints = { lg = 1024 },
            layouts = {
                default = column(
                    { "text", "120px" },
                    { "model_picker", "96px" },
                    { "tokens", "140px" },
                    { "by_day", "320px" },
                    { "by_model", "240px" }
                ),
                lg = {
                    direction = "vertical",
                    children = {
                        row("140px", { "text", "50%" }, { "model_picker", "25%" }, { "tokens", "25%" }),
                        row("360px", { "by_day", "60%" }, { "by_model", "40%" }),
                    },
                },
            },
        },
    }
end

function M.app_activity()
    return {
        spec = "wippy.dashboard_page/v1",
        publish = true,
        id = "app_activity",
        title = "App activity",
        route = "/ops/app-activity",
        icon = "tabler:activity",
        order = 60,
        -- The stored spec is the request body, so a page with no parameters or
        -- actions still names them: compile.lua iterates spec.params and spec.actions.
        params = {},
        actions = {},
        data = {
            sessions = point("app_sessions"),
            messages = point("app_messages"),
            sessions_by_month = point("sessions_by_month"),
            message_types = point("message_types"),
        },
        tiles = {
            sessions = {
                type = "kpi",
                data = { main = "sessions" },
                fields = { value = "sessions" },
                options = { label = "Sessions" },
            },
            messages = {
                type = "kpi",
                data = { main = "messages" },
                fields = { value = "messages" },
                options = { label = "Messages" },
            },
            sessions_by_month = {
                type = "chart",
                data = { main = "sessions_by_month" },
                fields = { x = "month", y = { "sessions" } },
                options = { label = "Sessions by month" },
            },
            message_types = { type = "table", data = { main = "message_types" } },
        },
        layout = {
            breakpoints = { lg = 1024 },
            layouts = {
                default = column(
                    { "sessions", "140px" },
                    { "messages", "140px" },
                    { "sessions_by_month", "320px" },
                    { "message_types", "280px" }
                ),
                lg = {
                    direction = "vertical",
                    children = {
                        row("320px", { "sessions", "25%" }, { "messages", "25%" }, { "sessions_by_month", "50%" }),
                        row("280px", { "message_types", "100%" }),
                    },
                },
            },
        },
    }
end

-- Publication order.
function M.all()
    return { M.llm_usage(), M.app_activity() }
end

return M
