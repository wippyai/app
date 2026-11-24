export class ProviderStopped extends Error {}

function storedValue(value: unknown): unknown {
  if (typeof value !== 'string')
    return value
  try {
    return JSON.parse(value)
  }
  catch {
    return value
  }
}

/** Only an explicit provider or campaign limit cause has no verdict. */
export function isProviderStop(value: unknown): boolean {
  const cause = storedValue(value)
  if (typeof cause === 'string') {
    return /\bprovider[ _-]+(?:error|unavailable)\b|\brate[ _-]+limit(?:[ _-]+exceeded)?\b|\btoo many requests\b|\bkey limit exceeded\b|\binsufficient[ _-]+quota\b|\b(?:insufficient|out of|exhausted) credits?\b|\bcredits? (?:exhausted|balance (?:is )?too low)\b|\bshared (?:RC2 campaign |campaign |spend )?cap\b/i.test(cause)
  }
  if (!cause || typeof cause !== 'object')
    return false
  const error = cause as { type?: unknown, code?: unknown, message?: unknown, error?: unknown, details?: { provider?: unknown, operation?: unknown } }
  // wippy/llm attaches the provider and operation to its structured errors.
  if (typeof error.details?.provider === 'string' && error.details.provider
    && ['generate', 'structured_output', 'embed'].includes(String(error.details.operation)))
    return true
  return [error.type, error.code, error.message, error.error].some(isProviderStop)
}

export function turnFailure(cause: string): Error {
  return isProviderStop(cause.replace(/^Turn failed:\s*/i, '')) ? new ProviderStopped(cause) : new Error(cause)
}

/** The dataflow API exposes node.result/result.error and node metadata.error. */
export function dataflowFailure(run: {
  dataflow?: { status?: unknown }
  status?: unknown
  data?: Array<{ type?: unknown, discriminator?: unknown, content?: unknown }>
  nodes?: Array<{ status?: unknown, metadata?: { error?: unknown, status_message?: unknown } }>
}): Error | null {
  const status = String(run.dataflow?.status ?? run.status ?? '').toLowerCase()
  const stopped = ['failed', 'cancelled', 'canceled', 'terminated']
  if (!stopped.includes(status))
    return null
  let causes = (run.data ?? [])
    .filter(record => record.type === 'node.result' && record.discriminator === 'result.error')
    .map(record => storedValue(record.content))
  if (causes.length === 0) {
    causes = (run.nodes ?? []).filter(node => stopped.includes(String(node.status).toLowerCase()))
      .map(node => node.metadata?.error ?? node.metadata?.status_message)
      .filter(cause => cause !== undefined && cause !== null && cause !== '')
  }
  const detail = causes.map(cause => typeof cause === 'string' ? cause : JSON.stringify(cause)).join('; ')
  const message = `The Researcher turn stopped with status ${status}: ${detail || 'no stored failure cause'}`
  // A missing cause or any application failure still counts as a failed run.
  return causes.length > 0 && causes.every(isProviderStop) ? new ProviderStopped(message) : new Error(message)
}
