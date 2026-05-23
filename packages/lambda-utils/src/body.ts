/** Safely parse a JSON request body; returns null on absence or invalid JSON. */
export function parseBody(body: string | undefined): Record<string, unknown> | null {
  if (!body) return null
  try {
    const parsed = JSON.parse(body) as unknown
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}
