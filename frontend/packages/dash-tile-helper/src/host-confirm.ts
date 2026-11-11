import type { ConfirmRequest } from './types.ts'

/** The options of `host.confirm()` of `@wippy-fe/proxy` (PrimeVue confirmation options). */
export interface HostConfirmOptions {
  message: string
  header: string
  acceptLabel: string
  rejectLabel: string
}

/** The part of the Host API that the helper uses. `confirm` may be missing outside a Host. */
export interface HostLike {
  confirm?: (options: HostConfirmOptions) => Promise<boolean>
}

export type HostLoader = () => Promise<HostLike | null | undefined>

/** The Host of `@wippy-fe/proxy`. The proxy loads on first use, so the helper imports in Node without a Host. */
export const defaultHostLoader: HostLoader = async () => {
  const { host } = await import('@wippy-fe/proxy')
  return host as HostLike
}

export function confirmOptions(request: ConfirmRequest): HostConfirmOptions {
  return {
    message: request.message ?? `Run the action "${request.action}"?`,
    header: 'Please confirm',
    acceptLabel: 'Confirm',
    rejectLabel: 'Cancel',
  }
}

/**
 * The confirmation of an action: the Host's dialog, `host.confirm()`. It resolves true only when the viewer
 * accepts. When the Host has no `confirm` (or cannot be reached, or the call throws before it shows
 * anything), the helper's own dialog answers instead: `fallback`.
 */
export function createConfirm(
  fallback: (request: ConfirmRequest) => Promise<boolean>,
  loadHost: HostLoader = defaultHostLoader,
): (request: ConfirmRequest) => Promise<boolean> {
  return async (request) => {
    let confirm: HostLike['confirm']
    let host: HostLike | null | undefined
    try {
      host = await loadHost()
      confirm = typeof host?.confirm === 'function' ? host.confirm.bind(host) : undefined
    }
    catch {
      confirm = undefined
    }
    if (!confirm)
      return fallback(request)
    try {
      return (await confirm(confirmOptions(request))) === true
    }
    catch {
      return fallback(request)
    }
  }
}
