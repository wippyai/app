-- DEV FIXTURE — POST /api/v1/session-forms-dev/artifacts/{id}/touch
--
-- Development-only artifact mutation fixture for the Session Forms visible
-- tests (M01, M14). Appends one Markdown line to an artifact the caller owns
-- through the real Session persistence path (wippy.session.persist), so the
-- tests can trigger a genuine server mutation and observe the Host refresh —
-- not a way around Session's rules.
--
-- Gated by:
--   1. app.env:session_forms_dev_fixtures must equal "true" (else 404, first
--      check below — never reveals whether the artifact exists either way).
--   2. app.security:admin group membership, enforced declaratively by
--      endpoint_firewall via touch_artifact.deny_user in this namespace's
--      _index.yaml (a request from a non-admin never reaches this handler).
--
-- Never enable app.env:session_forms_dev_fixtures in production.
local http = require("http")
local security = require("security")
local time = require("time")
local env = require("env")

local artifact_repo = require("artifact_repo")
local artifact_events = require("artifact_events")

local FIXTURES_ENABLED_ENV = "app.env:session_forms_dev_fixtures"

local function handler()
    local res = http.response()
    local req = http.request()
    if not res or not req then return nil, "no http context" end
    res:set_content_type(http.CONTENT.JSON)

    -- Dev-fixture gate. Checked before anything else, including auth, so a
    -- disabled fixture looks identical to a route that does not exist.
    local fixtures_enabled = env.get(FIXTURES_ENABLED_ENV)
    if fixtures_enabled ~= "true" then
        res:set_status(http.STATUS.NOT_FOUND)
        res:write_json({ success = false, error = "not found" })
        return
    end

    local actor = security.actor()
    if not actor then
        res:set_status(http.STATUS.UNAUTHORIZED)
        res:write_json({ success = false, error = "authentication required" })
        return
    end

    local artifact_id = req:param("id")
    if not artifact_id or artifact_id == "" then
        res:set_status(http.STATUS.BAD_REQUEST)
        res:write_json({ success = false, error = "artifact id is required" })
        return
    end

    local artifact, get_err = artifact_repo.get(artifact_id)
    if get_err or not artifact then
        -- Same response whether the artifact is missing or belongs to
        -- someone else — never reveal existence to a non-owner.
        res:set_status(http.STATUS.NOT_FOUND)
        res:write_json({ success = false, error = "not found" })
        return
    end

    if artifact.user_id ~= actor:id() then
        res:set_status(http.STATUS.NOT_FOUND)
        res:write_json({ success = false, error = "not found" })
        return
    end

    local touched_line = "\n- touched " .. time.now():format_rfc3339()
    local new_content = (artifact.content or "") .. touched_line

    local _result, update_err = artifact_repo.update(
        artifact_id,
        { content = new_content },
        { expected_version = artifact.content_version }
    )

    if update_err then
        -- artifact_repo.update returns a plain string for validation failures
        -- and an Error object (:kind()/:details()) for CONFLICT/NOT_FOUND —
        -- cast to `any` before probing, same as artifact_repo_test.lua does,
        -- and pcall-guard since a plain string has neither method.
        local update_err_any = update_err :: any
        local kind_ok, err_kind = pcall(function() return update_err_any:kind() end)

        if kind_ok and err_kind == errors.CONFLICT then
            local details_ok, details = pcall(function() return update_err_any:details() end)
            local current_version = details_ok and details and details.current_version or nil
            res:set_status(409)
            res:write_json({ success = false, error = "conflict", current_version = current_version })
            return
        end

        if kind_ok and err_kind == errors.NOT_FOUND then
            res:set_status(http.STATUS.NOT_FOUND)
            res:write_json({ success = false, error = "not found" })
            return
        end

        res:set_status(http.STATUS.INTERNAL_ERROR)
        res:write_json({ success = false, error = tostring(update_err) })
        return
    end

    -- Read the row back on its own connection so the response — and the
    -- published event — always carry what actually committed, never a value
    -- a concurrent writer could have since moved past.
    local updated_artifact, reread_err = artifact_repo.get(artifact_id)
    if reread_err or not updated_artifact then
        res:set_status(http.STATUS.INTERNAL_ERROR)
        res:write_json({ success = false, error = "failed to read back artifact" })
        return
    end

    artifact_events.publish_updated(updated_artifact)

    res:set_status(http.STATUS.OK)
    res:write_json({
        success = true,
        uuid = updated_artifact.artifact_id,
        content_version = updated_artifact.content_version,
    })
end

return { handler = handler }
