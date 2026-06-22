local http = require("http")
local start_tokens = require("start_tokens")
local registry = require("registry")
local api_error = require("api_error")

local AGENT_TYPE = "agent.gen1"
local REQUIRED_CLASS = "public"
local DEFAULT_ORDER = 500
local DEFAULT_GROUP = "Agents"
local DEFAULT_KIND = "default"

local function handler()
    local res = http.response()
    local req = http.request()
    if not res or not req then
        return nil, "Failed to get HTTP context"
    end

    local entries, err = registry.find({
        [".kind"] = "registry.entry",
        ["meta.type"] = AGENT_TYPE
    })

    if err then
        api_error.fail(res, http.STATUS.INTERNAL_ERROR, "Failed to list agents", err)
        return
    end

    local agents = {}
    for _, entry in ipairs(entries) do
        if not entry.meta or entry.meta.private then
            goto continue
        end

        local has_class = false
        if type(entry.meta.class) == "table" then
            for _, cls in ipairs(entry.meta.class) do
                if cls == REQUIRED_CLASS then
                    has_class = true
                    break
                end
            end
        end

        if not has_class then
            goto continue
        end

        local model = entry.meta.model or entry.data.model
        local kind = entry.meta.session_kind or DEFAULT_KIND

        local group = entry.meta.group
        if not group or (type(group) == "table" and #group == 0) then
            group = { DEFAULT_GROUP }
        elseif type(group) ~= "table" then
            group = { group }
        end

        local agent = {
            name = entry.id or "",
            title = entry.meta.title or entry.meta.name or "",
            comment = entry.meta.comment or "",
            group = group,
            order = entry.meta.order or DEFAULT_ORDER,
            icon = entry.meta.icon or "",
            class = entry.meta.class or {},
            model = model
        }

        local token, token_err = start_tokens.pack({
            agent = entry.id or "",
            model = model,
            kind = kind
        })

        if not token then
            api_error.fail(res, http.STATUS.INTERNAL_ERROR, "Failed to generate start token for " .. (agent.name or "unknown"), token_err or "unknown error")
            return
        end

        agent.start_token = token
        table.insert(agents, agent)

        ::continue::
    end

    table.sort(agents, function(a, b)
        if a.order == b.order then
            return (a.title or "") < (b.title or "")
        end
        return a.order < b.order
    end)

    local groups = {}
    local group_map = {}

    for _, agent in ipairs(agents) do
        for _, group_name in ipairs(agent.group) do
            if not group_map[group_name] then
                group_map[group_name] = {
                    name = group_name,
                    title = group_name,
                    order = DEFAULT_ORDER,
                    agents = {}
                }
                table.insert(groups, group_map[group_name])
            end
            table.insert(group_map[group_name].agents, agent)
        end
    end

    table.sort(groups, function(a, b)
        if a.order == b.order then
            return (a.title or "") < (b.title or "")
        end
        return a.order < b.order
    end)

    res:set_content_type(http.CONTENT.JSON)
    res:set_status(http.STATUS.OK)
    res:write_json({
        success = true,
        count = #agents,
        agents = agents,
        grouped = groups
    })
end

return {
    handler = handler
}
