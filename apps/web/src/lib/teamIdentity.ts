export function normalizeTeamKey(name: string | null | undefined): string {
  return (name ?? "").trim().toLowerCase();
}

export function teamSlug(name: string): string {
  return encodeURIComponent(name.trim());
}

export function decodeTeamSlug(slug: string): string {
  try {
    return decodeURIComponent(slug).trim();
  } catch {
    return slug.trim();
  }
}

export function isLinkableTeamName(name: string | null | undefined): boolean {
  if (!name?.trim()) return false;
  return !/^(team alpha|team bravo|équipe a|équipe b)$/i.test(name.trim());
}

export function teamHref(name: string | null | undefined): string | null {
  if (!isLinkableTeamName(name)) return null;
  return `/teams/${teamSlug(name!.trim())}`;
}
