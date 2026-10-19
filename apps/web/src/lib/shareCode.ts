import { randomBytes } from "node:crypto";

/** Unambiguous alphabet for short share codes (no 0/O/1/l). */
const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";

export function generateShareCode(length = 8): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}

/** Short map token for URLs: de_mirage → mirage */
export function mapSlug(mapName: string | null | undefined): string {
  if (!mapName) return "map";
  const base = mapName
    .toLowerCase()
    .replace(/^de_/, "")
    .replace(/^cs_/, "")
    .replace(/^ar_/, "");
  const slug = base.replace(/[^a-z0-9]+/g, "");
  return slug || "map";
}
