import { computed, onScopeDispose, shallowRef, watch } from 'vue'
import type { Ref } from 'vue'
import { mappedField, parseTileAttributes } from './attrs.ts'
import { createTileController } from './controller.ts'
import type { InputValidator, TileController, TileSnapshot } from './controller.ts'
import { createDefaultDeps } from './default-deps.ts'
import { createConfirm } from './host-confirm.ts'
import type {
  ActionResult,
  ConfirmRequest,
  EmitFn,
  InputState,
  RenderStatus,
  RunActionOptions,
  TileDeps,
} from './types.ts'

export interface UseTileOptions {
  /** The props of the element: `useProps()` of `@wippy-fe/webcomponent-vue`. */
  props: Ref<Record<string, unknown>>
  /** The event emitter: `useEvents()` of `@wippy-fe/webcomponent-vue`. */
  emit: EmitFn
  /** Replace parts of the network layer. Unit tests do this. */
  deps?: Partial<TileDeps>
  /**
   * Checks per input. A ready value that fails a check shows as `error` from the start, so a tile never
   * reports `ready` for data it cannot draw. Return a TileError (for example code `format_mismatch`).
   */
  validate?: Record<string, InputValidator>
}

const EMPTY: TileSnapshot = { status: 'loading', inputs: {} }

/** The value of an input when a tile may draw it: ready, or computing with a stale value. Else null. */
export function usableData(input: InputState | undefined): unknown {
  if (!input)
    return null
  if (input.status !== 'ready' && input.status !== 'computing')
    return null
  return input.data ?? null
}

/**
 * The one composable every tile uses. It owns the tile protocol: it waits for `request-id`, reads the
 * data sources, follows slow results, reacts to live signals, runs actions and reports `render-state`.
 * A new `request-id` stops the old reads and starts new ones. Unmounting stops everything.
 */
export function useTile(options: UseTileOptions) {
  const config = computed(() => parseTileAttributes(options.props.value))
  const snapshot = shallowRef<TileSnapshot>(EMPTY)
  const confirmRequest = shallowRef<ConfirmRequest | null>(null)
  let answer: ((confirmed: boolean) => void) | null = null
  let controller: TileController | null = null

  function settleConfirm(confirmed: boolean) {
    const resolve = answer
    answer = null
    confirmRequest.value = null
    resolve?.(confirmed)
  }

  /** The helper's own dialog (`<TileConfirm>`). It answers only when the Host has no `host.confirm`. */
  const shadowConfirm = (request: ConfirmRequest): Promise<boolean> => {
    settleConfirm(false)
    return new Promise<boolean>((resolve) => {
      answer = resolve
      confirmRequest.value = request
    })
  }

  const confirm = createConfirm(shadowConfirm)
  const deps: TileDeps = { ...createDefaultDeps(confirm), ...options.deps }

  watch(
    () => config.value.requestId,
    (requestId) => {
      controller?.dispose()
      controller = null
      settleConfirm(false)
      snapshot.value = EMPTY
      // The board sets request-id last. Without it the configuration is not complete.
      if (!requestId)
        return
      const mine = createTileController(config.value, deps, options.emit, (next) => {
        if (controller === mine)
          snapshot.value = next
      }, options.validate)
      controller = mine
      mine.start()
    },
    { immediate: true },
  )

  onScopeDispose(() => {
    controller?.dispose()
    controller = null
    settleConfirm(false)
  })

  const status = computed<RenderStatus>(() => snapshot.value.status)
  const inputs = computed<Record<string, InputState>>(() => snapshot.value.inputs)

  return {
    /** The tile attributes, parsed. */
    config,
    /** The status of the whole tile. */
    status,
    /** Every input by name. */
    inputs,
    /** The value of an input that the tile may draw, else null. */
    data: (name: string): unknown => usableData(snapshot.value.inputs[name]),
    /** The data field that a tile field maps to (`fields` attribute). */
    fieldName: (name: string): string => mappedField(config.value.fields, name),
    options: computed(() => config.value.options),
    params: computed(() => config.value.params),
    fields: computed(() => config.value.fields),
    /** The pending confirmation of the fallback dialog, for `<TileConfirm>`. The Host's `host.confirm()` is used first. */
    confirmRequest,
    answerConfirm: settleConfirm,
    runAction: (name: string, tileArgs: Record<string, unknown> = {}, runOptions: RunActionOptions = {}): Promise<ActionResult> =>
      controller
        ? controller.runAction(name, tileArgs, runOptions)
        : Promise.resolve({ action: name, status: 'failed', error: { code: 'not_started', message: 'The tile has no configuration yet.' }, envelope: null }),
    emitTileEvent: (name: string, detail: unknown) => controller?.emitTileEvent(name, detail),
    refresh: (input?: string) => controller?.refresh(input),
  }
}

export type UseTile = ReturnType<typeof useTile>
