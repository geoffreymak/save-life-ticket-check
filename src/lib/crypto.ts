/**
 * Génère un jeton aléatoire cryptographiquement sûr (anti-falsification).
 * Encodé en base36, ~160 bits d'entropie => impossible à deviner.
 */
export function randomSecret(bytes = 20): string {
  const arr = new Uint8Array(bytes)
  crypto.getRandomValues(arr)
  let out = ''
  for (const b of arr) out += b.toString(36).padStart(2, '0')
  return out
}

/** Contenu encodé dans le QR : "id.secret" (opaque, vérifié côté base). */
export function buildQrPayload(id: string, secret: string): string {
  return `${id}.${secret}`
}

export function parseQrPayload(text: string): { id: string; secret: string } | null {
  const t = (text || '').trim()
  const idx = t.indexOf('.')
  if (idx <= 0 || idx >= t.length - 1) return null
  return { id: t.slice(0, idx), secret: t.slice(idx + 1) }
}
