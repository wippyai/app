-- The action log of the dashboards engine (contracts section 10). One row per action
-- call, stored before the action runs. It is the idempotency record and the audit
-- record. The pair (viewer_id, key) is unique, and begin() acts on the insert result,
-- so two calls with one key can never both run.
local json = require("json")
local hash = require("hash")

local M = {}

M.STATE_RUNNING = "running"
M.STATE_DONE = "done"
M.STATE_FAILED = "failed"

-- Deepest table nesting that action arguments may have. The top-level args table is
-- level 1. The endpoint refuses deeper arguments before it hashes or stores them, so
-- the hash and the redacted copy always see the whole value.
M.MAX_DEPTH = 8

local function within(value, depth)
    if type(value) ~= "table" then
        return true
    end
    if depth > M.MAX_DEPTH then
        return false
    end
    for _, v in pairs(value) do
        if not within(v, depth + 1) then
            return false
        end
    end
    return true
end

-- True when no table in the value is nested deeper than MAX_DEPTH.
function M.within_depth(value)
    return within(value, 1)
end

-- A Lua table that decodes from a JSON array: keys 1..n and nothing else.
local function is_array(t)
    local n = 0
    for k in pairs(t) do
        if type(k) ~= "number" or k < 1 or k % 1 ~= 0 then
            return false
        end
        n = n + 1
    end
    for i = 1, n do
        if t[i] == nil then
            return false
        end
    end
    return n > 0
end

-- Canonical text of a JSON value: object keys sorted, no spaces. The same
-- values always give the same text, whatever the key order of the request was.
-- Values deeper than MAX_DEPTH are an error, never a shortened text: two calls that
-- differ only below a cut would get one hash.
local function canonical(value, depth)
    local t = type(value)
    if t == "table" then
        if depth > M.MAX_DEPTH then
            error("dashboards: action arguments are nested deeper than " .. M.MAX_DEPTH)
        end
        local parts = {}
        if is_array(value) then
            for i = 1, #value do
                parts[i] = canonical(value[i], depth + 1)
            end
            return "[" .. table.concat(parts, ",") .. "]"
        end
        local keys = {}
        for k in pairs(value) do
            keys[#keys + 1] = tostring(k)
        end
        table.sort(keys)
        for i, k in ipairs(keys) do
            parts[i] = string.format("%q", k) .. ":" .. canonical(value[k], depth + 1)
        end
        return "{" .. table.concat(parts, ",") .. "}"
    elseif t == "string" then
        return string.format("%q", value)
    elseif t == "number" then
        return string.format("%.17g", value)
    elseif t == "boolean" then
        return tostring(value)
    end
    return "null"
end

M.canonical = canonical

-- Hash of the call: page, action and the merged arguments. A retry with the same
-- key must repeat all three, or it is a conflict.
function M.args_hash(page_id, action, args)
    local text = page_id .. "\n" .. action .. "\n" .. canonical(args, 1)
    local hex = hash.sha256(text)
    return hex
end

local function strip(value, drop, depth)
    if type(value) ~= "table" then
        return value
    end
    if depth > M.MAX_DEPTH then
        return nil
    end
    local out = {}
    for k, v in pairs(value) do
        if not (type(k) == "string" and drop[k]) then
            out[k] = strip(v, drop, depth + 1)
        end
    end
    return out
end

-- Copy of the arguments without the fields the declaration marks as sensitive. A field
-- with a sensitive name is removed at every level, inside nested objects and inside
-- objects in arrays.
function M.redact(args, sensitive_fields)
    local drop = {}
    for _, name in ipairs(sensitive_fields or {}) do
        drop[name] = true
    end
    return strip(args, drop, 1) or {}
end

-- Encodes a table that may be empty (an empty Lua table would encode as []).
function M.encode_object(t)
    if next(t) == nil then
        return "{}"
    end
    local text, err = json.encode(t)
    if err or type(text) ~= "string" then
        return nil, err or "cannot encode"
    end
    return text
end

-- Stores the record in state 'running'. Returns true when this call inserted it
-- (and may run the action), false when a row with the pair (viewer_id, key)
-- already exists, or nil plus an error.
function M.begin(db, rec)
    local redacted, rerr = M.encode_object(rec.args_redacted)
    if not redacted then
        return nil, rerr
    end
    local result, err = db:execute([[
        INSERT INTO dash_action_log ("key", viewer_id, page_id, revision, action, args_hash, args_redacted, state)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'running')
        ON CONFLICT (viewer_id, "key") DO NOTHING
    ]], { rec.key, rec.viewer_id, rec.page_id, rec.revision, rec.action, rec.args_hash, redacted })
    if err then
        return nil, err
    end
    return result.rows_affected == 1
end

-- The stored row of (viewer_id, key), or nil when there is none.
function M.find(db, viewer_id, key)
    local rows, err = db:query([[
        SELECT "key", viewer_id, page_id, revision, action, args_hash, state, result
        FROM dash_action_log WHERE viewer_id = ? AND "key" = ?
    ]], { viewer_id, key })
    if err then
        return nil, err
    end
    return rows and rows[1] or nil
end

-- Stores the end state and the result of a row that is still 'running'.
function M.finish(db, viewer_id, key, state, result)
    local text, eerr = M.encode_object(result)
    if not text then
        return nil, eerr
    end
    local _, err = db:execute([[
        UPDATE dash_action_log
        SET state = ?, result = ?, updated_at = strftime('%s', 'now')
        WHERE viewer_id = ? AND "key" = ? AND state = 'running'
    ]], { state, text, viewer_id, key })
    if err then
        return nil, err
    end
    return true
end

return M
