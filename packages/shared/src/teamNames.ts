/** Clan / team labels that are noise in demos (MM, empty slots, side names). */
const GENERIC = new Set([
  "",
  "unnamed",
  "unassigned",
  "team",
  "team_",
  "ct",
  "t",
  "counter-terrorist",
  "counter-terrorists",
  "terrorist",
  "terrorists",
  "spectator",
  "spectators",
]);

export function isGenericTeamName(name: string | null | undefined): boolean {
  if (name == null) return true;
  const n = name.trim().toLowerCase().replace(/^team[_\s-]+/i, "team ");
  if (!n || n.length < 2) return true;
  if (GENERIC.has(n)) return true;
  if (/^team\s*[a-z0-9]?$/i.test(n)) return true;
  return false;
}

export function cleanTeamName(name: string): string {
  return name
    .trim()
    .replace(/^team[_/\s-]+/i, "")
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function titleCaseTeam(name: string): string {
  const cleaned = cleanTeamName(name);
  if (!cleaned) return cleaned;
  // Keep known all-caps short tags (G2, NaVi-ish) mostly as-is if already mixed
  if (/^[A-Z0-9 .'-]{2,8}$/.test(cleaned) && cleaned === cleaned.toUpperCase()) {
    return cleaned;
  }
  return cleaned
    .split(" ")
    .map((w) => (w.length <= 3 && w === w.toUpperCase() ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

/**
 * Guess opposing team names from a demo filename.
 * Handles FACEIT / HLTV-ish patterns: `A-vs-B`, `A_vs_B`, trailing `-m1-mirage`, etc.
 */
export function guessTeamsFromFilename(
  filename: string | null | undefined,
): { a: string; b: string } | null {
  if (!filename) return null;
  let base = filename.replace(/^.*[\\/]/, "");
  base = base.replace(/\.(dem(\.(zst|gz))?|zst|gz)$/i, "");

  // Strip leading service / date / id prefixes
  base = base.replace(/^(faceit|esea|pug|scrim|match)[_-]+/i, "");
  base = base.replace(/^\d{6,14}[_-]+/g, "");
  base = base.replace(/^[0-9a-f]{8}[-_]+/i, "");

  const vs = base.match(
    /^(.+?)[\s._-]+vs[\s._-]+(.+?)(?:[\s._-]+(?:m\d+|bo\d+|map\d+|de_[a-z0-9]+|[a-z]{3,12}))*$/i,
  );
  if (!vs) return null;

  let a = titleCaseTeam(vs[1].replace(/[-_]+/g, " "));
  let b = titleCaseTeam(vs[2].replace(/[-_]+/g, " "));
  // Trim leftover map tokens stuck on B
  b = b.replace(/\s+(de\s+)?(ancient|anubis|cache|dust2|dust\s*ii|inferno|mirage|nuke|overpass|train|vertigo)$/i, "").trim();

  if (isGenericTeamName(a) || isGenericTeamName(b) || a.toLowerCase() === b.toLowerCase()) {
    return null;
  }
  if (a.length < 2 || b.length < 2 || a.length > 40 || b.length > 40) return null;
  return { a, b };
}

/** Majority-vote clan name for a side from raw labels. */
export function pickClanName(labels: string[]): string | null {
  const counts = new Map<string, number>();
  for (const raw of labels) {
    const cleaned = cleanTeamName(raw);
    if (isGenericTeamName(cleaned)) continue;
    const key = cleaned.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [key, n] of counts) {
    if (n > bestN) {
      bestN = n;
      best = key;
    }
  }
  if (!best) return null;
  // Restore a representative casing from inputs
  for (const raw of labels) {
    const cleaned = cleanTeamName(raw);
    if (cleaned.toLowerCase() === best) return titleCaseTeam(cleaned);
  }
  return titleCaseTeam(best);
}
