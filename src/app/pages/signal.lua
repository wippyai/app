-- Tells every open client that the list of pages changed.
--
-- After each registry commit the service compares the nav-relevant meta of
-- every view.page entry with the last state it signalled. When the two
-- differ, it sends the WebSocket topic `pages` with an empty payload to
-- wippy.central, which fans it out to every connected user. Each client then
-- reads /api/public/pages/list again with its own token, so the per-user
-- access check still decides what that user sees, and the message itself
-- leaks nothing. The Web Host's built-in nav and the app's own sidebar both
-- listen for `pages`.
--
-- The service watches registry commits instead of one module, so a page that
-- any module adds, changes or removes reaches open clients without that
-- module knowing about this service. The page registry's owner (wippy/views)
-- is the natural long-term home for it.
local events = require("events")
local registry = require("registry")
local channel = require("channel")
local time = require("time")
local logger = require("logger"):named("app.pages")

local TOPIC = "pages"
local CENTRAL_HUB = "wippy.central"
-- Several commits in a row (a restore at boot, a module install) send one signal.
local SETTLE = "200ms"
-- A failed registry read or send is tried again a few times, then waits for the next commit.
local RETRY_WAIT = "1s"
local RETRY_LIMIT = 5

-- Meta fields that /api/public/pages/list returns, so a change to any of them
-- can change what a client shows.
local FIELDS = {
    "name", "title", "icon", "order", "placement",
    "group", "group_icon", "group_order", "group_placement",
    "announced", "public", "secure", "inline", "internal", "mountRoute", "config_overrides",
}

-- A stable text form of a value: tables are written with sorted keys, so the
-- same meta always gives the same text.
local function canonical(value)
    if type(value) ~= "table" then
        return type(value) .. ":" .. tostring(value)
    end
    local keys = {}
    for key in pairs(value) do
        keys[#keys + 1] = key
    end
    table.sort(keys, function(a, b) return tostring(a) < tostring(b) end)
    local parts = {}
    for _, key in ipairs(keys) do
        parts[#parts + 1] = tostring(key) .. "=" .. canonical(value[key])
    end
    return "{" .. table.concat(parts, ",") .. "}"
end

local function fingerprint()
    local entries, err = registry.find({ ["meta.type"] = "view.page" })
    if err then
        return nil, err
    end
    local rows = {}
    for _, entry in ipairs(entries or {}) do
        local meta = entry.meta or {}
        local parts = { tostring(entry.id) }
        for _, field in ipairs(FIELDS) do
            parts[#parts + 1] = field .. "=" .. canonical(meta[field])
        end
        rows[#rows + 1] = table.concat(parts, "|")
    end
    table.sort(rows)
    return table.concat(rows, "\n")
end

-- True when every connected client was told. With no relay hub there is no
-- connected client, so there is nothing to tell.
local function send_signal()
    local central = process.registry.lookup(CENTRAL_HUB)
    if not central then
        return true
    end
    local ok, err = process.send(central, TOPIC, {})
    if not ok then
        logger:warn("page signal not sent", { error = tostring(err) })
        return false
    end
    return true
end

local function main()
    -- Subscribe before the first read, so no commit falls between the two.
    local sub, serr = events.subscribe("registry", "registry.commit")
    if serr then
        logger:error("cannot watch registry commits", { error = tostring(serr) })
        -- The supervisor starts the service again (lifecycle restart defaults).
        return false
    end
    local commits = sub:channel()
    local proc_events = process.events()
    -- Nothing has been signalled yet: the first check sends one signal, so a
    -- client that kept running while this service restarted reads again.
    local last = nil
    local settle = time.after(SETTLE)
    local failures = 0

    local function retry_later()
        failures = failures + 1
        if failures < RETRY_LIMIT then
            settle = time.after(RETRY_WAIT)
        end
    end

    while true do
        local cases = { proc_events:case_receive(), commits:case_receive() }
        if settle then
            cases[#cases + 1] = settle:case_receive()
        end
        local result = channel.select(cases)

        if result.channel == proc_events then
            local event = result.value
            if not result.ok or (event and event.kind == process.event.CANCEL) then
                break
            end
        elseif result.channel == commits then
            if not result.ok then
                logger:error("registry commit subscription closed")
                break
            end
            -- A new commit gives a failed check a fresh set of tries.
            failures = 0
            settle = settle or time.after(SETTLE)
        elseif settle and result.channel == settle then
            settle = nil
            local current, err = fingerprint()
            if err then
                logger:warn("cannot read the page registry", { error = tostring(err) })
                retry_later()
            elseif current ~= last then
                -- Remember the state only once clients were told about it.
                if send_signal() then
                    last = current
                    failures = 0
                else
                    retry_later()
                end
            end
        end
    end

    sub:close()
    return true
end

return { main = main }
