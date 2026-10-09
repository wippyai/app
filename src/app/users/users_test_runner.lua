local funcs = require("funcs")
local io = require("io")
local env = require("env")
local sql = require("sql")
local time = require("time")

local function wait_for_users_schema()
    local database, err = env.get("userspace.user.env:database_resource")
    if err or not database or database == "" then
        return false, err or "users database is not configured"
    end

    -- The bootloader applies migrations asynchronously on a fresh database.
    for attempt = 1, 120 do
        local db, db_err = sql.get(database)
        err = db_err
        if db then
            local _, query_err = db:query(
                "SELECT 1 FROM app_users u LEFT JOIN app_user_groups g ON g.user_id = u.user_id LIMIT 0"
            )
            db:release()
            if not query_err then
                return true
            end
            err = query_err
        end
        if attempt < 120 then
            time.sleep("250ms")
        end
    end
    return false, err or "users schema did not become ready"
end

local function main()
    local ready, readiness_err = wait_for_users_schema()
    if not ready then
        io.eprint("Users tests could not start: " .. tostring(readiness_err))
        return 1
    end

    local result, err = funcs.call("app.users:users_test", {})
    if err then
        io.eprint("Users tests could not run: " .. tostring(err))
        return 1
    end

    if not result or result.status ~= "ok"
        or type(result.total_tests) ~= "number" or result.total_tests <= 0
        or result.failed_tests ~= 0 or result.passed_tests ~= result.total_tests then
        io.eprint("Users tests failed or no cases ran: " .. tostring(result and result.failed_tests or "unknown"))
        return 1
    end

    io.print("Users tests passed: " .. tostring(result.passed_tests) .. "/" .. tostring(result.total_tests))
    return 0
end

return { main = main }
