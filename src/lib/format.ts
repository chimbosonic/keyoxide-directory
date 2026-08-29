/**
 * Renders a fingerprint as a short key id: the last 16 hex characters, grouped
 * for readability. The directory never renders a user id, and never the full
 * fingerprint either — this is the only operator-identifying string on the page.
 */
export function shortKeyId(fingerprint: string | null): string | null {
  if (fingerprint === null) return null

  const hex = fingerprint.replace(/\s+/g, '').toUpperCase()
  if (hex.length < 16) return null

  const last16 = hex.slice(-16)
  const grouped = last16.match(/.{4}/g)?.join(' ') ?? last16
  return `0x${grouped}`
}

/** The host of a deployment URL, for a compact card title. */
export function instanceHost(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}
