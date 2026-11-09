return require("migration").define(function()
    migration("Create dash_pages table", function()
        database("sqlite", function()
            up(function(db)
                local _, err = db:execute([[
                    CREATE TABLE IF NOT EXISTS dash_pages (
                        page_id    TEXT PRIMARY KEY,
                        route      TEXT NOT NULL UNIQUE,
                        title      TEXT NOT NULL,
                        spec       TEXT NOT NULL,
                        revision   INTEGER NOT NULL,
                        published  INTEGER NOT NULL DEFAULT 1,
                        entry_id   TEXT NOT NULL,
                        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
                        updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
                    )
                ]])
                if err then error("Failed to create dash_pages: " .. err) end
            end)

            down(function(db)
                local _, err = db:execute("DROP TABLE IF EXISTS dash_pages")
                if err then error("Failed to drop dash_pages: " .. err) end
            end)
        end)
    end)
end)
