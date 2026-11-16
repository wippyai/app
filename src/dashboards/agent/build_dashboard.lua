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
local registry = require("registry")
local security = require("security")
local funcs = require("funcs")
local plan_lib = require("plan")

local PUBLISH_FUNC = "wippy.dashboards.agent:publish_page"
local HINT = "Fix every error and call BuildDashboard again with the whole plan."

-- The literal start of a mount route: "/home/:part(.*)*" gives "/home".
local function mount_prefix(mount_route)
    local parts = {}
    for segment in tostring(mount_route):gmatch("[^/]+") do
        if segment:sub(1, 1) == ":" or segment:find("[%*%(]") then
            break
        end
        parts[#parts + 1] = segment
    end
    return "/" .. table.concat(parts, "/")
end

-- Where a link to a published page points. An app may show pages inside a
-- shell page instead of on their own: the shell's view.page declares
-- meta.page_outlet = true and shows any listed page at its own mount prefix
-- plus the page's route (the template's frontend/packages/app-nav does this).
-- The link then opens the page inside the shell and keeps the app's nav.
-- Without exactly one outlet, the link is the page's own route, which the Web
-- Host opens on its own. The module knows nothing about the app either way.
local function page_link(route)
    local pages, err = registry.find({ ["meta.type"] = "view.page" })
    if err then
        return route
    end
    local outlets = {}
    for _, entry in ipairs(pages or {}) do
        local meta = entry.meta or {}
        if meta.page_outlet == true and type(meta.mountRoute) == "string" then
            outlets[#outlets + 1] = mount_prefix(meta.mountRoute)
        end
    end
    if #outlets ~= 1 or outlets[1] == "/" then
        return route
    end
    return outlets[1] .. route
end

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
    local url = page_link(result.route)
    logger:info("dashboards: page built", { page = result.id, route = result.route, url = url, tiles = count, revision = result.revision })
    return {
        ok = true,
        page_id = result.id,
        title = spec.title,
        route = result.route,
        url = url,
        revision = result.revision,
        tiles = count,
        link = "[" .. spec.title .. "](" .. url .. ")",
        reply = "Answer in one or two sentences: what the page shows, then the link exactly as given in `link`. "
            .. "Mention a limit only when it matters (for example, the data covers only what this app recorded).",
    }
end

return { handler = handler }
