"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { humanizeParseError } from "@skybox/shared";

export function ParseStatusView({
  matchId,
  status,
  error,
  progress = 0,
  stage = null,
  canReparse = false,
}: {
  matchId?: string;
  status: string;
  error: string | null;
  progress?: number;
  stage?: string | null;
  canReparse?: boolean;
}) {
  const router = useRouter();
  const waiting = status === "pending" || status === "processing";
  const [reparsing, setReparsing] = useState(false);
  const [reparseError, setReparseError] = useState<string | null>(null);

  const pct =
    status === "pending"
      ? 0
      : status === "processing"
        ? Math.max(2, Math.min(99, progress || 2))
        : progress;

  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => router.refresh(), 1500);
    return () => clearInterval(t);
  }, [waiting, router]);

  async function reparse() {
    if (!matchId || reparsing) return;
    setReparsing(true);
    setReparseError(null);
    try {
      const res = await fetch(`/api/matches/${matchId}/reparse`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Impossible de relancer l'analyse");
      router.refresh();
    } catch (err) {
      setReparseError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setReparsing(false);
    }
  }

  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="panel max-w-md px-8 py-10 text-center">
        {waiting ? (
          <>
            <p className="page-title text-[1.5rem]">
              {status === "pending" ? "En file d'attente" : "Analyse en cours"}
            </p>
            <p className="muted mt-2 text-sm leading-relaxed">
              {stage?.trim()
                ? stage
                : status === "pending"
                  ? "Le worker va prendre la démo dès qu'il est libre."
                  : "Parsing de la démo…"}
            </p>

            <div className="mt-6 text-left">
              <div className="mb-1.5 flex items-baseline justify-between text-[12px]">
                <span className="text-[var(--muted)]">Progression</span>
                <span className="font-mono tabular-nums text-[var(--text)]">{pct}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[var(--border)]">
                <div
                  className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-500 ease-out"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>

            <p className="muted mt-4 text-[11px]">
              Selon la taille de la démo et le CPU du serveur. Cette page se met à jour toute seule.
            </p>
          </>
        ) : (
          <>
            <p className="page-title text-[1.5rem]">Analyse échouée</p>
            <p className="muted mt-3 text-sm leading-relaxed break-words">
              {humanizeParseError(error)}
            </p>
            {canReparse && matchId ? (
              <button
                type="button"
                className="btn btn-primary mt-6"
                disabled={reparsing}
                onClick={reparse}
              >
                {reparsing ? "Relance…" : "Relancer l'analyse"}
              </button>
            ) : null}
            {reparseError ? (
              <p className="mt-3 text-xs text-[var(--danger)]">{reparseError}</p>
            ) : null}
          </>
        )}
        <Link href="/dashboard" className="btn btn-ghost mt-4">
          Retour aux matches
        </Link>
      </div>
    </div>
  );
}
