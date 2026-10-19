"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type NavItem = { href: string; label: string; icon: React.ReactNode; match: (p: string) => boolean };
type NavSection = { title: string; items: NavItem[] };

const ROLE_LABEL: Record<string, string> = {
  player: "Joueur",
  coach: "Coach",
  manager: "Manager",
  admin: "Admin",
};

const SECTIONS: NavSection[] = [
  {
    title: "Revue",
    items: [
      {
        href: "/dashboard",
        label: "Matchs",
        icon: <ListIcon />,
        match: (p) => p === "/dashboard" || /^\/m\//.test(p),
      },
    ],
  },
  {
    title: "Analyse",
    items: [
      {
        href: "/stats",
        label: "Stats joueurs",
        icon: <ChartIcon />,
        match: (p) => p === "/stats" || /^\/players\//.test(p),
      },
      {
        href: "/teams",
        label: "Adversaires",
        icon: <TeamsIcon />,
        match: (p) => p === "/teams" || p.startsWith("/teams/"),
      },
      {
        href: "/team",
        label: "Mon équipe",
        icon: <TeamIcon />,
        match: (p) => p === "/team",
      },
    ],
  },
];

export function AppSidebar({
  userName,
  avatarUrl,
  teamName,
  role,
}: {
  userName: string;
  avatarUrl?: string | null;
  teamName: string | null;
  role: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem("sidebar-collapsed") === "1");
  }, []);

  function toggle() {
    setCollapsed((c) => {
      localStorage.setItem("sidebar-collapsed", c ? "0" : "1");
      return !c;
    });
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const roleLabel = role ? (ROLE_LABEL[role] ?? role) : null;

  return (
    <aside
      className={`flex h-screen shrink-0 flex-col border-r border-[var(--border)] bg-[color-mix(in_oklab,var(--bg-panel)_92%,transparent)] transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        collapsed ? "w-[64px]" : "w-[228px]"
      }`}
    >
      <div className="flex items-start justify-between px-5 pt-6 pb-8">
        <Link
          href="/dashboard"
          className="font-display text-[1.85rem] leading-none tracking-tight text-[var(--text)] transition-opacity hover:opacity-80"
        >
          {collapsed ? (
            <span className="italic">D</span>
          ) : (
            <span className="flex flex-col gap-0.5">
              <span>
                Demo<span className="italic text-[var(--accent)]">Reviewer</span>
              </span>
              <span className="font-sans text-[10px] font-medium tracking-[0.14em] text-[var(--muted)] uppercase">
                v.0.1
              </span>
            </span>
          )}
        </Link>
        {!collapsed && (
          <button
            className="mt-1 text-[var(--muted)] transition-colors hover:text-[var(--text)]"
            onClick={toggle}
            title="Réduire"
          >
            <CollapseIcon />
          </button>
        )}
      </div>
      {collapsed && (
        <button
          className="mx-auto mb-6 text-[var(--muted)] transition-colors hover:text-[var(--text)]"
          onClick={toggle}
          title="Déplier"
        >
          <CollapseIcon flipped />
        </button>
      )}

      <nav className="flex-1 space-y-6 overflow-y-auto px-3">
        {SECTIONS.map((section) => (
          <div key={section.title}>
            {!collapsed && (
              <div className="section-label mb-2.5 flex items-center gap-2 px-2.5">
                <span>{section.title}</span>
                <span className="h-px flex-1 bg-[var(--border)]" />
              </div>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active = item.match(pathname);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={item.label}
                    className={`relative flex items-center gap-3 rounded-[var(--radius)] px-2.5 py-2 text-[13px] transition-colors duration-200 ${
                      active
                        ? "bg-[var(--bg-hover)] text-[var(--text)]"
                        : "text-[var(--muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
                    } ${collapsed ? "justify-center" : ""}`}
                  >
                    {active && (
                      <span className="absolute top-2 bottom-2 left-0 w-px bg-[var(--accent)]" />
                    )}
                    <span className="shrink-0 opacity-80">{item.icon}</span>
                    {!collapsed && <span className="font-medium tracking-wide">{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="space-y-3 p-3">
        <Link
          href="/dashboard#upload"
          className={`btn btn-ghost w-full ${collapsed ? "px-0" : ""}`}
          title="Importer une démo"
        >
          <UploadIcon />
          {!collapsed && "Importer"}
        </Link>
        <div className="relative border-t border-[var(--border)] pt-3">
          <button
            className={`flex w-full items-center gap-2.5 rounded-[var(--radius)] p-1.5 text-left transition-colors hover:bg-[var(--bg-hover)] ${collapsed ? "justify-center" : ""}`}
            onClick={() => setMenuOpen((o) => !o)}
          >
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt=""
                className="h-8 w-8 shrink-0 rounded-full border border-[var(--border)] object-cover"
              />
            ) : (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] text-[10px] font-medium tracking-wider uppercase text-[var(--accent)]">
                {userName.slice(0, 2)}
              </span>
            )}
            {!collapsed && (
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium tracking-wide">{userName}</span>
                <span className="block truncate text-[11px] text-[var(--muted)]">
                  {teamName ?? "Sans équipe"}
                  {roleLabel ? ` · ${roleLabel}` : ""}
                </span>
              </span>
            )}
            {!collapsed && <span className="text-[var(--muted)]">⋮</span>}
          </button>
          {menuOpen && (
            <div className="absolute bottom-12 left-0 z-50 w-48 border border-[var(--border)] bg-[var(--bg-elevated)] p-1 shadow-[0_16px_40px_rgba(0,0,0,0.45)]">
              <Link
                href="/team"
                className="block rounded-[var(--radius)] px-3 py-2 text-sm text-[var(--muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
                onClick={() => setMenuOpen(false)}
              >
                Mon équipe
              </Link>
              <button
                className="block w-full rounded-[var(--radius)] px-3 py-2 text-left text-sm text-[var(--danger)] transition-colors hover:bg-[var(--bg-hover)]"
                onClick={logout}
              >
                Se déconnecter
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

function ListIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M5 4h9M5 8h9M5 12h9M2 4h.01M2 8h.01M2 12h.01" strokeLinecap="round" />
    </svg>
  );
}
function ChartIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M2.5 13.5h11M4.5 11V7M8 11V3.5M11.5 11V8.5" strokeLinecap="round" />
    </svg>
  );
}
function TeamIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="6" cy="5.5" r="2.25" />
      <path d="M1.75 13c.5-2.3 2.2-3.5 4.25-3.5s3.75 1.2 4.25 3.5M10.5 3.5a2.25 2.25 0 010 4.4M12 9.7c1.2.5 2 1.6 2.25 3.3" strokeLinecap="round" />
    </svg>
  );
}
function TeamsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M2.5 13.5V4.5L8 2l5.5 2.5v9L8 14.5 2.5 13.5z" strokeLinejoin="round" />
      <path d="M8 2v12.5M2.5 4.5L8 7l5.5-2.5" strokeLinejoin="round" />
    </svg>
  );
}
function UploadIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 10.5V2.5M4.75 5.5L8 2.25l3.25 3.25M2.5 10.5v2.25c0 .4.35.75.75.75h9.5c.4 0 .75-.35.75-.75V10.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function CollapseIcon({ flipped }: { flipped?: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" style={{ transform: flipped ? "scaleX(-1)" : undefined }}>
      <path d="M2.5 2.5v11M10 4.5L6.5 8l3.5 3.5M6.5 8h7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
