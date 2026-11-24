-- demo.actor:build_pages stands in for the agent: it publishes the two page
-- specs of specs.lua through wippy.dashboards:publish, as the caller. Running
-- it again updates the same rows and entries (one per page).
-- POST /api/v1/demo/build runs it for a caller allowed dashboards.publish.
local http = require("http")
local json = require("json")
local publish_lib = require("publish")
local specs = require("specs")

-- Returns the list of publication results, or nil plus { status, code, message }.
local function publish_all()
    local results = {}
    for _, spec in ipairs(specs.all()) do
        local raw, jerr = json.encode(spec)
        if jerr or type(raw) ~= "string" then
            return nil, { status = 500, code = "internal", message = "Cannot encode page " .. tostring(spec.id) }
        end
        local result, err = publish_lib.publish(raw)
        if not result then
            err.message = "page " .. tostring(spec.id) .. ": " .. tostring(err.message)
            return nil, err
        end
        results[#results + 1] = result
    end
    return results
end

-- Function form, for callers other than HTTP.
local function build_pages()
    local results, err = publish_all()
    if not results then
        return nil, err.code .. ": " .. err.message
    end
    return { pages = results }
end

local function handler()
    local res = http.response()
    res:set_content_type(http.CONTENT.JSON)

    local results, err = publish_all()
    if not results then
        res:set_status(err.status)
        res:write_json({ error = { code = err.code, message = err.message } })
        return
    end

    res:set_status(http.STATUS.OK)
    res:write_json({ pages = results })
end

return { build_pages = build_pages, handler = handler }
