local test = require("test")
local env = require("env")
local sql = require("sql")
local time = require("time")
local user_repo = require("user_repo")
local user_groups_repo = require("user_groups_repo")

local TEST_USER_ID = "test_user_" .. tostring(os.time())
local TEST_EMAIL = TEST_USER_ID .. "@test.local"

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

local function define_tests()
    test.describe("user management", function()
        test.before_all(function()
            local ready, err = wait_for_users_schema()
            if not ready then
                error("Users tests could not start: " .. tostring(err))
            end
        end)

        test.describe("create", function()
            test.it("creates a user with valid data", function()
                local result, err = user_repo.create({
                    user_id = TEST_USER_ID,
                    email = TEST_EMAIL,
                    full_name = "Test User",
                    password = "testpass123",
                    status = "active",
                })
                test.is_nil(err)
                test.not_nil(result)
            end)

            test.it("rejects duplicate email", function()
                local result, err = user_repo.create({
                    user_id = TEST_USER_ID .. "_dup",
                    email = TEST_EMAIL,
                    full_name = "Duplicate",
                    password = "testpass123",
                    status = "active",
                })
                test.is_nil(result)
                test.not_nil(err)
            end)

            test.it("rejects empty email", function()
                local result, err = user_repo.create({
                    user_id = "no_email_user",
                    email = "",
                    full_name = "No Email",
                    password = "testpass123",
                    status = "active",
                })
                test.is_nil(result)
                test.not_nil(err)
            end)

            test.it("rejects short password", function()
                local result, err = user_repo.create({
                    user_id = "short_pass_user",
                    email = "short@test.local",
                    full_name = "Short Pass",
                    password = "abc",
                    status = "active",
                })
                test.is_nil(result)
                test.not_nil(err)
            end)
        end)

        test.describe("get", function()
            test.it("retrieves existing user by id", function()
                local user, err = user_repo.get(TEST_USER_ID)
                test.is_nil(err)
                test.not_nil(user)
                test.eq(user.user_id, TEST_USER_ID)
                test.eq(user.email, TEST_EMAIL)
                test.eq(user.full_name, "Test User")
                test.eq(user.status, "active")
            end)

            test.it("returns error for non-existent user", function()
                local user, err = user_repo.get("nonexistent_user_xyz")
                test.is_nil(user)
                test.not_nil(err)
            end)
        end)

        test.describe("list", function()
            test.it("returns all users", function()
                local users, err = user_repo.list()
                test.is_nil(err)
                test.not_nil(users)
                test.ok(#users >= 1)
            end)

            test.it("includes the test user", function()
                local users, err = user_repo.list()
                test.is_nil(err)
                local found = false
                for _, u in ipairs(users) do
                    if u.user_id == TEST_USER_ID then
                        found = true
                        break
                    end
                end
                test.is_true(found)
            end)
        end)

        test.describe("verify_password", function()
            test.it("verifies correct password", function()
                local valid, user = user_repo.verify_password(TEST_USER_ID, "testpass123")
                test.is_true(valid)
                test.not_nil(user)
            end)

            test.it("rejects wrong password", function()
                local valid, err = user_repo.verify_password(TEST_USER_ID, "wrongpass")
                test.is_false(valid)
            end)
        end)

        test.describe("update", function()
            test.it("updates full name", function()
                local result, err = user_repo.update(TEST_USER_ID, { full_name = "Updated Name" })
                test.is_nil(err)
                test.not_nil(result)

                local user, err = user_repo.get(TEST_USER_ID)
                test.is_nil(err)
                test.eq(user.full_name, "Updated Name")
            end)

            test.it("updates status", function()
                local result, err = user_repo.update(TEST_USER_ID, { status = "suspended" })
                test.is_nil(err)
                test.not_nil(result)

                local user, err = user_repo.get(TEST_USER_ID)
                test.is_nil(err)
                test.eq(user.status, "suspended")
            end)

            test.it("updates password", function()
                local result, err = user_repo.update(TEST_USER_ID, { password = "newpass12345" })
                test.is_nil(err)
                test.not_nil(result)

                local valid, user = user_repo.verify_password(TEST_USER_ID, "newpass12345")
                test.is_true(valid)
                test.not_nil(user)
            end)

            test.it("rejects update with no data", function()
                local result, err = user_repo.update(TEST_USER_ID, {})
                test.is_nil(result)
                test.not_nil(err)
            end)
        end)

        test.describe("security groups", function()
            test.it("assigns user to a group", function()
                local result, err = user_groups_repo.assign_user_to_group(TEST_USER_ID, "app.security:user")
                test.is_nil(err)
                test.not_nil(result)
            end)

            test.it("retrieves user groups", function()
                local result, err = user_groups_repo.get_user_groups(TEST_USER_ID)
                test.is_nil(err)
                test.not_nil(result)
                test.not_nil(result.groups)
                test.ok(#result.groups >= 1)

                local found = false
                for _, g in ipairs(result.groups) do
                    if g == "app.security:user" then
                        found = true
                        break
                    end
                end
                test.is_true(found)
            end)

            test.it("sets user groups replacing existing", function()
                local result, err = user_groups_repo.set_user_groups(TEST_USER_ID, {
                    "app.security:admin",
                    "app.security:user",
                })
                test.is_nil(err)
                test.not_nil(result)
                test.eq(result.groups_added, 2)

                local check, err = user_groups_repo.get_user_groups(TEST_USER_ID)
                test.is_nil(err)
                test.eq(#check.groups, 2)
            end)

            test.it("removes user from a group", function()
                local result, err = user_groups_repo.remove_user_from_group(TEST_USER_ID, "app.security:admin")
                test.is_nil(err)
                test.not_nil(result)
                test.is_true(result.removed)

                local check, err = user_groups_repo.get_user_groups(TEST_USER_ID)
                test.is_nil(err)
                test.eq(#check.groups, 1)
                test.eq(check.groups[1], "app.security:user")
            end)

            test.it("removes all user groups", function()
                local result, err = user_groups_repo.remove_all_user_groups(TEST_USER_ID)
                test.is_nil(err)
                test.not_nil(result)

                local check, err = user_groups_repo.get_user_groups(TEST_USER_ID)
                test.is_nil(err)
                test.eq(#check.groups, 0)
            end)
        end)

        test.describe("delete", function()
            test.it("deletes existing user", function()
                local result, err = user_repo.delete(TEST_USER_ID)
                test.is_nil(err)
                test.not_nil(result)
            end)

            test.it("user no longer exists after delete", function()
                local user, err = user_repo.get(TEST_USER_ID)
                test.is_nil(user)
                test.not_nil(err)
            end)
        end)
    end)
end

local run_cases = test.run_cases(define_tests)

local function run(options)
    return run_cases(options)
end

return { run = run }
