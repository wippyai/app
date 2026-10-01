-- Test-only endpoint that appends a line to an artifact the caller owns, through wippy.session persistence.
-- It answers 404 unless app.env:session_forms_dev_fixtures is "true".
local http = require("http")
local security = require("security")
local time = require("time")
local env = require("env")

local artifact_repo = require("artifact_repo")
local artifact_events = require("artifact_events")

local FIXTURES_ENABLED_ENV = "app.env:session_forms_dev_fixtures"

local function not_found(res)
    res:set_status(http.STATUS.NOT_FOUND)
    res:write_json({ success = false, error = "not found" })
end

local function handler()
    local res = http.response()
    local req = http.request()
    if not res or not req then return nil, "no http context" end
    res:set_content_type(http.CONTENT.JSON)

    -- Checked first, before auth, so a disabled endpoint looks like a missing route.
    local fixtures_enabled = env.get(FIXTURES_ENABLED_ENV)
    if fixtures_enabled ~= "true" then
        not_found(res)
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

    -- A missing artifact and another user's artifact get the same 404.
    local artifact, get_err = artifact_repo.get(artifact_id)
    if get_err or not artifact or artifact.user_id ~= actor:id() then
        not_found(res)
        return
    end

    -- Form artifacts follow wippy/session's own rules, so refuse them here.
    -- The meta key must match META_KEY in the Session's forms/form_artifact.lua.
    if type(artifact.meta) == "table" and artifact.meta.session_form ~= nil then
        res:set_status(409)
        res:write_json({
            success = false,
            code = "session_form",
            message = "Session forms cannot be changed through this fixture.",
        })
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
        -- artifact_repo.update returns a string for validation errors and an
        -- Error object for CONFLICT and NOT_FOUND, so probe it with pcall.
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
            not_found(res)
            return
        end

        res:set_status(http.STATUS.INTERNAL_ERROR)
        res:write_json({ success = false, error = tostring(update_err) })
        return
    end

    -- Read the row back so the response and the event carry what was committed.
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
