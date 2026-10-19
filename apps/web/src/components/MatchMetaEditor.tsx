"use client";

import { FormEvent, useEffect, useState } from "react";

export type MatchMeta = {
  id: string;
  teamAName: string | null;
  teamBName: string | null;
  tournament: string | null;
  tags: string[] | null;
  notes: string | null;
  filename: string;
};

export function MatchMetaEditor({
  match,
  open,
  onClose,
  onSaved,
}: {
  match: MatchMeta | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [teamAName, setTeamAName] = useState("");
  const [teamBName, setTeamBName] = useState("");
  const [tournament, setTournament] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!match || !open) return;
    setTeamAName(match.teamAName ?? "");
    setTeamBName(match.teamBName ?? "");
    setTournament(match.tournament ?? "");
    setTagsText((match.tags ?? []).join(", "));
    setNotes(match.notes ?? "");
    setError(null);
  }, [match, open]);

  if (!open || !match) return null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const tags = tagsText
        .split(/[,;\n]/)
        .map((t) => t.trim())
        .filter(Boolean);
      const res = await fetch(`/api/matches/${match!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamAName: teamAName.trim() || undefined,
          teamBName: teamBName.trim() || undefined,
          tournament: tournament.trim() || null,
          tags,
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur");
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-black/70" aria-label="Fermer" onClick={onClose} />
      <div className="panel relative z-10 w-full max-w-lg px-6 py-6 shadow-[0_24px_60px_rgba(0,0,0,0.55)]">
        <p className="section-label">Métadonnées</p>
        <h2 className="page-title mt-1 text-[1.4rem]">Éditer le match</h2>
        <p className="muted mt-1 truncate text-xs" title={match.filename}>
          {match.filename}
        </p>

        <form className="mt-5 space-y-4" onSubmit={onSubmit}>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-[11px] font-medium tracking-[0.1em] text-[var(--muted)] uppercase">
              Équipe A
              <input
                className="input mt-1.5"
                value={teamAName}
                onChange={(e) => setTeamAName(e.target.value)}
                placeholder="Team Alpha"
                required
              />
            </label>
            <label className="block text-[11px] font-medium tracking-[0.1em] text-[var(--muted)] uppercase">
              Équipe B
              <input
                className="input mt-1.5"
                value={teamBName}
                onChange={(e) => setTeamBName(e.target.value)}
                placeholder="Team Bravo"
                required
              />
            </label>
          </div>

          <label className="block text-[11px] font-medium tracking-[0.1em] text-[var(--muted)] uppercase">
            Tournoi / événement
            <input
              className="input mt-1.5"
              value={tournament}
              onChange={(e) => setTournament(e.target.value)}
              placeholder="BLAST Open, Scrim interne…"
            />
          </label>

          <label className="block text-[11px] font-medium tracking-[0.1em] text-[var(--muted)] uppercase">
            Tags
            <input
              className="input mt-1.5"
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="scrim, veto, review, bo3…"
            />
            <span className="muted mt-1 block normal-case tracking-normal">
              Séparés par des virgules
            </span>
          </label>

          <label className="block text-[11px] font-medium tracking-[0.1em] text-[var(--muted)] uppercase">
            Notes
            <textarea
              className="input mt-1.5 min-h-[88px] resize-y"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contexte, points à revoir…"
            />
          </label>

          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
