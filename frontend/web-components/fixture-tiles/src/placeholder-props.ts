/** Props of the `dash-placeholder` test tile: the tile attributes of the tile contract. */
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

export interface PlaceholderEvents {
  'render-state': { request_id: string, status: string, computed_at: string, source_title: string }
  'load': undefined
  'unload': undefined
  'error': { message: string, error: unknown }
  'invalid': { message: string }
}

/** Kebab-case keys on purpose: attributes set after mount are reactive only when declared this way. */
export const placeholderPropsSchema = {
  type: 'object',
  properties: {
    'tile-id': { type: 'string', default: '', description: 'Tile id in the page.' },
    'request-id': { type: 'string', default: '', description: 'A new id for each configuration, set last.' },
    'data-sources': { type: 'object', default: {}, description: 'Map from input name to its source.' },
    'actions': { type: 'object', default: {}, description: 'Map from action name to its URL.' },
    'fields': { type: 'object', default: {}, description: 'Map from the tile field names to data field names.' },
    'options': { type: 'object', default: {}, description: 'Tile options. { "silent": true } makes the tile report nothing.' },
    'params': { type: 'object', default: {}, description: 'Current values of the parameters the tile declares.' },
    'mode': { type: 'string', default: 'view', description: 'view (the POC has no edit mode).' },
  },
}
