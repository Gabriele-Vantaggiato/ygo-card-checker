export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function findDuplicateHashes(hashes: string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const h of hashes) {
    if (seen.has(h)) dupes.add(h);
    else seen.add(h);
  }
  return [...dupes];
}
