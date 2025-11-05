return require("migration").define(function()
    migration("Create OpenRouter keys table", function()
        database("sqlite", function()
            up(function(db)
                -- Create openrouter_keys table
                local success, err = db:execute([[
                    CREATE TABLE openrouter_keys (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        key_id TEXT NOT NULL UNIQUE,
                        email TEXT NOT NULL,
                        key_value TEXT NOT NULL,
                        credit_limit REAL DEFAULT 0.0,
                        created_at INTEGER NOT NULL,
                        updated_at INTEGER NOT NULL,
                        is_active INTEGER NOT NULL DEFAULT 1
                    )
                ]])
                if err then error(err) end

                -- Create indexes for better query performance
                success, err = db:execute("CREATE INDEX idx_openrouter_keys_email ON openrouter_keys(email)")
                if err then error(err) end

                success, err = db:execute("CREATE INDEX idx_openrouter_keys_key_id ON openrouter_keys(key_id)")
                if err then error(err) end

                success, err = db:execute("CREATE INDEX idx_openrouter_keys_active ON openrouter_keys(is_active)")
                if err then error(err) end

                success, err = db:execute("CREATE INDEX idx_openrouter_keys_created_at ON openrouter_keys(created_at DESC)")
                if err then error(err) end
            end)

            down(function(db)
                -- Drop indexes first
                local success, err = db:execute("DROP INDEX IF EXISTS idx_openrouter_keys_created_at")
                if err then error(err) end

                success, err = db:execute("DROP INDEX IF EXISTS idx_openrouter_keys_active")
                if err then error(err) end

                success, err = db:execute("DROP INDEX IF EXISTS idx_openrouter_keys_key_id")
                if err then error(err) end

                success, err = db:execute("DROP INDEX IF EXISTS idx_openrouter_keys_email")
                if err then error(err) end

                -- Drop table
                success, err = db:execute("DROP TABLE IF EXISTS openrouter_keys")
                if err then error(err) end
            end)
        end)
    end)
end)
