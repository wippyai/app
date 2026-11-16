-- Tells every open client that the list of pages changed.
--
-- After each registry commit the service compares the nav-relevant meta of
-- every view.page entry with the last state it saw. When the two differ, it
-- sends the WebSocket topic `pages` with an empty payload to wippy.central,
-- which fans it out to every connected user. Each client then reads
-- /api/public/pages/list again with its own token, so the per-user access
-- check still decides what that user sees, and the message itself leaks
-- nothing. The Web Host's built-in nav and the app's own sidebar both listen
-- for `pages`.
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

-- Meta fields that change what a nav shows or where a page opens.
local FIELDS = {
    "title", "icon", "order", "group", "group_icon", "group_order", "group_placement",
    "announced", "public", "secure", "inline", "internal", "mountRoute",
}

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
            local value = meta[field]
            parts[#parts + 1] = field .. "=" .. (value == nil and "" or tostring(value))
        end
        rows[#rows + 1] = table.concat(parts, "|")
    end
    table.sort(rows)
    return table.concat(rows, "\n")
end

local function send_signal()
    local central = process.registry.lookup(CENTRAL_HUB)
    if not central then
        -- No relay hub means no connected clients to tell.
        return
    end
    local ok, err = process.send(central, TOPIC, {})
    if not ok then
        logger:warn("page signal not sent", { error = tostring(err) })
    end
end

local function main()
    local last, ferr = fingerprint()
    if ferr then
        logger:error("cannot read the page registry", { error = tostring(ferr) })
        return false
    end

    local sub, serr = events.subscribe("registry", "registry.commit")
    if serr then
        logger:error("cannot watch registry commits", { error = tostring(serr) })
        return false
    end
    local commits = sub:channel()
    local proc_events = process.events()
    local settle = nil

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
            settle = settle or time.after(SETTLE)
        elseif settle and result.channel == settle then
            settle = nil
            local current, err = fingerprint()
            if err then
                logger:warn("cannot read the page registry", { error = tostring(err) })
            elseif current ~= last then
                last = current
                send_signal()
            end
        end
    end

    sub:close()
    return true
end

return { main = main }
