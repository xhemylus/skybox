"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { TeamRole } from "@skybox/shared";
import { canAssignRole } from "@/lib/roles";

const ROLE_OPTIONS: { value: TeamRole; label: string }[] = [
  { value: "player", label: "Joueur" },
  { value: "manager", label: "Manager" },
  { value: "coach", label: "Coach" },
  { value: "admin", label: "Admin" },
];

export function InviteForm({ actorRole }: { actorRole: TeamRole }) {
  const router = useRouter();
  const assignable = useMemo(
    () => ROLE_OPTIONS.filter((r) => canAssignRole(actorRole, r.value)),
    [actorRole],
  );

  const [steamId, setSteamId] = useState("");
  const [role, setRole] = useState<TeamRole>("player");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function addDirect(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setOkMsg(null);
    setInviteUrl(null);
    setBusy(true);
    try {
      const res = await fetch("/api/team/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steamId: steamId.trim(), role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur");
      const name = data.member?.name || data.member?.steamId || "Membre";
      setOkMsg(`${name} ajouté à l'équipe. Il peut se connecter avec Steam tout de suite.`);
      setSteamId("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function createInviteLink() {
    setError(null);
    setOkMsg(null);
    setInviteUrl(null);
    setBusy(true);
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          steamId: steamId.trim() || undefined,
          role,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur");
      setInviteUrl(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Impossible de copier — sélectionne le lien manuellement.");
    }
  }

  return (
    <div className="panel p-6">
      <p className="section-label">Roster</p>
      <h2 className="page-title mt-2 text-[1.35rem]">Ajouter un membre</h2>
      <p className="muted mt-2 text-sm leading-relaxed">
        Colle un SteamID64 (ou URL profil) — le joueur est dans l&apos;équipe tout de suite, sans
        accepter d&apos;invitation. Au premier login Steam, il est déjà autorisé.
      </p>
      <form className="mt-5 space-y-3" onSubmit={addDirect}>
        <input
          className="input"
          type="text"
          required
          placeholder="7656119… ou URL steamcommunity.com/profiles/…"
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
        <button className="btn btn-primary w-full" type="submit" disabled={busy}>
          {busy ? "Ajout…" : "Ajouter à l'équipe"}
        </button>
      </form>

      <div className="mt-5 border-t border-[var(--border)] pt-4">
        <p className="muted text-xs leading-relaxed">
          Alternative : lien d&apos;invitation (si tu préfères qu&apos;il clique pour rejoindre).
        </p>
        <button
          type="button"
          className="btn btn-ghost mt-2 w-full"
          disabled={busy}
          onClick={createInviteLink}
        >
          Créer un lien d&apos;invitation
        </button>
      </div>

      {okMsg && (
        <p className="mt-4 border border-[color-mix(in_oklab,var(--accent)_25%,var(--border))] bg-[color-mix(in_oklab,var(--accent)_5%,transparent)] px-3 py-2 text-sm text-[var(--accent)]">
          {okMsg}
        </p>
      )}
      {inviteUrl && (
        <div className="mt-4 space-y-2 border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-3">
          <p className="break-all text-sm text-[var(--muted)]">{inviteUrl}</p>
          <button type="button" className="btn btn-ghost h-8 text-xs" onClick={copyLink}>
            {copied ? "Copié ✓" : "Copier le lien"}
          </button>
        </div>
      )}
      {error && <p className="mt-3 text-sm text-[var(--danger)]">{error}</p>}
    </div>
  );
}
