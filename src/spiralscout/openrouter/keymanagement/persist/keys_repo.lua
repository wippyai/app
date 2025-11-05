local sql = require("sql")
local time = require("time")
local hash = require("hash")

local keys_repo = {}

-- Constants for error handling
local ERROR = table.freeze({
    DB_CONNECTION_FAILED = "Database connection failed",
    DB_OPERATION_FAILED = "Database operation failed",
    MISSING_REQUIRED_FIELD = "Missing required field: ",
    KEY_NOT_FOUND = "OpenRouter key not found",
    KEY_ALREADY_EXISTS = "OpenRouter key already exists",
    INVALID_EMAIL = "Invalid email format",
    INVALID_CREDIT_LIMIT = "Invalid credit limit - must be non-negative number"
})

-- Get database connection
local function get_db()
    local db, err = sql.get("app:db")
    if err then
        return nil, ERROR.DB_CONNECTION_FAILED .. ": " .. err
    end
    return db
end

-- Validate email format
local function validate_email(email)
    if not email or email == "" then
        return false, ERROR.MISSING_REQUIRED_FIELD .. "email"
    end
    -- Basic email validation pattern
    local pattern = "^[%w._%%-]+@[%w._%%-]+%.%w+$"
    if not string.match(email, pattern) then
        return false, ERROR.INVALID_EMAIL
    end
    return true
end

-- Validate credit limit
local function validate_credit_limit(limit)
    if limit and (type(limit) ~= "number" or limit < 0) then
        return false, ERROR.INVALID_CREDIT_LIMIT
    end
    return true
end

-- Create new OpenRouter key record
function keys_repo.create(key_data)
    if not key_data.key_id or key_data.key_id == "" then
        return nil, ERROR.MISSING_REQUIRED_FIELD .. "key_id"
    end

    if not key_data.email or key_data.email == "" then
        return nil, ERROR.MISSING_REQUIRED_FIELD .. "email"
    end

    if not key_data.key_value or key_data.key_value == "" then
        return nil, ERROR.MISSING_REQUIRED_FIELD .. "key_value"
    end

    -- Validate email format
    local email_valid, email_err = validate_email(key_data.email)
    if not email_valid then
        return nil, email_err
    end

    -- Validate credit limit if provided
    local credit_valid, credit_err = validate_credit_limit(key_data.credit_limit)
    if not credit_valid then
        return nil, credit_err
    end

    local db, err = get_db()
    if err then
        return nil, err
    end

    -- Check if key already exists
    local check_query = sql.builder.select("id")
        :from("openrouter_keys")
        :where("key_id = ? OR email = ?", key_data.key_id, key_data.email)

    local check_executor = check_query:run_with(db)
    local existing_keys, err = check_executor:query()
    if err then
        db:release()
        return nil, ERROR.DB_OPERATION_FAILED .. ": " .. err
    end

    if #existing_keys > 0 then
        db:release()
        return nil, ERROR.KEY_ALREADY_EXISTS
    end

    local now = time.now():unix()

    local insert_query = sql.builder.insert("openrouter_keys")
        :set_map({
            key_id = key_data.key_id,
            email = key_data.email,
            key_value = key_data.key_value,
            credit_limit = key_data.credit_limit or 0.0,
            created_at = now,
            updated_at = now,
            is_active = key_data.is_active and 1 or 1 -- Default to active
        })

    local insert_executor = insert_query:run_with(db)
    local result, err = insert_executor:exec()
    db:release()

    if err then
        return nil, ERROR.DB_OPERATION_FAILED .. ": " .. err
    end

    return {
        id = result.last_insert_id,
        key_id = key_data.key_id,
        email = key_data.email,
        credit_limit = key_data.credit_limit or 0.0,
        is_active = true,
        created = true
    }
end

-- Get key by email
function keys_repo.get_by_email(email)
    if not email or email == "" then
        return nil, ERROR.MISSING_REQUIRED_FIELD .. "email"
    end

    local db, err = get_db()
    if err then
        return nil, err
    end

    local query = sql.builder.select("id", "key_id", "email", "key_value", "credit_limit", "created_at", "updated_at", "is_active")
        :from("openrouter_keys")
        :where("email = ?", email)
        :limit(1)

    local executor = query:run_with(db)
    local keys, err = executor:query()
    db:release()

    if err then
        return nil, ERROR.DB_OPERATION_FAILED .. ": " .. err
    end

    if #keys == 0 then
        return nil, ERROR.KEY_NOT_FOUND
    end

    local key = keys[1]
    key.is_active = key.is_active == 1
    return key
end

-- Get key by key_id
function keys_repo.get_by_key_id(key_id)
    if not key_id or key_id == "" then
        return nil, ERROR.MISSING_REQUIRED_FIELD .. "key_id"
    end

    local db, err = get_db()
    if err then
        return nil, err
    end

    local query = sql.builder.select("id", "key_id", "email", "key_value", "credit_limit", "created_at", "updated_at", "is_active")
        :from("openrouter_keys")
        :where("key_id = ?", key_id)
        :limit(1)

    local executor = query:run_with(db)
    local keys, err = executor:query()
    db:release()

    if err then
        return nil, ERROR.DB_OPERATION_FAILED .. ": " .. err
    end

    if #keys == 0 then
        return nil, ERROR.KEY_NOT_FOUND
    end

    local key = keys[1]
    key.is_active = key.is_active == 1
    return key
end

-- List all keys with optional filtering
function keys_repo.list_all(options)
    options = options or {}
    local limit = options.limit or 50
    local offset = options.offset or 0

    local db, err = get_db()
    if err then
        return nil, err
    end

    local query = sql.builder.select("id", "key_id", "email", "credit_limit", "created_at", "updated_at", "is_active")
        :from("openrouter_keys")
        :order_by("created_at DESC")
        :limit(limit)
        :offset(offset)

    -- Filter by active status if specified
    if options.is_active ~= nil then
        query = query:where("is_active = ?", options.is_active and 1 or 0)
    end

    local executor = query:run_with(db)
    local keys, err = executor:query()
    db:release()

    if err then
        return nil, ERROR.DB_OPERATION_FAILED .. ": " .. err
    end

    -- Convert is_active from integer to boolean
    for i, key in ipairs(keys) do
        key.is_active = key.is_active == 1
        -- Remove sensitive key_value from list response
        key.key_value = nil
    end

    return keys
end

-- Update credit limit for a key
function keys_repo.update_limit(key_id, credit_limit)
    if not key_id or key_id == "" then
        return nil, ERROR.MISSING_REQUIRED_FIELD .. "key_id"
    end

    if not credit_limit then
        return nil, ERROR.MISSING_REQUIRED_FIELD .. "credit_limit"
    end

    local credit_valid, credit_err = validate_credit_limit(credit_limit)
    if not credit_valid then
        return nil, credit_err
    end

    local db, err = get_db()
    if err then
        return nil, err
    end

    local query = sql.builder.update("openrouter_keys")
        :where("key_id = ?", key_id)
        :set("credit_limit", credit_limit)
        :set("updated_at", time.now():unix())

    local executor = query:run_with(db)
    local result, err = executor:exec()
    db:release()

    if err then
        return nil, ERROR.DB_OPERATION_FAILED .. ": " .. err
    end

    if result.rows_affected == 0 then
        return nil, ERROR.KEY_NOT_FOUND
    end

    return {
        key_id = key_id,
        credit_limit = credit_limit,
        updated = true,
        rows_affected = result.rows_affected
    }
end

-- Delete a key (soft delete by setting is_active to false)
function keys_repo.delete(key_id)
    if not key_id or key_id == "" then
        return nil, ERROR.MISSING_REQUIRED_FIELD .. "key_id"
    end

    local db, err = get_db()
    if err then
        return nil, err
    end

    local query = sql.builder.update("openrouter_keys")
        :where("key_id = ?", key_id)
        :set("is_active", 0)
        :set("updated_at", time.now():unix())

    local executor = query:run_with(db)
    local result, err = executor:exec()
    db:release()

    if err then
        return nil, ERROR.DB_OPERATION_FAILED .. ": " .. err
    end

    if result.rows_affected == 0 then
        return nil, ERROR.KEY_NOT_FOUND
    end

    return {
        key_id = key_id,
        deleted = true,
        rows_affected = result.rows_affected
    }
end

-- Hard delete a key (permanently remove from database)
function keys_repo.hard_delete(key_id)
    if not key_id or key_id == "" then
        return nil, ERROR.MISSING_REQUIRED_FIELD .. "key_id"
    end

    local db, err = get_db()
    if err then
        return nil, err
    end

    local query = sql.builder.delete("openrouter_keys")
        :where("key_id = ?", key_id)

    local executor = query:run_with(db)
    local result, err = executor:exec()
    db:release()

    if err then
        return nil, ERROR.DB_OPERATION_FAILED .. ": " .. err
    end

    if result.rows_affected == 0 then
        return nil, ERROR.KEY_NOT_FOUND
    end

    return {
        key_id = key_id,
        permanently_deleted = true,
        rows_affected = result.rows_affected
    }
end

-- Get count of keys with optional filtering
function keys_repo.count(options)
    options = options or {}

    local db, err = get_db()
    if err then
        return nil, err
    end

    local query = sql.builder.select("COUNT(*) as count")
        :from("openrouter_keys")

    -- Filter by active status if specified
    if options.is_active ~= nil then
        query = query:where("is_active = ?", options.is_active and 1 or 0)
    end

    local executor = query:run_with(db)
    local result, err = executor:query()
    db:release()

    if err then
        return nil, ERROR.DB_OPERATION_FAILED .. ": " .. err
    end

    return result[1].count
end

-- Set disabled status for a key
function keys_repo.set_disabled(key_id, disabled)
    if not key_id or key_id == "" then
        return nil, ERROR.MISSING_REQUIRED_FIELD .. "key_id"
    end

    if type(disabled) ~= "boolean" then
        return nil, "Disabled parameter must be boolean"
    end

    local db, err = get_db()
    if err then
        return nil, err
    end

    local query = sql.builder.update("openrouter_keys")
        :where("key_id = ?", key_id)
        :set("is_disabled", disabled and 1 or 0)
        :set("updated_at", time.now():unix())

    local executor = query:run_with(db)
    local result, err = executor:exec()
    db:release()

    if err then
        return nil, ERROR.DB_OPERATION_FAILED .. ": " .. err
    end

    if result.rows_affected == 0 then
        return nil, ERROR.KEY_NOT_FOUND
    end

    return {
        key_id = key_id,
        disabled = disabled,
        updated = true,
        rows_affected = result.rows_affected
    }
end

return keys_repo
