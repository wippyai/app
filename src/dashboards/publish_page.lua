-- POST /api/v1/dashboards/pages (contracts section 3).
-- Reads the body and hands it to wippy.dashboards:publish, which validates the
-- spec, stores the row and creates or updates the view.page entry.
local http = require("http")
local publish_lib = require("publish")

local function handler()
    local req = http.request()
    local res = http.response()
    res:set_content_type(http.CONTENT.JSON)

    local result, err = publish_lib.publish(req:body())
    if not result then
        res:set_status(err.status)
        res:write_json({ error = { code = err.code, message = err.message } })
        return
    end

    res:set_status(http.STATUS.OK)
    res:write_json(result)
end

return { handler = handler }
