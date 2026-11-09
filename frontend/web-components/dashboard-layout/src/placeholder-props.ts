/** Props of the `dash-placeholder` test tile: the tile attributes of contracts section 8. */
export interface PlaceholderProps {
  tileId?: string
  requestId?: string
  dataSources?: Record<string, unknown>
  actions?: Record<string, unknown>
  fields?: Record<string, unknown>
  options?: { silent?: boolean, [key: string]: unknown }
  params?: Record<string, unknown>
  mode?: string
}

/** Kebab-case keys on purpose: attributes set after mount are reactive only when declared this way. */
export const placeholderPropsSchema = {
  type: 'object',
  properties: {
    'tile-id': { type: 'string', default: '', description: 'Tile id in the page.' },
    'request-id': { type: 'string', default: '', description: 'A new id for each configuration, set last.' },
    'data-sources': { type: 'object', description: 'Map from input name to its source.' },
    'actions': { type: 'object', description: 'Map from action name to its URL.' },
    'fields': { type: 'object', description: 'Map from the tile field names to data field names.' },
    'options': { type: 'object', description: 'Tile options. { "silent": true } makes the tile report nothing.' },
    'params': { type: 'object', description: 'Current values of the parameters the tile declares.' },
    'mode': { type: 'string', default: 'view', description: 'view (the POC has no edit mode).' },
  },
}
