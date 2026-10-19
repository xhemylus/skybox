import Link from "next/link";
import { teamHref } from "@/lib/teamIdentity";

export function TeamNameLink({
  name,
  className = "",
  fallback = "—",
}: {
  name: string | null | undefined;
  className?: string;
  fallback?: string;
}) {
  const label = name?.trim() || fallback;
  const href = teamHref(name);
  if (!href) {
    return <span className={className}>{label}</span>;
  }
  return (
    <Link href={href} className={`${className} hover:text-[var(--accent)] hover:underline`}>
      {label}
    </Link>
  );
}
