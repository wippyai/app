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
    local page_registry = require("page_registry")

    local components, err = component_registry.find_all()
    if err or not components then
        return {
            prompt = "Available components: (registry query failed; CreateArtifact's component mode is unavailable this session)"
        }
    end

    local lines = {}

    -- ── Section 1: Auto-registered components (component tag mode) ──────────
    -- These can be invoked by tag_name alone. The agent can also write the tag
    -- directly in reply text as an inline shortcut (no CreateArtifact needed).
    table.insert(lines, "## Auto-registered components (component tag mode)")
    table.insert(lines, "")
    table.insert(lines, "Use `tag_name` + `props` in CreateArtifact, or write the tag directly in")
    table.insert(lines, "reply text as an inline shortcut. Only use tag names listed here.")
    table.insert(lines, "")

    local auto_rendered = 0
    for _, component in ipairs(components) do
        if component.announced and component.auto_register and not component.secure then
            local meta, _meta_err = bundled_meta.fetch_for_component(component)
            local base_url = component_registry.resolve_base_url(component)
            local projected = bundled_meta.project_component_response(meta, component, base_url)

            local tag = projected.wippy.tagName
            if tag and tag ~= "" then
                auto_rendered = auto_rendered + 1
                table.insert(lines, "### " .. tag)
                if projected.title and projected.title ~= "" then
                    table.insert(lines, "**" .. projected.title .. "**")
                end
                if projected.description and projected.description ~= "" then
                    table.insert(lines, projected.description)
                end
                local props_str = format_schema(projected.wippy.props)
                if props_str ~= "" then
                    table.insert(lines, "")
                    table.insert(lines, "Props schema:")
                    table.insert(lines, "```json")
                    table.insert(lines, props_str)
                    table.insert(lines, "```")
                end
                local events_str = format_schema(projected.wippy.events)
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

    if auto_rendered == 0 then
        table.insert(lines, "(none registered)")
        table.insert(lines, "")
    end

    -- ── Section 2: Non-auto-registered ESM components (package mode) ─────────
    -- These are not auto-loaded at runtime, so tag_name alone is insufficient.
    -- The agent must use content_type="application/json" and pass the full
    -- package JSON (wippy-component-1.0 ESM format) as the content field.
    -- Copy the JSON block verbatim — do NOT construct or guess field values.
    table.insert(lines, "## ESM web components (package mode — content_type=\"application/json\")")
    table.insert(lines, "")
    table.insert(lines, "For these components: use CreateArtifact with `content_type=\"application/json\"`")
    table.insert(lines, "and `content` = the package JSON block shown below (copy verbatim).")
    table.insert(lines, "")

    local esm_rendered = 0
    for _, component in ipairs(components) do
        if component.announced and not component.auto_register and not component.secure then
            local meta, _meta_err = bundled_meta.fetch_for_component(component)
            local base_url = component_registry.resolve_base_url(component)
            local projected = bundled_meta.project_component_response(meta, component, base_url)

            local tag = projected.wippy.tagName
            local entry = projected.browser or "index.js"
            -- Trailing slash is guaranteed by resolve_base_url
            local browser_url = base_url .. entry

            local pkg = {
                specification = "wippy-component-1.0",
                name = projected.name,
                browser = browser_url,
                wippy = {
                    tagName = tag,
                    props = projected.wippy.props or { type = "object", properties = {} },
                },
            }
            local pkg_str, pkg_err = json.encode(pkg)
            if not pkg_err and pkg_str then
                esm_rendered = esm_rendered + 1
                local display_tag = tag and tag ~= "" and tag or projected.name
                table.insert(lines, "### " .. display_tag)
                if projected.title and projected.title ~= "" then
                    table.insert(lines, "**" .. projected.title .. "**")
                end
                if projected.description and projected.description ~= "" then
                    table.insert(lines, projected.description)
                end
                table.insert(lines, "")
                table.insert(lines, "Package JSON (use as `content`):")
                table.insert(lines, "```json")
                table.insert(lines, pkg_str)
                table.insert(lines, "```")
                table.insert(lines, "")
            end
        end
    end

    if esm_rendered == 0 then
        table.insert(lines, "(none registered)")
        table.insert(lines, "")
    end

    -- ── Section 3: SPA pages (package mode) ──────────────────────────────────
    -- Announced, non-secure, non-template pages (kind = "component" = SPA).
    -- Use content_type="application/json" and paste the package JSON as content.
    -- These pages are full SPA apps rendered inside an iframe with proxy.js.
    -- Jet-template pages (kind = "template") are server-rendered and not
    -- available as agent-created artifacts — do not list them here.
    --
    -- Size reporting: whether this page auto-reports its height to the host
    -- is controlled by wippy.proxy.injections.resizeObserver. Pages that set
    -- it to true send CmdBodySize messages → the host resizes the iframe to fit
    -- the page's intrinsic height. Pages that do NOT have it will render at a
    -- fixed/zero height in a content-sized context (they still work fine as
    -- standalone full-panel artifacts). The catalog emits a "sizing" note per
    -- page so the agent can decide whether the page needs the flag patched in.
    table.insert(lines, "## Pages (package mode — content_type=\"application/json\")")
    table.insert(lines, "")
    table.insert(lines, "For these pages: use CreateArtifact with `content_type=\"application/json\"`")
    table.insert(lines, "and `content` = the package JSON block shown below.")
    table.insert(lines, "")
    table.insert(lines, "**Size reporting note:** check the `sizing` label next to each page.")
    table.insert(lines, "- `sizing: auto` — page has `wippy.proxy.injections.resizeObserver: true`.")
    table.insert(lines, "  Copy the JSON verbatim; it will auto-size inside the artifact.")
    table.insert(lines, "- `sizing: fixed` — page does NOT report height. It renders correctly")
    table.insert(lines, "  only in a full-panel context (standalone). If you need it to auto-size")
    table.insert(lines, "  (e.g. embedding inline), patch the JSON: set")
    table.insert(lines, "  `wippy.proxy.injections.resizeObserver` to `true` before passing as content.")
    table.insert(lines, "")

    local pages_rendered = 0
    local all_pages, pages_err = page_registry.find_all()
    if not pages_err and all_pages then
        for _, page in ipairs(all_pages) do
            if page.announced and page.kind == "component" and not page.secure then
                local meta, _meta_err = bundled_meta.fetch_for_page(page)
                local base_url = page_registry.resolve_base_url(page)
                local projected = bundled_meta.project_page_response(meta, page, base_url)

                -- isWippyPackageWebPage requires wippy.proxy to be truthy.
                -- If the page has no proxy config in bundled meta, supply a
                -- minimal default so the frontend routes it correctly.
                if not projected.wippy.proxy then
                    projected.wippy.proxy = { enabled = true }
                end

                -- Determine whether this page auto-reports its height.
                -- resizeObserver in injections = true → sends CmdBodySize → host
                -- resizes iframe. Absent/false → no size reporting (fixed sizing).
                local has_resize_observer = false
                if projected.wippy.proxy.injections and projected.wippy.proxy.injections.resizeObserver then
                    has_resize_observer = true
                end
                local sizing_label = has_resize_observer and "auto" or "fixed"

                local pkg_str, pkg_err2 = json.encode(projected)
                if not pkg_err2 and pkg_str then
                    pages_rendered = pages_rendered + 1
                    local display_name = projected.title and projected.title ~= "" and projected.title or projected.name
                    table.insert(lines, "### " .. display_name)
                    if projected.title and projected.title ~= "" and projected.name and projected.name ~= "" then
                        table.insert(lines, "Name: `" .. projected.name .. "`")
                    end
                    table.insert(lines, "Sizing: `" .. sizing_label .. "`")
                    table.insert(lines, "")
                    table.insert(lines, "Package JSON (use as `content`):")
                    table.insert(lines, "```json")
                    table.insert(lines, pkg_str)
                    table.insert(lines, "```")
                    table.insert(lines, "")
                end
            end
        end
    end

    if pages_rendered == 0 then
        table.insert(lines, "(none registered)")
        table.insert(lines, "")
    end

    if auto_rendered == 0 and esm_rendered == 0 and pages_rendered == 0 then
        return {
            prompt = "Available components: (none registered — CreateArtifact's component and package modes are unavailable this session)"
        }
    end

    return {
        prompt = table.concat(lines, "\n")
    }
end

return { execute = execute }
