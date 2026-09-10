local funcs = require("funcs")
local io = require("io")

local function main()
    local result, err = funcs.call("app.attention_e2e:generate_test", {})
    if err then
        io.eprint("Attention provider tests could not run: " .. tostring(err))
        return 1
    end

    if not result or result.status ~= "ok" then
        local failed = result and result.failed_tests or "unknown"
        io.eprint("Attention provider tests failed: " .. tostring(failed))
        return 1
    end

    io.print(
        "Attention provider tests passed: "
        .. tostring(result.passed_tests)
        .. "/"
        .. tostring(result.total_tests)
    )
    return 0
end

return { main = main }
