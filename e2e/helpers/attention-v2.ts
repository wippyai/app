import type { AttentionSnapshot, ContextAttachment } from './attention'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'

// Independent test oracle for the frozen wire contract; no production codec imports.
export const ATTENTION_ORACLE_LIMITS = {
  envelopeV2: 16384, envelopeV3: 16384, envelopeV4: 16384, attachmentSet: 32768, expanded: 262144,
  dictionary: 4128, path: 32, candidates: 128, points: 4096,
  events: 32, omissions: 128, memberships: 16384,
} as const

type ObjectValue = Record<string, unknown>
type Point = { point_id: string, x: number, y: number }

function requireValid(condition: unknown): asserts condition {
  if (!condition)
    throw new Error('Invalid Attention context in independent E2E oracle')
}

function object(value: unknown): asserts value is ObjectValue {
  requireValid(value !== null && typeof value === 'object' && !Array.isArray(value))
}

function fields(value: unknown, allowed: string[]): asserts value is ObjectValue {
  object(value)
  requireValid(Object.keys(value).every(key => allowed.includes(key)))
}

function list(value: unknown, maximum: number): asserts value is unknown[] {
  requireValid(Array.isArray(value) && value.length <= maximum
    && Array.from({ length: value.length }, (_unused, index) => index).every(index => Object.hasOwn(value, index)))
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function integer(value: unknown, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= maximum
}

function identifier(value: unknown, maximum = 128): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum
}

export function oracleCanonicalJson(value: unknown, depth = 0): string {
  requireValid(depth <= 32)
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || finite(value))
    return JSON.stringify(value)
  if (Array.isArray(value))
    return `[${value.map(item => oracleCanonicalJson(item, depth + 1)).join(',')}]`
  object(value)
  return `{${Object.keys(value).sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)))
    .map(key => `${JSON.stringify(key)}:${oracleCanonicalJson(value[key], depth + 1)}`).join(',')}}`
}

const bytes = (value: unknown) => Buffer.byteLength(oracleCanonicalJson(value))
const digest = (value: unknown) => `sha256:${createHash('sha256').update(oracleCanonicalJson(value)).digest('hex')}`
const omit = (value: ObjectValue, keys: string[]) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)))

const PATH_KINDS = ['host', 'panel', 'artifact', 'page', 'iframe', 'web-fragment', 'web-component', 'shadow-root', 'element']
const PATH_ATTRIBUTE_FIELDS = ['label', 'panel_id', 'surface_id', 'artifact_id', 'page_id', 'package_id', 'tag_name', 'selector_hint', 'frame_origin', 'rect', 'clip_rect', 'local_to_parent', 'coordinate_quality']

function packedRect(value: unknown): ObjectValue {
  list(value, 4)
  requireValid(value.length === 4 && value.every(finite) && (value[2] as number) >= 0 && (value[3] as number) >= 0)
  return { x: value[0], y: value[1], width: value[2], height: value[3] }
}

function unpackPathSegmentV3(value: unknown): ObjectValue {
  list(value, 4)
  requireValid(value.length === 4)
  const [kind, mountId, generation, attributes] = value
  fields(attributes, PATH_ATTRIBUTE_FIELDS)
  requireValid(typeof kind === 'string' && PATH_KINDS.includes(kind) && identifier(mountId, 160) && integer(generation))
  const stringLimits: Record<string, number> = {
    label: 256,
    panel_id: 128,
    surface_id: 128,
    artifact_id: 128,
    page_id: 128,
    package_id: 256,
    tag_name: 128,
    selector_hint: 512,
    frame_origin: 2048,
  }
  for (const [field, maximum] of Object.entries(stringLimits))
    requireValid(attributes[field] === undefined || identifier(attributes[field], maximum))
  requireValid(attributes.coordinate_quality === undefined || attributes.coordinate_quality === 'exact' || attributes.coordinate_quality === 'approximate')
  let transform: ObjectValue | undefined
  if (attributes.local_to_parent !== undefined) {
    list(attributes.local_to_parent, 16)
    requireValid(attributes.local_to_parent.length === 16 && attributes.local_to_parent.every(finite))
    transform = {
      matrix: attributes.local_to_parent,
      convention: 'dommatrix-column-major',
      direction: 'local-to-parent',
    }
  }
  return {
    ...omit(attributes, ['rect', 'clip_rect', 'local_to_parent']),
    kind,
    mount_id: mountId,
    generation,
    ...(attributes.rect !== undefined ? { rect: packedRect(attributes.rect) } : {}),
    ...(attributes.clip_rect !== undefined ? { clip_rect: packedRect(attributes.clip_rect) } : {}),
    ...(transform ? { local_to_parent: transform } : {}),
  }
}

function queryPoint(value: unknown): Point {
  fields(value, ['point_id', 'x', 'y'])
  requireValid(identifier(value.point_id) && finite(value.x) && finite(value.y))
  return value as Point
}

function validateSemanticSnapshot(snapshot: ObjectValue): void {
  requireValid(snapshot.schema === 'wippy.attention.v1' && identifier(snapshot.snapshot_id) && identifier(snapshot.host_instance_id, 160)
    && integer(snapshot.mount_generation) && typeof snapshot.created_at === 'string' && Number.isFinite(Date.parse(snapshot.created_at)))
  fields(snapshot.coordinate_space, ['kind', 'width', 'height', 'device_pixel_ratio'])
  requireValid(snapshot.coordinate_space.kind === 'host-viewport' && finite(snapshot.coordinate_space.width) && snapshot.coordinate_space.width >= 0
    && finite(snapshot.coordinate_space.height) && snapshot.coordinate_space.height >= 0
    && finite(snapshot.coordinate_space.device_pixel_ratio) && snapshot.coordinate_space.device_pixel_ratio > 0)
  object(snapshot.capture)
  requireValid(finite(snapshot.capture.duration_ms) && snapshot.capture.duration_ms >= 0 && typeof snapshot.capture.complete === 'boolean')
  const candidates = snapshot.candidates as ObjectValue[]
  const targets = new Set<string>()
  const validatePath = (value: unknown): ObjectValue[] => {
    list(value, ATTENTION_ORACLE_LIMITS.path)
    requireValid(value.length > 0)
    for (const segment of value) {
      object(segment)
      requireValid(identifier(segment.kind) && identifier(segment.mount_id, 160) && integer(segment.generation))
    }
    return value as ObjectValue[]
  }
  for (const candidate of candidates) {
    requireValid(identifier(candidate.target_id) && !targets.has(candidate.target_id))
    targets.add(candidate.target_id)
    const path = validatePath(candidate.path)
    object(candidate.rect)
    requireValid(['x', 'y', 'width', 'height'].every(key => finite((candidate.rect as ObjectValue)[key]))
      && (candidate.rect.width as number) >= 0 && (candidate.rect.height as number) >= 0)
    if (candidate.action_ref !== undefined) {
      const action = candidate.action_ref
      object(action)
      const leaf = path[path.length - 1]
      requireValid(action.snapshot_id === snapshot.snapshot_id && action.target_id === candidate.target_id
        && action.host_instance_id === snapshot.host_instance_id && action.mount_id === leaf.mount_id
        && action.generation === leaf.generation && oracleCanonicalJson(action.rect) === oracleCanonicalJson(candidate.rect)
        && action.path_digest === digest(path))
    }
  }
  const events = [...snapshot.recent_events as ObjectValue[], ...(snapshot.pointer ? [snapshot.pointer as ObjectValue] : [])]
  for (const event of events) {
    list(event.candidate_ids, ATTENTION_ORACLE_LIMITS.candidates)
    requireValid(event.candidate_ids.every(id => typeof id === 'string' && targets.has(id)))
  }
  if (snapshot.focus) {
    object(snapshot.focus)
    validatePath(snapshot.focus.path)
    requireValid(typeof snapshot.focus.focused_at === 'string' && Number.isFinite(Date.parse(snapshot.focus.focused_at))
      && (snapshot.focus.candidate_id === undefined || targets.has(snapshot.focus.candidate_id as string)))
  }
  if (snapshot.selection) {
    fields(snapshot.selection, ['selection_id', 'selected_at', 'kind', 'collapsed', 'direction', 'text', 'anchor_path', 'focus_path', 'ranges'])
    requireValid(identifier(snapshot.selection.selection_id)
      && typeof snapshot.selection.selected_at === 'string' && Number.isFinite(Date.parse(snapshot.selection.selected_at))
      && snapshot.selection.kind === 'text' && snapshot.selection.collapsed === false
      && ['forward', 'backward', 'none'].includes(snapshot.selection.direction as string)
      && typeof snapshot.selection.text === 'string' && Buffer.byteLength(snapshot.selection.text) <= 1024)
    validatePath(snapshot.selection.anchor_path)
    validatePath(snapshot.selection.focus_path)
    list(snapshot.selection.ranges, 4)
    for (const range of snapshot.selection.ranges) {
      fields(range, ['rect', 'coordinate_space'])
      const rect = range.rect
      fields(rect, ['x', 'y', 'width', 'height'])
      requireValid(['x', 'y', 'width', 'height'].every(key => finite(rect[key]))
        && (rect.width as number) >= 0 && (rect.height as number) >= 0)
      if (range.coordinate_space !== 'host-viewport') {
        fields(range.coordinate_space, ['mount_id', 'generation'])
        requireValid(identifier(range.coordinate_space.mount_id, 160) && integer(range.coordinate_space.generation))
      }
    }
  }
}

/** Reconstructs exactly; this test oracle is not a replacement for Session's full admission validator. */
export function expandAttentionV2ForTest(payload: unknown, maximumBytes: number = ATTENTION_ORACLE_LIMITS.expanded): AttentionSnapshot {
  fields(payload, ['schema', 'snapshot_id', 'host_instance_id', 'mount_generation', 'created_at', 'coordinate_space', 'capture', 'pointer', 'focus', 'selection', 'recent_events', 'candidates', 'omissions', 'path_dictionary'])
  requireValid(payload.schema === 'wippy.attention.v2' && integer(maximumBytes, ATTENTION_ORACLE_LIMITS.expanded))
  list(payload.path_dictionary, ATTENTION_ORACLE_LIMITS.dictionary)
  list(payload.candidates, ATTENTION_ORACLE_LIMITS.candidates)
  list(payload.recent_events, ATTENTION_ORACLE_LIMITS.events)
  list(payload.omissions, ATTENTION_ORACLE_LIMITS.omissions)
  const dictionary = payload.path_dictionary
  dictionary.forEach(segment => object(segment))
  requireValid(new Set(dictionary.map(segment => oracleCanonicalJson(segment))).size === dictionary.length)
  const capture = payload.capture
  fields(capture, ['radius_css_px', 'grid_step_css_px', 'sampled_points', 'duration_ms', 'complete', 'points', 'point_encoding'])
  requireValid(finite(capture.radius_css_px) && capture.radius_css_px >= 0 && capture.radius_css_px <= 100
    && finite(capture.grid_step_css_px) && capture.grid_step_css_px >= 1 && capture.grid_step_css_px <= 100
    && integer(capture.sampled_points, ATTENTION_ORACLE_LIMITS.points)
    && (capture.points === undefined) !== (capture.point_encoding === undefined))
  const observations = new Set<string>()
  for (const event of [...payload.recent_events, ...(payload.pointer !== undefined ? [payload.pointer] : []), ...(payload.focus !== undefined ? [payload.focus] : [])]) {
    object(event)
    requireValid(identifier(event.event_id))
    observations.add(event.event_id)
  }
  const points: Point[] = []
  const candidates: ObjectValue[] = []
  const output: ObjectValue = {
    ...omit(payload, ['schema', 'capture', 'candidates', 'path_dictionary', 'focus', 'selection']),
    schema: 'wippy.attention.v1', capture: { ...omit(capture, ['points', 'point_encoding']), points }, candidates,
  }
  if (payload.focus !== undefined) {
    fields(payload.focus, ['event_id', 'sequence', 'focused_at', 'realm_time_ms', 'candidate_id', 'summary', 'path_indices'])
    output.focus = { ...omit(payload.focus, ['path_indices']), path: [] }
  }
  let used = bytes(output)
  const charge = (amount: number) => {
    requireValid(amount <= maximumBytes - used)
    used += amount
  }
  charge(0)
  const pointIds = new Set<string>()
  const appendPoint = (value: unknown) => {
    const point = queryPoint(value)
    requireValid(points.length < ATTENTION_ORACLE_LIMITS.points && !pointIds.has(point.point_id) && !observations.has(point.point_id))
    charge(bytes(point) + (points.length ? 1 : 0))
    pointIds.add(point.point_id)
    points.push(point)
  }
  if (capture.points !== undefined) {
    list(capture.points, ATTENTION_ORACLE_LIMITS.points)
    capture.points.forEach(appendPoint)
  }
  else {
    const encoding = capture.point_encoding
    fields(encoding, ['kind', 'origin', 'overrides', 'additional_points'])
    fields(encoding.origin, ['x', 'y'])
    requireValid(encoding.kind === 'css-euclidean-grid.v1' && finite(encoding.origin.x) && finite(encoding.origin.y))
    const radius = capture.radius_css_px
    const step = capture.grid_step_css_px
    const extent = Math.floor(radius / step)
    requireValid((extent * 2 + 1) ** 2 <= ATTENTION_ORACLE_LIMITS.points)
    const overrides = new Map<number, Point>()
    const rawOverrides = encoding.overrides ?? []
    list(rawOverrides, ATTENTION_ORACLE_LIMITS.points)
    for (const override of rawOverrides) {
      fields(override, ['index', 'point'])
      requireValid(integer(override.index, ATTENTION_ORACLE_LIMITS.points - 1) && !overrides.has(override.index))
      overrides.set(override.index, queryPoint(override.point))
    }
    for (let row = -extent; row <= extent; row++) {
      for (let column = -extent; column <= extent; column++) {
        const x = column * step
        const y = row * step
        if (x * x + y * y > radius * radius)
          continue
        const index = points.length
        appendPoint(overrides.get(index) ?? { point_id: `p${index}`, x: encoding.origin.x + x, y: encoding.origin.y + y })
        overrides.delete(index)
      }
    }
    requireValid(overrides.size === 0)
    const additional = encoding.additional_points ?? []
    list(additional, ATTENTION_ORACLE_LIMITS.points)
    additional.forEach(appendPoint)
  }
  requireValid(points.length === capture.sampled_points)
  const seenDictionary = new Set<number>()
  const expandPath = (indices: unknown) => {
    list(indices, ATTENTION_ORACLE_LIMITS.path)
    requireValid(indices.length > 0)
    const path: unknown[] = []
    for (const index of indices) {
      requireValid(integer(index, dictionary.length - 1))
      if (!seenDictionary.has(index)) {
        requireValid(index === seenDictionary.size)
        seenDictionary.add(index)
      }
      charge(bytes(dictionary[index]) + (path.length ? 1 : 0))
      path.push(dictionary[index])
    }
    return path
  }
  let memberships = 0
  for (const candidate of payload.candidates) {
    fields(candidate, ['target_id', 'path_indices', 'sample_refs', 'rect', 'clip_rect', 'occluded', 'summary', 'provenance', 'action_ref'])
    list(candidate.sample_refs, ATTENTION_ORACLE_LIMITS.points)
    requireValid(candidate.sample_refs.length > 0)
    const ids: string[] = []
    const expanded = { ...omit(candidate, ['path_indices', 'sample_refs']), path: [] as unknown[], sample_point_ids: ids }
    charge(bytes(expanded) + (candidates.length ? 1 : 0))
    expanded.path = expandPath(candidate.path_indices)
    const seen = new Set<string>()
    const append = (id: string) => {
      requireValid(!seen.has(id) && ids.length < ATTENTION_ORACLE_LIMITS.points && memberships < ATTENTION_ORACLE_LIMITS.memberships)
      charge(bytes(id) + (ids.length ? 1 : 0))
      ids.push(id)
      seen.add(id)
      memberships++
    }
    for (const ref of candidate.sample_refs) {
      if (typeof ref === 'string') {
        requireValid(observations.has(ref))
        append(ref)
      }
      else if (typeof ref === 'number') {
        requireValid(integer(ref, points.length - 1))
        append(points[ref].point_id)
      }
      else {
        list(ref, 2)
        requireValid(ref.length === 2 && integer(ref[0], points.length - 1) && integer(ref[1], points.length) && ref[1] > 0
          && ref[0] + ref[1] <= points.length && ref[1] <= ATTENTION_ORACLE_LIMITS.points - ids.length
          && ref[1] <= ATTENTION_ORACLE_LIMITS.memberships - memberships)
        for (let index = ref[0]; index < ref[0] + ref[1]; index++)
          append(points[index].point_id)
      }
    }
    candidates.push(expanded)
  }
  if (output.focus)
    (output.focus as ObjectValue).path = expandPath((payload.focus as ObjectValue).path_indices)
  if (payload.selection !== undefined) {
    fields(payload.selection, ['selection_id', 'selected_at', 'kind', 'collapsed', 'direction', 'text', 'anchor_path', 'focus_path', 'anchor_path_indices', 'focus_path_indices', 'ranges'])
    const hasDirectAnchor = payload.selection.anchor_path !== undefined
    const hasDirectFocus = payload.selection.focus_path !== undefined
    const hasIndexedAnchor = payload.selection.anchor_path_indices !== undefined
    const hasIndexedFocus = payload.selection.focus_path_indices !== undefined
    const directPaths = hasDirectAnchor && hasDirectFocus && !hasIndexedAnchor && !hasIndexedFocus
    const indexedPaths = hasIndexedAnchor && hasIndexedFocus && !hasDirectAnchor && !hasDirectFocus
    requireValid(directPaths || indexedPaths)
    output.selection = directPaths
      ? payload.selection
      : {
          ...omit(payload.selection, ['anchor_path_indices', 'focus_path_indices']),
          anchor_path: expandPath(payload.selection.anchor_path_indices),
          focus_path: expandPath(payload.selection.focus_path_indices),
        }
    charge(bytes(output) - used)
  }
  requireValid(seenDictionary.size === dictionary.length && bytes(output) === used)
  validateSemanticSnapshot(output)
  return JSON.parse(oracleCanonicalJson(output)) as AttentionSnapshot
}

/** Independently normalizes the v3 packed dictionary before the v2 expansion oracle. */
export function expandAttentionV3ForTest(payload: unknown, maximumBytes: number = ATTENTION_ORACLE_LIMITS.expanded): AttentionSnapshot {
  fields(payload, ['schema', 'snapshot_id', 'host_instance_id', 'mount_generation', 'created_at', 'coordinate_space', 'capture', 'pointer', 'focus', 'selection', 'recent_events', 'candidates', 'omissions', 'path_dictionary'])
  requireValid(payload.schema === 'wippy.attention.v3')
  list(payload.path_dictionary, ATTENTION_ORACLE_LIMITS.dictionary)
  return expandAttentionV2ForTest({
    ...payload,
    schema: 'wippy.attention.v2',
    path_dictionary: payload.path_dictionary.map(unpackPathSegmentV3),
  }, maximumBytes)
}

/** Independently validates v4 and delegates its shared packed representation through the v3 and v2 oracle. */
export function expandAttentionV4ForTest(payload: unknown, maximumBytes: number = ATTENTION_ORACLE_LIMITS.expanded): AttentionSnapshot {
  fields(payload, ['schema', 'snapshot_id', 'host_instance_id', 'mount_generation', 'created_at', 'coordinate_space', 'capture', 'pointer', 'focus', 'selection', 'recent_events', 'candidates', 'omissions', 'path_dictionary'])
  requireValid(payload.schema === 'wippy.attention.v4')
  return expandAttentionV3ForTest({ ...payload, schema: 'wippy.attention.v3' }, maximumBytes)
}

export function attentionSnapshotFromAttachment(attachment: ContextAttachment, maximumBytes: number = ATTENTION_ORACLE_LIMITS.expanded): AttentionSnapshot {
  requireValid(attachment.kind === 'wippy.attention' && [1, 2, 3, 4].includes(attachment.version)
    && attachment.content_type === 'application/json' && typeof attachment.content === 'string'
    && Buffer.byteLength(attachment.content) <= ATTENTION_ORACLE_LIMITS.attachmentSet)
  requireValid(bytes(attachment) <= (attachment.version === 2
    ? ATTENTION_ORACLE_LIMITS.envelopeV2
    : attachment.version === 3 || attachment.version === 4
      ? attachment.version === 4 ? ATTENTION_ORACLE_LIMITS.envelopeV4 : ATTENTION_ORACLE_LIMITS.envelopeV3
      : ATTENTION_ORACLE_LIMITS.attachmentSet))
  const payload = JSON.parse(attachment.content)
  requireValid(oracleCanonicalJson(payload) === attachment.content && Buffer.byteLength(attachment.content) === attachment.content_bytes
    && `sha256:${createHash('sha256').update(attachment.content).digest('hex')}` === attachment.content_hash)
  requireValid(payload.schema === `wippy.attention.v${attachment.version}`)
  if (attachment.version === 2)
    return expandAttentionV2ForTest(payload, maximumBytes)
  if (attachment.version === 3)
    return expandAttentionV3ForTest(payload, maximumBytes)
  if (attachment.version === 4)
    return expandAttentionV4ForTest(payload, maximumBytes)
  requireValid(bytes(payload) <= maximumBytes)
  validateSemanticSnapshot(payload)
  return payload as AttentionSnapshot
}

export function attentionSnapshotsFromAttachments(attachments: ContextAttachment[]): AttentionSnapshot[] {
  requireValid(attachments.length <= 8 && bytes(attachments) <= ATTENTION_ORACLE_LIMITS.attachmentSet)
  let remaining: number = ATTENTION_ORACLE_LIMITS.expanded
  return attachments.filter(attachment => attachment.kind === 'wippy.attention').map((attachment) => {
    const snapshot = attentionSnapshotFromAttachment(attachment, remaining)
    remaining -= bytes(snapshot)
    return snapshot
  })
}
