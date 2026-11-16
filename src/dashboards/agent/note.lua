-- Point function of wippy.dashboards.agent:note: returns its fixed text as a
-- record, so a text tile can show a heading or a note the agent wrote.
local function note(input)
    local args = type(input) == "table" and input.args or {}
    local text = type(args) == "table" and args.text or nil
    if type(text) ~= "string" or text == "" then
        return {}
    end
    return { text = text }
end

return { note = note }
