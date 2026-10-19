/**
 * Safe relative path for post-login redirects.
 * Rejects protocol-relative URLs (//evil.com), backslashes, and absolute URLs.
 */
export function isSafeRelativePath(path: string | null | undefined): boolean {
  if (!path) return false;
  if (path.length > 512) return false;
  if (!path.startsWith("/")) return false;
  if (path.startsWith("//")) return false;
  if (path.includes("\\")) return false;
  if (path.includes("://")) return false;
  if (/[\r\n\0]/.test(path)) return false;
  return true;
}

export function safeRedirectPath(
  path: string | null | undefined,
  fallback = "/dashboard",
): string {
  return isSafeRelativePath(path) ? path! : fallback;
}
