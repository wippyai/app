local http = require("http_client")
local security = require("security")
local time = require("time")

-- The flow runs under the current security actor; resolve that user's relay hub
-- and process.send an event, which the browser receives live.
local USER_HUB_PREFIX = "user."
local TOPIC = "web:fetch"
local MAX_CONTENT = 4000
local MAX_SNIPPET = 480

type FetchEvent = {
    url: string,
    status: string | number,
    title?: string,
    snippet?: string,
    bytes?: number,
    error?: string,
    at?: string,
}

type Params = {
    url: string,
}

type Result = {
    url: string,
    status: number,
    title?: string,
    content: string,
}

local function notify(event: FetchEvent)
    local actor = security.actor()
    if actor == nil then return end
    local hub_pid = process.registry.lookup(USER_HUB_PREFIX .. actor:id())
    if hub_pid ~= nil then
        process.send(hub_pid, TOPIC, event)
    end
end

local function strip_tags(s: string): string
    s = s:gsub("<script.-</script>", " ")
    s = s:gsub("<style.-</style>", " ")
    s = s:gsub("<!%-%-.-%-%->", " ")
    s = s:gsub("<[^>]+>", " ")
    s = s:gsub("%s+", " ")
    return (s:gsub("^%s+", ""))
end

local function handler(params: Params): (Result?, string?)
    local url: string? = params ~= nil and params.url or nil
    if type(url) ~= "string" or not (url :: string):match("^https?://") then
        return nil, "url must be an absolute http(s) URL"
    end
    local target = url :: string

    notify({ url = target, status = "fetching", at = time.now():format("15:04:05") })

    local resp, err = http.get(target, { headers = { ["User-Agent"] = "WippyApp/1.0" } })
    if err ~= nil or resp == nil then
        notify({ url = target, status = "error", error = tostring(err), at = time.now():format("15:04:05") })
        return nil, "fetch failed: " .. tostring(err)
    end

    local body: string = resp.body or ""
    local raw_title: string? = body:match("<title[^>]*>(.-)</title>")
    local title: string? = raw_title ~= nil and strip_tags(raw_title) or nil
    local text: string = strip_tags(body)

    notify({
        url = target,
        status = resp.status_code :: number,
        title = title,
        snippet = text:sub(1, MAX_SNIPPET),
        bytes = #body,
        at = time.now():format("15:04:05"),
    })

    return {
        url = target,
        status = resp.status_code :: number,
        title = title,
        content = text:sub(1, MAX_CONTENT),
    }
end

return { handler = handler }
