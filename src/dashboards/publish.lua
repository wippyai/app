-- Publishes one page spec (contracts section 3, POST /api/v1/dashboards/pages).
-- Shared by the HTTP handler and by callers that publish from Lua, such as
-- a scripted actor that builds pages. publish(raw) takes the request body as JSON text.
-- It returns { id, route, entry_id, revision }, or nil plus
-- { status, code, message }. A refused spec leaves the database and the
-- registry unchanged.
local json = require("json")
local security = require("security")
local sql = require("sql")
local spec_lib = require("spec")
local generator = require("generator")

local MAX_BODY = 262144

local function fail(status, code, message)
    return nil, { status = status, code = code, message = message }
end

local function publish(raw)
    if not security.can("dashboards.publish", "wippy.dashboards:pages") then
        return fail(403, "denied", "You may not publish dashboard pages")
    end

    if type(raw) ~= "string" or raw == "" then
        return fail(400, "invalid_spec", "Request body is required")
    end
    if #raw > MAX_BODY then
        return fail(400, "invalid_spec", "Request body is too large")
    end
    local body, jerr = json.decode(raw)
    if jerr or type(body) ~= "table" then
        return fail(400, "invalid_spec", "Body is not a JSON object")
    end
    if body.publish ~= true then
        return fail(400, "invalid_spec", "publish must be true")
    end

    local spec, verr = spec_lib.validate(body)
    if not spec then
        return fail(400, verr.code, verr.message)
    end

    local db, derr = sql.get("app:db")
    if derr then
        return fail(500, "internal", "Database unavailable")
    end

    local entry_id = spec_lib.entry_id(spec.id)

    -- Route rules against the registry and against the other stored pages.
    local rows, qerr = db:query("SELECT page_id, route FROM dash_pages WHERE page_id <> ?", { spec.id })
    if qerr then
        db:release()
        return fail(500, "internal", "Cannot read stored pages")
    end
    local ok, rerr = spec_lib.check_route_free(spec.route, entry_id, spec.id, rows)
    if not ok then
        db:release()
        return fail(rerr.code == "internal" and 500 or 400, rerr.code, rerr.message)
    end

    -- Row first inside a transaction; the registry is changed last, and the
    -- row is rolled back when the registry refuses.
    local tx, terr = db:begin()
    if terr then
        db:release()
        return fail(500, "internal", "Cannot start a transaction")
    end

    local _, xerr = tx:execute([[
        INSERT INTO dash_pages (page_id, route, title, spec, revision, published, entry_id)
        VALUES (?, ?, ?, ?, 1, 1, ?)
        ON CONFLICT(page_id) DO UPDATE SET
            route = excluded.route,
            title = excluded.title,
            spec = excluded.spec,
            revision = dash_pages.revision + 1,
            published = 1,
            entry_id = excluded.entry_id,
            updated_at = strftime('%s', 'now')
    ]], { spec.id, spec.route, spec.title, raw, entry_id })
    if xerr then
        tx:rollback()
        db:release()
        if tostring(xerr):find("UNIQUE") then
            return fail(400, "duplicate_route", "Another stored page uses this route")
        end
        return fail(500, "internal", "Cannot store the page")
    end

    local stored, serr = tx:query("SELECT revision FROM dash_pages WHERE page_id = ?", { spec.id })
    if serr or not stored or not stored[1] then
        tx:rollback()
        db:release()
        return fail(500, "internal", "Cannot read the stored page")
    end
    local revision = stored[1].revision

    local written = generator.write(spec)
    if not written then
        tx:rollback()
        db:release()
        return fail(500, "internal", "Cannot publish the page entry")
    end

    local _, cerr = tx:commit()
    db:release()
    if cerr then
        return fail(500, "internal", "Cannot commit the page")
    end

    return { id = spec.id, route = spec.route, entry_id = written, revision = revision }
end

return { publish = publish, MAX_BODY = MAX_BODY }
