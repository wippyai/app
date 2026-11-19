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
            model_picker = { type = "control.select", param = "model", options = { label = "Model" } },
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
                    { "model_picker", "140px" },
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
            run = { type = "demo.run_timeline" },
            users = { type = "demo.user_status" },
        },
        layout = {
            breakpoints = { lg = 1024 },
            layouts = {
                default = column(
                    { "sessions", "140px" },
                    { "messages", "140px" },
                    { "sessions_by_month", "320px" },
                    { "message_types", "340px" },
                    { "run", "340px" },
                    { "users", "340px" }
                ),
                lg = {
                    direction = "vertical",
                    children = {
                        row("320px", { "sessions", "25%" }, { "messages", "25%" }, { "sessions_by_month", "50%" }),
                        row("340px", { "message_types", "33%" }, { "run", "34%" }, { "users", "33%" }),
                    },
                },
            },
        },
    }
end

-- The open point usage_rows, mapped for one tile: the page names a declared mapper (src/mock_mappers)
-- with its parameters, and the output it expects. The page carries no mapping code.
local function mapped_point(args, mapper, params, output)
    return {
        kind = "function",
        ref = "demo.actor:usage_rows",
        args = args,
        mapper = { ref = "mock.mappers:" .. mapper, params = params },
        output = output,
    }
end

-- A page that maps one open point three ways with the example mappers: tokens per model
-- (sum_by), the five largest calls and the rest (top_n) and calls per day (bucket_by_time).
function M.llm_calls()
    local by_model_args = { model = param("model") }
    return {
        spec = "wippy.dashboard_page/v1",
        publish = true,
        id = "llm_calls",
        title = "LLM calls",
        route = "/reports/llm-calls",
        icon = "tabler:chart-dots",
        order = 55,
        actions = {},
        params = {
            model = { type = "select", label = "Model", options = { data = "models" } },
        },
        data = {
            models = point("usage_models"),
            by_model = mapped_point(by_model_args, "sum_by",
                { by = "model_id", values = { "prompt_tokens", "completion_tokens" } },
                {
                    shape = "category",
                    fields = {
                        { name = "model_id", type = "string", role = "dimension", nullable = false },
                        { name = "prompt_tokens", type = "number", role = "measure", additive = true, nullable = false },
                        { name = "completion_tokens", type = "number", role = "measure", additive = true, nullable = false },
                    },
                }),
            largest = mapped_point(by_model_args, "top_n",
                { by = "timestamp", value = "total_tokens", n = 5, other = true },
                {
                    shape = "category",
                    fields = {
                        { name = "timestamp", type = "string", role = "dimension", nullable = false },
                        { name = "total_tokens", type = "number", role = "measure", additive = true, nullable = false },
                    },
                }),
            per_day = mapped_point(by_model_args, "bucket_by_time",
                { time = "day", bucket = "day", value = "total_tokens" },
                {
                    shape = "series",
                    fields = {
                        { name = "day", type = "date", role = "dimension", nullable = false },
                        { name = "total_tokens", type = "number", role = "measure", additive = true, nullable = false },
                    },
                }),
        },
        tiles = {
            model_picker = { type = "control.select", param = "model", options = { label = "Model" } },
            by_model = {
                type = "chart",
                data = { main = "by_model" },
                fields = { x = "model_id", y = { "prompt_tokens", "completion_tokens" } },
                options = { label = "Tokens by model" },
            },
            largest = { type = "table", data = { main = "largest" } },
            per_day = {
                type = "chart",
                data = { main = "per_day" },
                fields = { x = "day", y = { "total_tokens" } },
                options = { label = "Tokens by day" },
            },
        },
        layout = {
            breakpoints = { lg = 1024 },
            layouts = {
                default = column(
                    { "model_picker", "140px" },
                    { "by_model", "320px" },
                    { "largest", "300px" },
                    { "per_day", "320px" }
                ),
                lg = {
                    direction = "vertical",
                    children = {
                        row("140px", { "model_picker", "100%" }),
                        row("340px", { "by_model", "50%" }, { "per_day", "50%" }),
                        row("320px", { "largest", "100%" }),
                    },
                },
            },
        },
    }
end

-- Publication order.
function M.all()
    return { M.llm_usage(), M.app_activity(), M.llm_calls() }
end

return M
