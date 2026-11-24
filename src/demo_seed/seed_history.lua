-- POST /api/v1/demo/seed-history fills only the history missing from the browser fixtures.
local http = require("http")
local security = require("security")
local database = require("database")

local function fail(res, status, code, message)
    res:set_status(status)
    res:write_json({ error = { code = code, message = message } })
end

local function statements(user_id)
    return {
        -- Add another day before the selected-day rows, only when usage holds no rows but this seed's own,
        -- so a point that ignores the selected day shows a different total. Real history is never touched.
        {
            table = "token_usage",
            text = [[
                INSERT INTO token_usage
                    (usage_id, user_id, model_id, prompt_tokens, completion_tokens, timestamp)
                SELECT 'demo.dashboard.sonnet.2026-08-30', ?, 'claude-sonnet-4-6', 60, 40, '2026-08-30T10:00:00Z'
                WHERE NOT EXISTS (SELECT 1 FROM token_usage WHERE usage_id NOT LIKE 'demo.dashboard.%')
                ON CONFLICT (usage_id) DO NOTHING
            ]],
            params = { user_id },
        },
        -- dashboards.spec.ts selects both models and clicks this day. Keep existing positive calls.
        {
            table = "token_usage",
            text = [[
                INSERT INTO token_usage
                    (usage_id, user_id, model_id, prompt_tokens, completion_tokens, timestamp)
                SELECT 'demo.dashboard.haiku.2026-08-31', ?, 'claude-haiku-4-5', 120, 80, '2026-08-31T10:00:00Z'
                WHERE NOT EXISTS (
                    SELECT 1 FROM token_usage WHERE model_id = 'claude-haiku-4-5'
                    AND substr(CAST(timestamp AS TEXT), 1, 10) = '2026-08-31'
                    AND prompt_tokens + completion_tokens > 0
                )
                ON CONFLICT (usage_id) DO NOTHING
            ]],
            params = { user_id },
        },
        {
            table = "token_usage",
            text = [[
                INSERT INTO token_usage
                    (usage_id, user_id, model_id, prompt_tokens, completion_tokens, timestamp)
                SELECT 'demo.dashboard.sonnet.2026-08-31', ?, 'claude-sonnet-4-6', 300, 200, '2026-08-31T10:01:00Z'
                WHERE NOT EXISTS (
                    SELECT 1 FROM token_usage WHERE model_id = 'claude-sonnet-4-6'
                    AND substr(CAST(timestamp AS TEXT), 1, 10) = '2026-08-31'
                    AND prompt_tokens + completion_tokens > 0
                )
                ON CONFLICT (usage_id) DO NOTHING
            ]],
            params = { user_id },
        },
        -- The App activity checks need nonempty month and message-type groups. Reuse a valid session.
        {
            table = "contexts",
            text = [[
                INSERT INTO contexts (context_id, type)
                SELECT 'e2e00000-0000-4000-8000-000000000001', 'session'
                WHERE NOT EXISTS (
                    SELECT 1 FROM sessions s JOIN contexts c ON c.context_id = s.primary_context_id
                )
                ON CONFLICT (context_id) DO NOTHING
            ]],
            params = {},
        },
        {
            table = "sessions",
            text = [[
                INSERT INTO sessions
                    (session_id, user_id, primary_context_id, title, start_date, last_message_date)
                SELECT 'e2e00000-0000-4000-8000-000000000002', ?,
                    'e2e00000-0000-4000-8000-000000000001', 'Dashboard regression history',
                    '2026-08-31T10:00:00Z', '2026-08-31T10:00:01Z'
                WHERE NOT EXISTS (
                    SELECT 1 FROM sessions s JOIN contexts c ON c.context_id = s.primary_context_id
                )
                ON CONFLICT (session_id) DO NOTHING
            ]],
            params = { user_id },
        },
        {
            table = "messages",
            text = [[
                INSERT INTO messages (message_id, session_id, date, type, data)
                SELECT 'e2e00000-0000-4000-8000-000000000003', s.session_id,
                    '2026-08-31T10:00:01Z', 'user', 'Dashboard regression history.'
                FROM sessions s JOIN contexts c ON c.context_id = s.primary_context_id
                WHERE NOT EXISTS (
                    SELECT 1 FROM messages m JOIN sessions ms ON ms.session_id = m.session_id
                    JOIN contexts mc ON mc.context_id = ms.primary_context_id
                )
                ORDER BY s.session_id LIMIT 1
                ON CONFLICT (message_id) DO NOTHING
            ]],
            params = {},
        },
        -- The run timeline reads the latest run. Add a completed run only when no run exists.
        {
            table = "dataflows",
            text = [[
                INSERT INTO dataflows (dataflow_id, actor_id, type, status, created_at, updated_at)
                SELECT 'e2e00000-0000-4000-8000-000000000004', ?, 'dataflow', 'completed',
                    '2026-08-31T10:00:00Z', '2026-08-31T10:00:01Z'
                WHERE NOT EXISTS (SELECT 1 FROM dataflows)
                ON CONFLICT (dataflow_id) DO NOTHING
            ]],
            params = { user_id },
        },
        {
            table = "dataflow_nodes",
            text = [[
                INSERT INTO dataflow_nodes (node_id, dataflow_id, type, status, created_at, updated_at)
                SELECT 'e2e00000-0000-4000-8000-000000000005', d.dataflow_id, 'step', 'completed',
                    '2026-08-31T10:00:00Z', '2026-08-31T10:00:01Z'
                FROM dataflows d
                WHERE d.dataflow_id = 'e2e00000-0000-4000-8000-000000000004'
                AND NOT EXISTS (SELECT 1 FROM dataflow_nodes n WHERE n.dataflow_id = d.dataflow_id)
                ON CONFLICT (node_id) DO NOTHING
            ]],
            params = {},
        },
    }
end

local function handler()
    local res = http.response()
    res:set_content_type(http.CONTENT.JSON)

    if not security.can("demo.seed_history", "demo.seed:history") then
        return fail(res, http.STATUS.FORBIDDEN, "denied", "Admin only")
    end
    local actor = security.actor()
    if not actor then
        return fail(res, http.STATUS.FORBIDDEN, "denied", "Admin only")
    end

    local db, open_err = database.open("app:db")
    if open_err then
        return fail(res, http.STATUS.INTERNAL_ERROR, "seed_failed", "Database unavailable")
    end
    local tx, begin_err = db:begin()
    if begin_err then
        db:release()
        return fail(res, http.STATUS.INTERNAL_ERROR, "seed_failed", "Could not begin history seed")
    end

    local inserted = {}
    for _, statement in ipairs(statements(actor:id())) do
        local result, err = tx:execute(statement.text, statement.params)
        if err then
            tx:rollback()
            db:release()
            return fail(res, http.STATUS.INTERNAL_ERROR, "seed_failed", "Could not seed " .. statement.table)
        end
        inserted[statement.table] = (inserted[statement.table] or 0) + result.rows_affected
    end
    local _, commit_err = tx:commit()
    if commit_err then
        tx:rollback()
        db:release()
        return fail(res, http.STATUS.INTERNAL_ERROR, "seed_failed", "Could not commit history seed")
    end
    db:release()

    res:set_status(http.STATUS.OK)
    res:write_json({ inserted = inserted })
end

return { handler = handler }
