return require("migration").define(function()
    migration("Create dash_action_log table", function()
        database("sqlite", function()
            up(function(db)
                -- One row per action call, stored before the action runs (contracts section 10).
                -- The pair (viewer_id, key) is unique, so two calls with one key cannot both insert.
                local _, err = db:execute([[
                    CREATE TABLE IF NOT EXISTS dash_action_log (
                        "key"         TEXT NOT NULL,
                        viewer_id     TEXT NOT NULL,
                        page_id       TEXT NOT NULL,
                        revision      INTEGER NOT NULL,
                        action        TEXT NOT NULL,
                        args_hash     TEXT NOT NULL,
                        args_redacted TEXT NOT NULL,
                        state         TEXT NOT NULL,
                        result        TEXT,
                        created_at    INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
                        updated_at    INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
                        PRIMARY KEY (viewer_id, "key")
                    )
                ]])
                if err then error("Failed to create dash_action_log: " .. err) end
            end)

            down(function(db)
                local _, err = db:execute("DROP TABLE IF EXISTS dash_action_log")
                if err then error("Failed to drop dash_action_log: " .. err) end
            end)
        end)
    end)
end)
