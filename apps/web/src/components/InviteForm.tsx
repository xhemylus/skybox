"use client";

import { FormEvent, useMemo, useState } from "react";
import type { TeamRole } from "@skybox/shared";

const ROLE_OPTIONS: { value: TeamRole; label: string }[] = [
  { value: "player", label: "Joueur" },
  { value: "manager", label: "Manager" },
  { value: "coach", label: "Coach" },
  { value: "admin", label: "Admin" },
];

export function InviteForm({ actorRole }: { actorRole: TeamRole }) {
  const assignable = useMemo(() => {
    const rank: Record<TeamRole, number> = {
      player: 1,
      manager: 2,
      coach: 3,
      admin: 4,
    };
    return ROLE_OPTIONS.filter((r) => {
      if (r.value === "admin") return actorRole === "admin";
      return rank[actorRole] >= rank[r.value];
    });
  }, [actorRole]);

  const [steamId, setSteamId] = useState("");
  const [role, setRole] = useState<TeamRole>("player");
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setUrl(null);
    setCopied(false);
    const res = await fetch("/api/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ steamId: steamId.trim() || undefined, role }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Erreur");
      return;
    }
    setUrl(data.url);
    setSteamId("");
  }

  async function copyLink() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Impossible de copier — sélectionne le lien manuellement.");
    }
  }

  return (
    <div className="panel p-6">
      <p className="section-label">Invitations</p>
      <h2 className="page-title mt-2 text-[1.35rem]">Inviter un membre</h2>
      <p className="muted mt-2 text-sm leading-relaxed">
        SteamID64 optionnel pour réserver l&apos;invite. Sinon, partage le lien — le premier compte Steam
        qui l&apos;accepte rejoint l&apos;équipe.
      </p>
      <form className="mt-5 space-y-3" onSubmit={onSubmit}>
        <input
          className="input"
          type="text"
          placeholder="7656119… ou URL profil (optionnel)"
          value={steamId}
          onChange={(e) => setSteamId(e.target.value)}
        />
        <select
          className="input"
          value={role}
          onChange={(e) => setRole(e.target.value as TeamRole)}
        >
          {assignable.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <button className="btn btn-primary" type="submit">
          Créer l&apos;invitation
        </button>
      </form>
      {url && (
        <div className="mt-4 space-y-2 border border-[color-mix(in_oklab,var(--accent)_25%,var(--border))] bg-[color-mix(in_oklab,var(--accent)_5%,transparent)] px-3 py-3">
          <p className="break-all text-sm text-[var(--accent)]">{url}</p>
          <button type="button" className="btn btn-ghost h-8 text-xs" onClick={copyLink}>
            {copied ? "Copié ✓" : "Copier le lien"}
          </button>
        </div>
      )}
      {error && <p className="mt-3 text-sm text-[var(--danger)]">{error}</p>}
    </div>
  );
}
