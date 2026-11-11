-- POST /api/v1/dashboards/pages/{id}/actions/{action} (contracts sections 3, 5.2, 10).
--
-- Order of checks, each before the next:
--   1. the page entry and the stored page exist, and the page declares the action   404
--   2. the viewer may see the page                                                   403 denied
--   3. the declaration exists with type wippy.dashboards.action and an args_schema   400 undeclared
--   4. the viewer has the action's permission                                        403 <permission action>
--   5. the idempotency key is present and sane, the body is well formed              400 invalid_args
--   6. only tile_args fields come from the request; server-bound args win;
--      the merged args pass args_schema                                              400 invalid_args
--   7. the log row is stored before the action runs (unique viewer + key)
--        same key, same hash, finished   -> the stored result
--        same key, other hash            -> 409 idempotency_conflict
--        same key, no result yet         -> state unknown, nothing runs
--   8. the declared function runs as the viewer; the end state and result are stored.
--
-- The function's error text never reaches the viewer. Only a code of the form
-- ^[a-z][a-z0-9_]{1,40}$ from the function's error details passes (for example self_target).
-- The runtime's JSON encoder cannot write null inside an object, so keys with no value
-- are left out.
local http = require("http")
local json = require("json")
local security = require("security")
local sql = require("sql")
local registry = require("registry")
local funcs = require("funcs")
local logger = require("logger")
local spec_lib = require("spec")
local shape = require("shape")
local args_lib = require("args")
local log = require("action_log")

local MAX_BODY_BYTES = 16384
local KEY_MIN, KEY_MAX = 8, 128

local MESSAGES = {
    denied = "You may not run this action",
    invalid_args = "The arguments are not valid for this action",
    undeclared = "This action is not available",
    idempotency_conflict = "This key was already used for a different call",
    format_mismatch = "The action returned a result that does not match its declaration",
    action_failed = "The action did not complete",
    unknown_outcome = "The outcome of this call is not known",
    log_failed = "The action ran, but its result could not be stored",
    internal = "The action could not be started",
}

local function obj(t)
    if t == nil or next(t) == nil then
        return table.create(0, 1)
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
        logger:error("dashboards: action response cannot be encoded", { error = tostring(err) })
        res:set_status(http.STATUS.INTERNAL_ERROR)
        res:write('{"error":{"code":"internal","message":"The result cannot be encoded"}}')
        return
    end
    res:set_status(status)
    res:write(text)
end

local function not_found(res)
    send(res, http.STATUS.NOT_FOUND, { error = { code = "not_found", message = "Unknown page or action" } })
end

-- Envelope for a state that carries an error.
local function error_envelope(action, state, code, field, message)
    local err = { code = code, message = message or MESSAGES[code] or MESSAGES.action_failed }
    if field ~= nil then
        err.field = field
    end
    return { action = action, state = state, computed_at = now_iso(), error = err }
end

-- The code of an error the function returned, if it is safe to show; else action_failed.
local function error_code(err)
    local code
    if type(err) == "userdata" then
        local ok, details = pcall(function()
            return err:details()
        end)
        if ok and type(details) == "table" then
            code = details.code
        end
    elseif type(err) == "table" then
        code = err.code
    end
    if type(code) == "string" and code:match("^[a-z][a-z0-9_]*$") and #code >= 2 and #code <= 41 then
        return code
    end
    return "action_failed"
end

-- Runs fn(db) with a database handle that is released straight after, so no handle
-- stays open while the declared function runs.
local function with_db(fn)
    local db, derr = sql.get("app:db")
    if derr then
        return nil, derr
    end
    local a, b = fn(db)
    db:release()
    return a, b
end

-- Merges the request args into the action's args (contracts section 3).
--   * a key the page binds to a constant: the page's value always wins; a request value is replaced
--   * a key the page binds to a $param: the request supplies the value (the page owns the slot)
--   * a key in tile_args: the request supplies the value
--   * any other key: refused, returns nil, key
local function merge_args(page_args, tile_args, requested)
    local constants, bound, problem = args_lib.classify(page_args)
    if not constants then
        return nil, nil, problem
    end
    local allowed = {}
    for _, name in ipairs(tile_args or {}) do
        allowed[name] = true
    end
    local merged = {}
    for key, value in pairs(requested) do
        if constants[key] ~= nil then
            -- replaced below
        elseif bound[key] or allowed[key] then
            merged[key] = value
        else
            return nil, key
        end
    end
    for key, value in pairs(constants) do
        merged[key] = value
    end
    return merged
end

-- Reads the JSON body. Returns the table, or nil plus a reason.
local function read_body(req)
    local raw = req:body()
    if type(raw) ~= "string" or raw == "" then
        return nil, "the body is empty"
    end
    if #raw > MAX_BODY_BYTES then
        return nil, "the body is too large"
    end
    local body, err = json.decode(raw)
    if err or type(body) ~= "table" then
        return nil, "the body is not a JSON object"
    end
    return body
end

-- The envelope of a finished row: the stored result, or the stored error. The stored
-- result is converted to result_schema again, because decoding loses the difference
-- between an empty object and an empty list.
local function stored_envelope(action, row, result_schema)
    local data = {}
    if type(row.result) == "string" and row.result ~= "" then
        local decoded = json.decode(row.result)
        if type(decoded) == "table" then
            data = decoded
        end
    end
    if row.state == log.STATE_DONE then
        return { action = action, state = "done", result = obj(shape.conform(result_schema, data)), computed_at = now_iso(), replayed = true }
    end
    local code = type(data.error) == "table" and data.error.code or "action_failed"
    local env = error_envelope(action, "failed", code)
    env.replayed = true
    return env
end

local function handler()
    local req = http.request()
    local res = http.response()
    res:set_content_type(http.CONTENT.JSON)

    local id = req:param("id")
    local action = req:param("action")
    if not spec_lib.is_page_id(id) or type(action) ~= "string" or action == "" or #action > 41 then
        return not_found(res)
    end

    -- 1. A stored page without its registry entry (after a restart) is not served.
    local entry_id = spec_lib.entry_id(id)
    if not registry.get(entry_id) then
        return not_found(res)
    end

    -- 2. The viewer must be able to see the page.
    local actor = security.actor()
    local viewer_id = actor and actor:id() or ""
    if viewer_id == "" or not security.can("view", "page:" .. entry_id) then
        return send(res, http.STATUS.FORBIDDEN, error_envelope(action, "denied", "denied"))
    end

    local row, qerr = with_db(function(db)
        local rows, err = db:query("SELECT spec, revision FROM dash_pages WHERE page_id = ? AND published = 1", { id })
        if err then
            return nil, err
        end
        return rows and rows[1] or false
    end)
    if row == nil then
        logger:error("dashboards: cannot read the page", { page = id, error = tostring(qerr) })
        return send(res, http.STATUS.INTERNAL_ERROR, { error = { code = "internal", message = "Cannot read the page" } })
    end
    if row == false then
        return not_found(res)
    end
    local spec, jerr = json.decode(row.spec)
    if jerr or type(spec) ~= "table" then
        return send(res, http.STATUS.INTERNAL_ERROR, { error = { code = "internal", message = "Stored page is unreadable" } })
    end
    local page_action = type(spec.actions) == "table" and spec.actions[action] or nil
    if type(page_action) ~= "table" then
        return not_found(res)
    end

    -- 3. The declaration is looked up now, not at publication.
    local decl = spec_lib.action_decl(page_action.ref)
    local meta = decl and decl.meta
    local permission = meta and meta.permission
    if not decl or type(meta.func) ~= "string" or meta.func == ""
        or type(permission) ~= "table" or type(permission.action) ~= "string" or type(permission.resource) ~= "string" then
        logger:warn("dashboards: action declaration is missing or not an action", { page = id, action = action })
        return send(res, http.STATUS.BAD_REQUEST, error_envelope(action, "failed", "undeclared"))
    end

    -- 4. The viewer needs the action's own permission. A shared page grants none.
    if not security.can(permission.action, permission.resource) then
        logger:info("dashboards: action denied", { page = id, action = action, permission = permission.action })
        return send(res, http.STATUS.FORBIDDEN, error_envelope(action, "denied", permission.action, nil, MESSAGES.denied))
    end

    -- 5. Body and idempotency key.
    local body, berr = read_body(req)
    if not body then
        logger:info("dashboards: action body refused", { page = id, action = action, reason = berr })
        return send(res, http.STATUS.BAD_REQUEST, error_envelope(action, "failed", "invalid_args"))
    end
    local key = body.idempotency_key
    if type(key) ~= "string" or #key < KEY_MIN or #key > KEY_MAX or not key:match("^[A-Za-z0-9_.:%-]+$") then
        return send(res, http.STATUS.BAD_REQUEST, error_envelope(action, "failed", "invalid_args", "idempotency_key"))
    end
    local requested = body.args
    if requested == nil then
        requested = {}
    end
    if type(requested) ~= "table" then
        return send(res, http.STATUS.BAD_REQUEST, error_envelope(action, "failed", "invalid_args", "args"))
    end
    for k in pairs(requested) do
        if type(k) ~= "string" then
            return send(res, http.STATUS.BAD_REQUEST, error_envelope(action, "failed", "invalid_args", "args"))
        end
    end

    -- 6. Merge and validate.
    local merged, bad_key, problem = merge_args(page_action.args, meta.tile_args, requested)
    if problem == "mixed" then
        logger:error("dashboards: stored page mixes a constant with a $param in one arg", { page = id, action = action })
        return send(res, http.STATUS.INTERNAL_ERROR,
            { error = { code = "page_broken", message = "The page has an argument that cannot be bound safely" } })
    end
    if not merged then
        logger:info("dashboards: action args refused", { page = id, action = action, reason = "field outside tile_args" })
        return send(res, http.STATUS.BAD_REQUEST, error_envelope(action, "failed", "invalid_args", bad_key))
    end
    merged = obj(merged)
    if not log.within_depth(merged) then
        logger:info("dashboards: action args refused", { page = id, action = action, reason = "nested too deeply" })
        return send(res, http.STATUS.BAD_REQUEST, error_envelope(action, "failed", "invalid_args", "args"))
    end
    local valid, why = shape.validates(meta.args_schema, merged)
    if not valid then
        logger:info("dashboards: action args refused", { page = id, action = action, reason = "args_schema (" .. tostring(why) .. ")" })
        return send(res, http.STATUS.BAD_REQUEST, error_envelope(action, "failed", "invalid_args"))
    end

    -- 7. The log row, stored before the action runs.
    local result_schema = meta.result_schema or { type = "object" }
    local args_hash = log.args_hash(id, action, merged)
    local inserted, ierr = with_db(function(db)
        return log.begin(db, {
            key = key,
            viewer_id = viewer_id,
            page_id = id,
            revision = row.revision,
            action = action,
            args_hash = args_hash,
            args_redacted = log.redact(merged, meta.sensitive_fields),
        })
    end)
    if inserted == nil then
        logger:error("dashboards: cannot store the action log row", { page = id, action = action, error = tostring(ierr) })
        return send(res, http.STATUS.INTERNAL_ERROR, error_envelope(action, "failed", "internal"))
    end
    if inserted == false then
        local existing, ferr = with_db(function(db)
            return log.find(db, viewer_id, key)
        end)
        if not existing then
            logger:error("dashboards: cannot read the action log row", { page = id, action = action, error = tostring(ferr) })
            return send(res, http.STATUS.INTERNAL_ERROR, error_envelope(action, "failed", "internal"))
        end
        if existing.args_hash ~= args_hash then
            logger:info("dashboards: idempotency key reused with other values", { page = id, action = action })
            return send(res, http.STATUS.CONFLICT, error_envelope(action, "failed", "idempotency_conflict"))
        end
        if existing.state == log.STATE_RUNNING or type(existing.result) ~= "string" then
            -- Either another call with this key is still running, or a run ended with no
            -- recorded result. The action may or may not have happened, so it does not run again.
            logger:warn("dashboards: action with no stored result is not run again", { page = id, action = action })
            return send(res, http.STATUS.OK, error_envelope(action, "unknown", "unknown_outcome"))
        end
        return send(res, http.STATUS.OK, stored_envelope(action, existing, result_schema))
    end

    -- 8. Run as the viewer.
    local result, ferr = funcs.new():call(meta.func, {
        args = merged,
        action_id = decl.id,
        idempotency_key = key,
    })

    local state, stored, env
    if ferr ~= nil then
        -- The function's error text stays in the log and never reaches the viewer.
        logger:warn("dashboards: action function failed", { page = id, action = action, error = tostring(ferr) })
        local code = error_code(ferr)
        state, stored = log.STATE_FAILED, { error = { code = code } }
        env = error_envelope(action, "failed", code)
    else
        -- The converted copy is what validates() checks, so that copy is stored and sent.
        local wire = type(result) == "table" and shape.conform(result_schema, result) or nil
        local ok = wire ~= nil and shape.validates(result_schema, wire)
        if ok then
            state, stored = log.STATE_DONE, wire
            env = { action = action, state = "done", result = obj(wire), computed_at = now_iso() }
        else
            logger:warn("dashboards: action result does not match its result_schema", { page = id, action = action })
            state, stored = log.STATE_FAILED, { error = { code = "format_mismatch" } }
            env = error_envelope(action, "failed", "format_mismatch")
        end
    end

    local _, serr = with_db(function(db)
        return log.finish(db, viewer_id, key, state, stored)
    end)
    if serr then
        -- The row stays 'running', so a retry reports unknown and never runs the action twice.
        logger:error("dashboards: cannot store the action result", { page = id, action = action, error = tostring(serr) })
        return send(res, http.STATUS.OK, error_envelope(action, "unknown", "log_failed"))
    end

    send(res, http.STATUS.OK, env)
end

return { handler = handler }
