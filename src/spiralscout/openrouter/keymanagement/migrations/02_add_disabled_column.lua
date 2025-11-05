return require("migration").define(function()
    migration("Add is_disabled column to OpenRouter keys table", function()
        database("sqlite", function()
            up(function(db)
                local success, err = db:execute([[
                    ALTER TABLE openrouter_keys
                    ADD COLUMN is_disabled INTEGER NOT NULL DEFAULT 0
                ]])
                if err then error(err) end

                success, err = db:execute("CREATE INDEX idx_openrouter_keys_disabled ON openrouter_keys(is_disabled)")
                if err then error(err) end
            end)

            down(function(db)
                local success, err = db:execute("DROP INDEX IF EXISTS idx_openrouter_keys_disabled")
                if err then error(err) end

                success, err = db:execute([[
                    CREATE TABLE openrouter_keys_temp AS
                    SELECT id, key_id, email, key_value, credit_limit, created_at, updated_at, is_active
                    FROM openrouter_keys
                ]])
                if err then error(err) end

                success, err = db:execute("DROP TABLE openrouter_keys")
                if err then error(err) end

                success, err = db:execute("ALTER TABLE openrouter_keys_temp RENAME TO openrouter_keys")
                if err then error(err) end
            end)
        end)
    end)
end)
