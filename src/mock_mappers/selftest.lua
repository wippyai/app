-- Admin-only self-test of the example mappers and of the demo's points.
-- GET /api/v1/demo/mappers/selftest returns, for every mapper declared in the registry
-- (type wippy.data.mapper):
--   - the result of every example: the mapper's function is called as the engine would call it,
--     and its output must equal the stated output exactly;
--   - the result of every expected failure (meta.expected_failures): a case whose function must
--     give an error that contains a text, or whose parameters must be refused by params_schema;
--   - valid_params: parameters that params_schema must accept (the edges of a range);
--   - the conformance check of wippy/dashboards (check_mappers.validate_mapper);
-- and for every demo point that declares a source, check_mappers.validate_point.
local http = require("http")
local registry = require("registry")
local funcs = require("funcs")
local security = require("security")
local check_mappers = require("check_mappers")
local shape = require("shape")

local DEMO_POINT_PREFIX = "demo.actor:"
local MOCK_PREFIX = "mock.mappers:"

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

local function call(meta, params, input, context, args)
    context = type(context) == "table" and context or {}
    return funcs.new():call(meta.func, {
        rows = input or {},
        params = params or {},
        args = type(args) == "table" and args or {},
        context = { time_zone = context.time_zone or "UTC", output = context.output },
    })
end

local function run_example(meta, example)
    local data, err = call(meta, example.params, example.input, example.context, example.args)
    if err ~= nil then
        return false, "the mapper returned an error: " .. tostring(err)
    end
    if not same(data, example.output) then
        return false, "the output differs from the stated output"
    end
    return true
end

-- An expected failure: the function must give an error that holds `error`, or the parameters
-- must not pass params_schema.
local function run_failure(meta, case)
    if case.params_invalid then
        if shape.validates(meta.params_schema, case.params or {}) then
            return false, "the parameters were accepted by params_schema"
        end
        return true
    end
    local data, err = call(meta, case.params, case.input, case.context, case.args)
    if err == nil then
        return false, "the mapper gave " .. (data == nil and "nothing" or "a result") .. " and no error"
    end
    if case.error and not tostring(err):find(case.error, 1, true) then
        return false, "the error does not hold '" .. case.error .. "': " .. tostring(err)
    end
    return true
end

-- Any installed mapper gets the generic conformance check of wippy/dashboards: required fields,
-- and every example exact. Only the mappers of this module (mock.mappers) must also meet the
-- demo's own rules: at least three examples, the expected failures and the valid edges.
local function check_mapper(entry)
    local mock = tostring(entry.id):sub(1, #MOCK_PREFIX) == MOCK_PREFIX
    if not mock then
        local conforms, cerr = check_mappers.validate_mapper(entry)
        local result = { id = entry.id, mock = false, conformance = { ok = conforms == true }, ok = conforms == true }
        if not conforms then
            result.conformance.error = cerr and cerr.message or "refused"
        end
        return result
    end

    local meta = entry.meta
    local examples = type(meta.examples) == "table" and meta.examples or {}
    local failures = {}
    for i, example in ipairs(examples) do
        local ok, why = run_example(meta, example)
        if not ok then
            failures[#failures + 1] = { example = i, error = why }
        end
    end

    local cases = type(meta.expected_failures) == "table" and meta.expected_failures or {}
    local negative_failures = {}
    for i, case in ipairs(cases) do
        local ok, why = run_failure(meta, case)
        if not ok then
            negative_failures[#negative_failures + 1] = { case = case.name or i, error = why }
        end
    end
    for i, params in ipairs(type(meta.valid_params) == "table" and meta.valid_params or {}) do
        if not shape.validates(meta.params_schema, params) then
            negative_failures[#negative_failures + 1] = { case = "valid_params " .. i, error = "params_schema refused valid parameters" }
        end
    end

    local conforms, cerr = check_mappers.validate_mapper(entry)
    local result = {
        id = entry.id,
        mock = true,
        examples = #examples,
        passed = #examples - #failures,
        failures = failures,
        expected_failures = #cases,
        expected_failures_passed = #cases - #negative_failures,
        negative_failures = negative_failures,
        conformance = { ok = conforms == true },
    }
    if not conforms then
        result.conformance.error = cerr and cerr.message or "refused"
    end
    result.ok = #examples >= 3 and #failures == 0 and #cases >= 2 and #negative_failures == 0 and conforms == true
    return result
end

local function handler()
    local res = http.response()
    res:set_content_type(http.CONTENT.JSON)

    if not security.can("mock.mappers.selftest", "mock.mappers:selftest") then
        res:set_status(http.STATUS.FORBIDDEN)
        res:write_json({ error = { code = "denied", message = "Only an administrator may run the mapper self-test" } })
        return
    end

    local mappers_found, merr = registry.find({ [".kind"] = "registry.entry", ["meta.type"] = "wippy.data.mapper" })
    local points_found, perr = registry.find({ [".kind"] = "registry.entry", ["meta.type"] = "wippy.dashboards.point" })
    if merr or perr then
        res:set_status(http.STATUS.INTERNAL_ERROR)
        res:write_json({ error = { code = "internal", message = "Cannot read the registry" } })
        return
    end

    local all_ok = true
    local mappers = {}
    for _, entry in ipairs(mappers_found) do
        local result = check_mapper(entry)
        all_ok = all_ok and result.ok
        mappers[#mappers + 1] = result
    end
    table.sort(mappers, function(a, b) return a.id < b.id end)

    local points = {}
    for _, entry in ipairs(points_found) do
        local meta = entry.meta
        if tostring(entry.id):sub(1, #DEMO_POINT_PREFIX) == DEMO_POINT_PREFIX and type(meta.source) == "string" then
            local ok, err = check_mappers.validate_point(entry)
            local result = { id = entry.id, ok = ok == true }
            if not ok then
                result.error = err and err.message or "refused"
            end
            all_ok = all_ok and result.ok
            points[#points + 1] = result
        end
    end
    table.sort(points, function(a, b) return a.id < b.id end)

    res:set_status(http.STATUS.OK)
    res:write_json({ ok = all_ok and #mappers > 0 and #points > 0, mappers = mappers, points = points })
end

return { handler = handler }
