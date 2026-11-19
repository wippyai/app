-- Admin-only self-test of the example mappers. GET /api/v1/demo/mappers/selftest runs every
-- example of every mapper in this module (namespace mock.mappers) and returns the results.
-- It calls each mapper's function as the engine would and compares the output with the stated
-- output exactly. It needs no dependency on wippy/dashboards.
local http = require("http")
local registry = require("registry")
local funcs = require("funcs")
local security = require("security")

local NAMESPACE_PREFIX = "mock.mappers:"

local function same(a, b)
    if type(a) ~= type(b) then
        return false
    end
    if type(a) ~= "table" then
        return a == b
    end
    for k, v in pairs(a) do
        if not same(v, b[k]) then
            return false
        end
    end
    for k in pairs(b) do
        if a[k] == nil then
            return false
        end
    end
    return true
end

local function run_example(meta, example)
    local context = type(example.context) == "table" and example.context or {}
    local data, err = funcs.new():call(meta.func, {
        rows = example.input,
        params = example.params or {},
        args = example.args or {},
        context = { time_zone = context.time_zone or "UTC", output = context.output },
    })
    if err ~= nil then
        return false, "the mapper returned an error: " .. tostring(err)
    end
    if not same(data, example.output) then
        return false, "the output differs from the stated output"
    end
    return true
end

local function handler()
    local res = http.response()
    res:set_content_type(http.CONTENT.JSON)

    if not security.can("mock.mappers.selftest", "mock.mappers:selftest") then
        res:set_status(http.STATUS.FORBIDDEN)
        res:write_json({ error = { code = "denied", message = "Only an administrator may run the mapper self-test" } })
        return
    end

    local found, ferr = registry.find({ [".kind"] = "registry.entry", ["meta.type"] = "wippy.data.mapper" })
    if ferr then
        res:set_status(http.STATUS.INTERNAL_ERROR)
        res:write_json({ error = { code = "internal", message = "Cannot read the registry" } })
        return
    end

    local mappers, all_ok = {}, true
    for _, entry in ipairs(found) do
        if tostring(entry.id):sub(1, #NAMESPACE_PREFIX) == NAMESPACE_PREFIX then
            local examples = entry.meta.examples or {}
            local failures = {}
            for i, example in ipairs(examples) do
                local ok, why = run_example(entry.meta, example)
                if not ok then
                    failures[#failures + 1] = { example = i, error = why }
                end
            end
            all_ok = all_ok and #failures == 0 and #examples >= 3
            mappers[#mappers + 1] = {
                id = entry.id,
                examples = #examples,
                passed = #examples - #failures,
                failures = failures,
            }
        end
    end
    table.sort(mappers, function(a, b) return a.id < b.id end)

    res:set_status(http.STATUS.OK)
    res:write_json({ ok = all_ok, mappers = mappers })
end

return { handler = handler }
