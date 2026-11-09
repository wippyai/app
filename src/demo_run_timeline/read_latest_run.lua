-- demo.run_timeline:read_latest_run, the function of the point demo.run_timeline:latest_run.
-- The engine calls it as the viewer with { args, point_id, point_meta } (contracts section 5.1).
-- It reads the latest row of `dataflows` and the rows of `dataflow_nodes` of that run, and
-- returns { run = {...}, nodes = [ { type, status, duration_ms, children } ] } as the tile's
-- input schema describes. Top-level nodes keep their creation order.
local sql = require("sql")

local NODE_PREFIX = "userspace.dataflow.node."
local NODE_SUFFIX = ":node"

-- Durations come from the ISO 8601 timestamps the engine stores as text (nanosecond digits and an
-- offset, for example 2026-06-16T20:43:42.3955074+02:00). SQLite's julianday reads that form.
local DURATION_MS = "CAST(ROUND((julianday(%s.updated_at) - julianday(%s.created_at)) * 86400000) AS INTEGER)"

local RUN_SQL = [[
    SELECT d.dataflow_id, d.type, d.status, d.created_at,
           ]] .. DURATION_MS:format("d", "d") .. [[ AS duration_ms,
           (SELECT COUNT(*) FROM dataflow_commits c WHERE c.dataflow_id = d.dataflow_id) AS commits
    FROM dataflows d
    ORDER BY julianday(d.created_at) DESC, d.rowid DESC
    LIMIT 1
]]

local NODES_SQL = [[
    SELECT n.node_id, n.parent_node_id, n.type, n.status,
           ]] .. DURATION_MS:format("n", "n") .. [[ AS duration_ms
    FROM dataflow_nodes n
    WHERE n.dataflow_id = ?
    ORDER BY julianday(n.created_at), n.rowid
]]

-- "userspace.dataflow.node.agent:node" is shown as "agent". Other types ("tool.call") stay.
local function node_type(raw)
    local t = tostring(raw)
    if t:sub(1, #NODE_PREFIX) == NODE_PREFIX then
        t = t:sub(#NODE_PREFIX + 1)
    end
    if t:sub(-#NODE_SUFFIX) == NODE_SUFFIX then
        t = t:sub(1, -#NODE_SUFFIX - 1)
    end
    return t
end

-- "2026-06-16T20:43:42.3955074+02:00" becomes "2026-06-16T20:43:42+02:00".
local function whole_seconds(stamp)
    local trimmed = tostring(stamp):gsub("(%d%d:%d%d:%d%d)%.%d+", "%1")
    return trimmed
end

local function read_latest_run()
    local db, derr = sql.get("app:db")
    if derr then
        return nil, "database unavailable"
    end

    local runs, rerr = db:query(RUN_SQL, {})
    if rerr then
        db:release()
        return nil, "query failed: " .. tostring(rerr)
    end
    local r = runs[1]
    if not r then
        db:release()
        return nil, "no workflow run"
    end

    local rows, nerr = db:query(NODES_SQL, { r.dataflow_id })
    db:release()
    if nerr then
        return nil, "query failed: " .. tostring(nerr)
    end

    -- First pass: one table per node, in creation order. Second pass: attach each to its parent.
    -- A node whose parent is not in this run is treated as a top-level node.
    local by_id, nodes = {}, {}
    for _, row in ipairs(rows) do
        local node = {
            type = node_type(row.type),
            status = row.status,
            duration_ms = row.duration_ms,
            children = {},
        }
        by_id[row.node_id] = node
        nodes[#nodes + 1] = { row = row, node = node }
    end
    local roots = {}
    for _, item in ipairs(nodes) do
        local parent_id = item.row.parent_node_id
        local parent = type(parent_id) == "string" and by_id[parent_id] or nil
        if parent then
            parent.children[#parent.children + 1] = item.node
        else
            roots[#roots + 1] = item.node
        end
    end

    return {
        run = {
            type = r.type,
            status = r.status,
            started_at = whole_seconds(r.created_at),
            duration_ms = r.duration_ms,
            commits = r.commits,
        },
        nodes = roots,
    }
end

return { read_latest_run = read_latest_run }
