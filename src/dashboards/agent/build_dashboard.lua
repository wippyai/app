-- The BuildDashboard tool (spec section 10): compiles the agent's plan into a
-- page spec and publishes it as the user the agent works for. It returns the
-- link, or the errors to fix; the agent loop calls it again after fixing them.
--
-- Identity: a chat session can run with the application's default user scope
-- even for an admin, so the session's own scope may refuse a page the user may
-- publish. The tool then tries the scopes of the user's own security groups
-- (from the actor's sign-in metadata). It never grants more than one of the
-- user's groups grants.
local json = require("json")
local logger = require("logger")
local security = require("security")
local funcs = require("funcs")
local plan_lib = require("plan")

local PUBLISH_FUNC = "wippy.dashboards.agent:publish_page"
local HINT = "Fix every error and call BuildDashboard again with the whole plan."

-- Publishes with the session's identity, then with each of the user's groups. Returns the
-- publish result, or nil and { code, message }.
local function publish_as_user(raw)
    local actor = security.actor()
    if not actor then
        return nil, { code = "denied", message = "no user identity in this chat" }
    end

    local attempts = {}
    if security.scope() then
        attempts[#attempts + 1] = { label = "session", scope = security.scope() }
    end
    local ok, meta = pcall(function() return actor:meta() end)
    local groups = ok and type(meta) == "table" and meta.security_groups or nil
    for _, group in ipairs(type(groups) == "table" and groups or {}) do
        local scope = security.named_scope(tostring(group))
        if scope then
            attempts[#attempts + 1] = { label = tostring(group), scope = scope }
        end
    end

    local last = { code = "denied", message = "you may not publish dashboard pages" }
    for _, attempt in ipairs(attempts) do
        local executor = funcs.new():with_actor(actor)
        executor = executor:with_scope(attempt.scope)
        local out, err = executor:call(PUBLISH_FUNC, raw)
        if err then
            return nil, { code = "internal", message = tostring(err) }
        end
        if type(out) == "table" and out.ok then
            logger:info("dashboards: published as user", { user = actor:id(), scope = attempt.label })
            return out.result
        end
        last = type(out) == "table" and out.error or last
        if last.code ~= "denied" then
            return nil, last
        end
    end
    return nil, last
end

local function handler(params)
    local spec, errors = plan_lib.compile(params or {})
    if not spec then
        logger:info("dashboards: plan refused", { errors = errors })
        return { ok = false, errors = errors, hint = HINT }
    end

    local raw, jerr = json.encode(spec)
    if jerr or type(raw) ~= "string" then
        return { ok = false, errors = { "the page could not be encoded" }, hint = HINT }
    end
    local result, err = publish_as_user(raw)
    if not result then
        logger:info("dashboards: publish refused", { code = err.code, message = err.message })
        if err.code == "denied" then
            return { ok = false, errors = { "this user may not publish dashboard pages" } }
        end
        return { ok = false, errors = { tostring(err.code) .. ": " .. tostring(err.message) }, hint = HINT }
    end

    local count = 0
    for _ in pairs(spec.tiles) do count = count + 1 end
    logger:info("dashboards: page built", { page = result.id, route = result.route, tiles = count, revision = result.revision })
    return {
        ok = true,
        page_id = result.id,
        title = spec.title,
        route = result.route,
        revision = result.revision,
        tiles = count,
        link = "[" .. spec.title .. "](" .. result.route .. ")",
        reply = "Answer in one or two sentences: what the page shows, then the link exactly as given in `link`. "
            .. "Mention a limit only when it matters (for example, the data covers only what this app recorded).",
    }
end

return { handler = handler }
