/** Short map token for URLs: de_mirage → mirage (client-safe, no Node APIs). */
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
