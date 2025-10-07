local http = require("http")
local start_tokens = require("start_tokens")
local registry = require("registry")

local REGISTRY_KIND_ENTRY = "registry.entry"
local AGENT_TYPE_GEN1 = "agent.gen1"
local DEFAULT_SESSION_KIND = "default"
local DEFAULT_ORDER = 500
local REQUIRED_AGENT_CLASS = "public"
local DEFAULT_GROUP = "Agents"

local function handler()
    local res = http.response()
    local req = http.request()
    if not res or not req then
        return nil, "Failed to get HTTP context"
    end

    local all_entries, err = registry.find({
        [".kind"] = REGISTRY_KIND_ENTRY,
        ["meta.type"] = AGENT_TYPE_GEN1
    })

    if err then
        res:set_status(http.STATUS.INTERNAL_ERROR)
        res:write_json({
            success = false,
            error = err
        })
        return
    end

    local agents = {}
    for _, entry in ipairs(all_entries) do
        if entry.meta then
            if entry.meta.private then
                goto continue
            end

            local has_required_class = false
            if type(entry.meta.class) == "table" then
                for _, cls in ipairs(entry.meta.class) do
                    if cls == REQUIRED_AGENT_CLASS then
                        has_required_class = true
                        break
                    end
                end
            end

            if not has_required_class then
                goto continue
            end

            local model = entry.meta.model or entry.data.model
            local kind = entry.meta.session_kind or DEFAULT_SESSION_KIND

            local group = entry.meta.group
            if not group or (type(group) == "table" and #group == 0) then
                group = {DEFAULT_GROUP}
            elseif type(group) ~= "table" then
                group = {group}
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

            local token_params = {
                agent = entry.id or "",
                model = model,
                kind = kind
            }

            local token, token_err = start_tokens.pack(token_params)
            if token then
                agent.start_token = token
            else
                res:set_status(http.STATUS.INTERNAL_ERROR)
                res:write_json({
                    success = false,
                    error = "Failed to generate start token for agent " .. (agent.name or "unnamed") .. ": " .. (token_err or "unknown error")
                })
                return
            end

            table.insert(agents, agent)

            ::continue::
        end
    end

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

    for _, group in ipairs(groups) do
        table.sort(group.agents, function(a, b)
            if a.order == b.order then
                return (a.title or "") < (b.title or "")
            end
            return a.order < b.order
        end)
    end

    table.sort(agents, function(a, b)
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