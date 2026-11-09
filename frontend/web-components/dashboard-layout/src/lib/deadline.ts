/**
 * Limits for loading a tile component.
 * `loadByTagName` bounds only the wait for `customElements.define`, so a hung lookup request would
 * stay pending for ever. The board races the whole load against its own timer.
 */

export class DeadlineError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DeadlineError'
  }
}

/** Reject with a DeadlineError when `work` does not settle within `ms`. The timer is always cleared. */
export function withDeadline<T>(work: () => Promise<T> | T, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new DeadlineError(message)), ms)
    let result: Promise<T>
    try {
      result = Promise.resolve(work())
    }
    catch (err) {
      clearTimeout(timer)
      reject(err)
      return
    }
    result.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

/** A tile tag must be a custom element name: lowercase, starts with a letter, has a hyphen. Anything else is refused. */
const TILE_TAG = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/

export function isValidTileTag(tag: unknown): tag is string {
  return typeof tag === 'string' && TILE_TAG.test(tag)
}
