-- GET /api/v1/dashboards/pages/{id}/points/{point} (contracts sections 3, 5.1, 7).
-- Finds the point in the stored page, checks access, validates args, calls the
-- declared function as the viewer, checks the output shape and returns a result
-- envelope. The runtime's JSON encoder cannot write null inside an object, so
-- keys with no value are left out.
local http = require("http")
local json = require("json")
local security = require("security")
local sql = require("sql")
local registry = require("registry")
local funcs = require("funcs")
local logger = require("logger")
local spec_lib = require("spec")
local shape = require("shape")

local MAX_ARGS_BYTES = 8192

local MESSAGES = {
    denied = "You may not view this page",
    invalid_args = "The arguments are not valid for this data point",
    format_mismatch = "The data does not match the declared format",
    source_error = "The data source failed",
    undeclared = "This data point is not available",
}

local function empty_object()
    return table.create(0, 1)
end

local function obj(t)
    if t == nil or next(t) == nil then
        return empty_object()
    end
    return t
end

local function now_iso()
    return os.date("!%Y-%m-%dT%H:%M:%SZ")
end

-- Encodes first, so a body the encoder rejects never becomes an empty 200.
local function send(res, status, body)
    local text, err = json.encode(body)
    if err or type(text) ~= "string" then
        logger:error("dashboards: response cannot be encoded", { error = tostring(err) })
        res:set_status(http.STATUS.INTERNAL_ERROR)
        res:write('{"error":{"code":"internal","message":"The result cannot be encoded"}}')
        return
    end
    res:set_status(status)
    res:write(text)
end

local function not_found(res)
    send(res, http.STATUS.NOT_FOUND, { error = { code = "not_found", message = "Unknown page or data point" } })
end

-- Envelope for a state that carries an error.
local function error_envelope(point, state, code, ctx, input, field)
    local err = { code = code, message = MESSAGES[code] }
    if input ~= nil then
        err.input = input
    end
    if field ~= nil then
        err.field = field
    end
    local env = {
        point = point,
        state = state,
        computed_at = now_iso(),
        completeness = "complete",
        warnings = {},
        error = err,
    }
    if ctx then
        env.source_title = ctx.source_title
        env.args = ctx.args
    end
    return env
end

-- True when a value holds a { "$param": name } reference at any depth.
local function holds_param(value, depth)
    if type(value) ~= "table" or depth > 8 then
        return false
    end
    if value["$param"] ~= nil then
        return true
    end
    for _, v in pairs(value) do
        if holds_param(v, depth + 1) then
            return true
        end
    end
    return false
end

-- Parses the query value `args`. Absent means {}. Returns a table of string
-- keys, or nil plus a reason.
local function parse_args(raw)
    if raw == nil or raw == "" then
        return {}
    end
    if #raw > MAX_ARGS_BYTES then
        return nil, "args is too large"
    end
    local value, err = json.decode(raw)
    if err or type(value) ~= "table" then
        return nil, "args is not a JSON object"
    end
    for k in pairs(value) do
        if type(k) ~= "string" then
            return nil, "args is not a JSON object"
        end
    end
    return value
end

-- Merges the request args into the page's bound args. Constants of the page
-- always win; the request may supply only the keys the page binds to a $param.
-- A constant key in the request is replaced by the page's value, because the
-- board sends the resolved args of the whole data-sources entry.
-- Publication allows a bound value only as exactly { "$param": name }. A stored
-- page that still holds a value with a $param inside something else fails closed:
-- merge_args returns nil, nil, "mixed" and the handler answers 500.
local function is_whole_param(value)
    if type(value) ~= "table" or type(value["$param"]) ~= "string" then
        return false
    end
    for k in pairs(value) do
        if k ~= "$param" then
            return false
        end
    end
    return true
end

local function merge_args(page_args, requested)
    local constants, bound = {}, {}
    for key, value in pairs(page_args or {}) do
        if is_whole_param(value) then
            bound[key] = true
        elseif holds_param(value, 1) then
            return nil, nil, "mixed"
        else
            constants[key] = value
        end
    end
    local merged = {}
    for key, value in pairs(requested) do
        if bound[key] then
            merged[key] = value
        elseif constants[key] == nil then
            return nil, key
        end
    end
    for key, value in pairs(constants) do
        merged[key] = value
    end
    return merged
end

local function handler()
    local req = http.request()
    local res = http.response()
    res:set_content_type(http.CONTENT.JSON)

    local id = req:param("id")
    local point = req:param("point")
    if not spec_lib.is_page_id(id) or type(point) ~= "string" or point == "" or #point > 41 then
        return not_found(res)
    end

    -- A stored page without its registry entry (after a restart) is not served.
    local entry_id = spec_lib.entry_id(id)
    if not registry.get(entry_id) then
        return not_found(res)
    end

    if not security.can("view", "page:" .. entry_id) then
        return send(res, http.STATUS.FORBIDDEN, error_envelope(point, "denied", "denied"))
    end

    local db, derr = sql.get("app:db")
    if derr then
        return send(res, http.STATUS.INTERNAL_ERROR, { error = { code = "internal", message = "Database unavailable" } })
    end
    local rows, qerr = db:query("SELECT spec FROM dash_pages WHERE page_id = ? AND published = 1", { id })
    db:release()
    if qerr then
        return send(res, http.STATUS.INTERNAL_ERROR, { error = { code = "internal", message = "Cannot read the page" } })
    end
    if not rows or not rows[1] then
        return not_found(res)
    end
    local spec, jerr = json.decode(rows[1].spec)
    if jerr or type(spec) ~= "table" or type(spec.data) ~= "table" then
        return send(res, http.STATUS.INTERNAL_ERROR, { error = { code = "internal", message = "Stored page is unreadable" } })
    end
    local page_point = spec.data[point]
    if type(page_point) ~= "table" then
        return not_found(res)
    end

    -- The declaration is looked up now, not at publication.
    local decl = spec_lib.point_decl(page_point.ref)
    local meta = decl and decl.meta
    if not decl or type(meta.func) ~= "string" or meta.func == "" then
        logger:warn("dashboards: point declaration is missing or not a point", { page = id, point = point })
        return send(res, http.STATUS.BAD_REQUEST, error_envelope(point, "failed", "undeclared"))
    end

    local requested, perr = parse_args(req:query("args"))
    if not requested then
        logger:info("dashboards: args refused", { page = id, point = point, reason = perr })
        return send(res, http.STATUS.BAD_REQUEST, error_envelope(point, "failed", "invalid_args"))
    end
    local merged, bad_key, problem = merge_args(page_point.args, requested)
    if problem == "mixed" then
        logger:error("dashboards: stored page mixes a constant with a $param in one arg", { page = id, point = point })
        return send(res, http.STATUS.INTERNAL_ERROR,
            { error = { code = "page_broken", message = "The page has an argument that cannot be bound safely" } })
    end
    if not merged then
        logger:info("dashboards: args refused", { page = id, point = point, reason = "key not bound to a parameter" })
        return send(res, http.STATUS.BAD_REQUEST,
            error_envelope(point, "failed", "invalid_args", nil, "main", bad_key))
    end

    local ctx = { source_title = meta.title, args = obj(merged) }

    -- get_decl guarantees an args_schema table. A schema the validator rejects
    -- as malformed also refuses the read, so the function never runs unchecked.
    local valid, why = shape.validates(meta.args_schema, ctx.args)
    if not valid then
        logger:info("dashboards: args refused", { page = id, point = point, reason = "args_schema (" .. tostring(why) .. ")" })
        return send(res, http.STATUS.BAD_REQUEST, error_envelope(point, "failed", "invalid_args", ctx))
    end

    -- The call runs under the viewer's own identity and access.
    local data, ferr = funcs.new():call(meta.func, {
        args = ctx.args,
        point_id = decl.id,
        point_meta = meta,
    })
    if ferr ~= nil then
        -- The function's error text stays in the log and never reaches the viewer.
        logger:warn("dashboards: point function failed", { page = id, point = point, error = tostring(ferr) })
        return send(res, http.STATUS.OK, error_envelope(point, "failed", "source_error", ctx))
    end

    local state, serr = shape.check(meta.output, data)
    if not state then
        logger:warn("dashboards: format mismatch", { page = id, point = point, field = serr.field })
        return send(res, http.STATUS.OK, error_envelope(point, "failed", "format_mismatch", ctx, "main", serr.field))
    end

    local env = {
        point = point,
        state = state,
        data = obj(shape.wire_data(meta.output, data)),
        computed_at = now_iso(),
        source_title = meta.title,
        args = ctx.args,
        completeness = "complete",
        warnings = {},
    }
    -- Data the JSON encoder cannot carry (for example a nil cell inside a row)
    -- is a format problem, not an empty answer.
    local _, eerr = json.encode(env.data)
    if eerr then
        logger:warn("dashboards: data cannot be encoded", { page = id, point = point, error = tostring(eerr) })
        return send(res, http.STATUS.OK, error_envelope(point, "failed", "format_mismatch", ctx, "main", "data"))
    end
    if meta.refresh_ms ~= nil then
        env.refresh_ms = meta.refresh_ms
    end
    if meta.live_topic ~= nil then
        env.live_topic = meta.live_topic
    end
    send(res, http.STATUS.OK, env)
end

return { handler = handler }
