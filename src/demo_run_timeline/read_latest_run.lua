-- demo.run_timeline:read_latest_run, the function of the point demo.run_timeline:latest_run.
-- The engine calls it as the viewer with { args, point_id, point_meta } (contracts section 5.1).
-- It reads the latest row of `dataflows` and the rows of `dataflow_nodes` of that run, and
-- returns { run = {...}, nodes = [ { type, status, duration_ms, children } ] } as the tile's
-- input schema describes. Top-level nodes keep their creation order.
local database = require("database")
local time = require("time")

local NODE_PREFIX = "userspace.dataflow.node."
local NODE_SUFFIX = ":node"

-- The same SQL runs on SQLite and on PostgreSQL (the database seam of wippy/dashboards). The
-- timestamps are read as text: SQLite stores ISO 8601 text with nanosecond digits and an offset (for
-- example 2026-06-16T20:43:42.3955074+02:00), PostgreSQL a timestamp that casts to
-- "2026-06-16 20:43:42.395507". duration() reads both. The ids are cast to text because PostgreSQL
-- keeps them as uuid.
-- Order: by the instant of the creation time (database.instant: SQLite reads the offset of the stored text,
-- as RC1 did with julianday; PostgreSQL sorts the timestamp), and for equal instants by insertion order on
-- SQLite (rowid) and by id on PostgreSQL, which keeps no insertion order (database.tie_order).
local function run_sql(db)
    return [[
    SELECT CAST(d.dataflow_id AS TEXT) AS dataflow_id, d.type, d.status,
           CAST(d.created_at AS TEXT) AS created_at, CAST(d.updated_at AS TEXT) AS updated_at,
           (SELECT COUNT(*) FROM dataflow_commits c WHERE c.dataflow_id = d.dataflow_id) AS commits
    FROM dataflows d
    ORDER BY ]] .. database.instant(db, "d.created_at") .. " DESC, " .. database.tie_order(db, "d", "dataflow_id") .. [[ DESC
    LIMIT 1
]]
end

local function nodes_sql(db)
    return [[
    SELECT CAST(n.node_id AS TEXT) AS node_id, CAST(n.parent_node_id AS TEXT) AS parent_node_id, n.type, n.status,
           CAST(n.created_at AS TEXT) AS created_at, CAST(n.updated_at AS TEXT) AS updated_at
    FROM dataflow_nodes n
    WHERE CAST(n.dataflow_id AS TEXT) = ?
    ORDER BY ]] .. database.instant(db, "n.created_at") .. ", " .. database.tie_order(db, "n", "node_id")
end

-- A stored timestamp as RFC 3339: a space between date and time becomes T, and a time with no
-- zone is UTC.
local function rfc3339(stamp)
    local text = tostring(stamp):gsub("^(%d%d%d%d%-%d%d%-%d%d) ", "%1T")
    if not (text:find("[Zz]$") or text:find("[+-]%d%d:%d%d$")) then
        text = text .. "Z"
    end
    return text
end

-- The milliseconds between two stored timestamps, or nil when one of them does not parse.
local function duration(from, to)
    local a = time.parse(time.RFC3339NANO, rfc3339(from))
    local b = time.parse(time.RFC3339NANO, rfc3339(to))
    if not a or not b then
        return nil
    end
    return math.floor(b:sub(a):milliseconds() + 0.5)
end

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
    local trimmed = rfc3339(stamp):gsub("(%d%d:%d%d:%d%d)%.%d+", "%1")
    return trimmed
end

local function read_latest_run()
    local db, derr = database.open("app:db")
    if derr then
        return nil, "database unavailable"
    end

    local runs, rerr = db:query(run_sql(db), {})
    if rerr then
        db:release()
        return nil, "query failed: " .. tostring(rerr)
    end
    local r = runs[1]
    if not r then
        db:release()
        return nil, "no workflow run"
    end

    local rows, nerr = db:query(nodes_sql(db), { r.dataflow_id })
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
            duration_ms = duration(row.created_at, row.updated_at),
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
            duration_ms = duration(r.created_at, r.updated_at),
            commits = r.commits,
        },
        nodes = roots,
    }
end

return { read_latest_run = read_latest_run }
