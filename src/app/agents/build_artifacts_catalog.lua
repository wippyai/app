-- build_artifacts_catalog
--
-- Build-time prompt contributor for the wippy_artifacts_trait. Reads the live
-- view.component registry, projects each announced + auto-registered entry
-- through bundled_meta (YAML-first → bundled wippy-meta.json fallback), and
-- emits a Markdown catalog appended to the agent's system prompt.
--
-- The catalog is the source-of-truth the agent's prompt references when it
-- says "Pick tag_name from the available components list in the session
-- context". Without this build_func wired in, the trait prompt is aspirational
-- — there's no list anywhere for the LLM to pick from.
--
-- Runs ONCE per agent compile (cheap). The component registry is YAML-loaded
-- at boot and bundled meta is fetched on first access (cached process-wide
-- via http_client), so we accept one batch of HTTP round-trips at compile
-- time in exchange for a hot agent runtime with zero per-step work.

local json = require("json")

local function format_schema(schema: any?): string
    if not schema or type(schema) ~= "table" then
        return ""
    end
    local encoded, err = json.encode(schema)
    if err or not encoded or encoded == "" or encoded == "null" then
        return ""
    end
    return encoded
end

local function execute(_base_prompt: string?, _ctx: any?): any
    -- Resolve dependencies via imports declared on this function entry.
    local component_registry = require("component_registry")
    local bundled_meta = require("bundled_meta")

    local components, err = component_registry.find_all()
    if err or not components then
        -- Don't fail the agent compile on a registry hiccup — emit a stub
        -- prompt so the LLM at least knows the catalog is unavailable.
        return {
            prompt = "Available components: (registry query failed; CreateArtifact's component mode is unavailable this session)"
        }
    end

    local lines = {}
    table.insert(lines, "## Available web components for CreateArtifact (component mode)")
    table.insert(lines, "")
    table.insert(lines, "Pick `tag_name` from the list below when calling CreateArtifact in component mode. " ..
        "Use the `props` schema to construct the props object. The list is rebuilt on every agent compile " ..
        "from the live view.component registry — never invent tag names not listed here.")
    table.insert(lines, "")

    local rendered = 0
    for _, component in ipairs(components) do
        -- Skip `secure` components: the agent compiler runs without an actor
        -- scope, so a `secure: true` component would otherwise leak into the
        -- agent's system prompt for every actor regardless of permissions.
        -- announced+auto_register limits the catalog to components actually
        -- usable from a tag_name reference at runtime.
        if component.announced and component.auto_register and not component.secure then
            -- Reuse the same projection /components/list serves so the catalog
            -- matches what the API returns. YAML-first per field; bundled
            -- wippy-meta.json fills gaps.
            local meta, _meta_err = bundled_meta.fetch_for_component(component)
            local base_url = component_registry.resolve_base_url(component)
            local projected = bundled_meta.project_component_response(meta, component, base_url)

            local tag = projected.tag_name
            -- Skip entries that don't resolve a tag_name from either YAML or
            -- bundled meta — they can't be invoked via tag_name anyway.
            if tag and tag ~= "" then
                rendered = rendered + 1
                table.insert(lines, "### " .. tag)
                if projected.title and projected.title ~= "" then
                    table.insert(lines, "**" .. projected.title .. "**")
                end
                if projected.description and projected.description ~= "" then
                    table.insert(lines, projected.description)
                end
                local props_str = format_schema(projected.props)
                if props_str ~= "" then
                    table.insert(lines, "")
                    table.insert(lines, "Props schema:")
                    table.insert(lines, "```json")
                    table.insert(lines, props_str)
                    table.insert(lines, "```")
                end
                local events_str = format_schema(projected.events)
                if events_str ~= "" then
                    table.insert(lines, "")
                    table.insert(lines, "Events schema:")
                    table.insert(lines, "```json")
                    table.insert(lines, events_str)
                    table.insert(lines, "```")
                end
                table.insert(lines, "")
            end
        end
    end

    if rendered == 0 then
        return {
            prompt = "Available components: (none registered — CreateArtifact's component mode is unavailable this session)"
        }
    end

    return {
        prompt = table.concat(lines, "\n")
    }
end

return { execute = execute }
