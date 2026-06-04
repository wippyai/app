local json = require("json")

local function handler(params)
    local title = params.title or "Untitled Artifact"
    local display_type = params.instructions == true and "inline" or "standalone"

    local artifact = {
        title = title,
        display_type = display_type,
        preview = params.preview or "",
        instructions = params.instructions == true,
    }

    if params.tag_name then
        -- Web component mode: content is a Wippy component-tag package JSON
        -- (`specification: wippy-component-tag-1.0`) — gen-2-chat's
        -- web-package-loader.vue recognises this shape via
        -- `isWippyPackageComponent` and mounts the custom element with the
        -- bound props. Bare props alone don't pass the type guard, so the
        -- standalone bubble would render empty without this wrapping.
        artifact.tag_name = params.tag_name
        artifact.content_type = "application/json"

        local props_table = {}
        if params.props and type(params.props) == "table" then
            props_table = params.props
        end

        local pkg = {
            specification = "wippy-component-tag-1.0",
            wippy = { tagName = params.tag_name },
            props = props_table,
        }

        local encoded, err = json.encode(pkg)
        if err then
            return { success = false, error = "Failed to encode component package: " .. tostring(err) }
        end
        artifact.content = encoded
    else
        -- Content mode: HTML or Markdown
        artifact.content = params.content or ""
        artifact.content_type = params.content_type or "text/markdown"
    end

    return {
        success = true,
        message = "Artifact created: " .. title,
        _control = {
            artifacts = { artifact }
        }
    }
end

return { handler = handler }
