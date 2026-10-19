import { randomBytes } from "node:crypto";

/** Unambiguous alphabet for short share codes (no 0/O/1/l). Server-only. */
const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";

export function generateShareCode(length = 8): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}
