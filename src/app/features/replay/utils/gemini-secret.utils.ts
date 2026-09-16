const STORAGE_KEY = 'ygo-gemini-api-key.v1';

function b64(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveAesKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, [
    'deriveKey',
  ]);
  const saltCopy = new Uint8Array(salt);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltCopy, iterations: 120_000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export interface StoredGeminiSecret {
  v: 1;
  salt: string;
  iv: string;
  ciphertext: string;
}

/** Passphrase-encrypted API key blob for localStorage (not secure against XSS / same-machine attackers with the passphrase). */
export async function encryptApiKey(apiKey: string, passphrase: string): Promise<StoredGeminiSecret> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(passphrase, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: new Uint8Array(iv) },
    key,
    new TextEncoder().encode(apiKey),
  );
  return { v: 1, salt: b64(salt), iv: b64(iv), ciphertext: b64(ciphertext) };
}

export async function decryptApiKey(blob: StoredGeminiSecret, passphrase: string): Promise<string> {
  const salt = fromB64(blob.salt);
  const iv = new Uint8Array(fromB64(blob.iv));
  const key = await deriveAesKey(passphrase, salt);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    new Uint8Array(fromB64(blob.ciphertext)),
  );
  return new TextDecoder().decode(plain);
}

export function readStoredGeminiSecret(): StoredGeminiSecret | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredGeminiSecret;
    if (parsed?.v !== 1 || !parsed.salt || !parsed.iv || !parsed.ciphertext) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeStoredGeminiSecret(blob: StoredGeminiSecret): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(blob));
}

export function clearStoredGeminiSecret(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function hasStoredGeminiSecret(): boolean {
  return !!readStoredGeminiSecret();
}
