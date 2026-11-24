-- demo.actor:resolve, the function every point of the mock actor names.
-- The engine calls it as the viewer with { args, point_id, point_meta }
-- (contracts section 5.1). It reads the point's recipe, calls the recipe's
-- source with the args, runs the recipe's Lua text through eval_runner with no
-- modules, and returns the result in the tile's format.
local registry = require("registry")
local runner = require("eval_runner")
local sources = require("sources")

local NAMESPACE = "demo.actor"

local function resolve(input)
    local meta = type(input) == "table" and input.point_meta or nil
    if type(meta) ~= "table" or type(meta.recipe) ~= "string" or meta.recipe == "" then
        return nil, "point declares no recipe"
    end

    local entry, rerr = registry.get(NAMESPACE .. ":recipe." .. meta.recipe)
    if rerr or not entry or type(entry.meta) ~= "table" or entry.meta.type ~= "demo.actor.recipe" then
        return nil, "unknown recipe " .. meta.recipe
    end
    local recipe = entry.meta
    local fetch = type(recipe.source) == "string" and sources[recipe.source] or nil
    if type(fetch) ~= "function" or type(recipe.lua) ~= "string" then
        return nil, "recipe " .. meta.recipe .. " is incomplete"
    end

    local args = input.args or {}
    local rows, serr = fetch(args)
    if not rows then
        return nil, serr
    end

    return runner.run({
        source = recipe.lua,
        modules = {},
        args = { { rows = rows, args = args } },
    })
end

return { resolve = resolve }
