"use client";

import { use } from "react";

const ERRORS: Record<string, string> = {
  unauthorized:
    "Compte Steam non autorisé. Demande une invitation à un admin de l'équipe.",
  invite_invalid: "Invitation invalide ou expirée.",
  invite_mismatch: "Cette invitation est réservée à un autre compte Steam.",
  steam_failed: "Connexion Steam échouée. Réessaie.",
  rate_limited: "Trop de tentatives — attends une minute puis réessaie.",
  invalid: "Connexion invalide. Réessaie.",
};

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; invite?: string }>;
}) {
  const { error: errorParam, invite } = use(searchParams);
  const error = errorParam ? (ERRORS[errorParam] ?? ERRORS.invalid) : null;
  const href = invite ? `/api/auth/steam?invite=${encodeURIComponent(invite)}` : "/api/auth/steam";

  return (
    <div className="relative flex min-h-screen flex-col justify-center px-6">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-[-20%] left-1/2 h-[70vh] w-[70vw] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(201,184,150,0.09),transparent_65%)]" />
      </div>

      <div className="relative mx-auto w-full max-w-md">
        <p className="font-display text-5xl italic tracking-tight text-[var(--text)]">
          Demo<span className="text-[var(--accent)]">Reviewer</span>
        </p>
        <p className="mt-2 text-[11px] font-medium tracking-[0.16em] text-[var(--muted)] uppercase">
          v.0.1
        </p>
        <p className="mt-3 text-[11px] font-medium tracking-[0.22em] text-[var(--accent)] uppercase">
          Demoreview privée
        </p>
        <h1 className="page-title mt-8">Connexion</h1>
        <p className="muted mt-2 max-w-sm text-sm leading-relaxed">
          Accès sur invitation. Connecte-toi avec ton compte Steam pour rejoindre l&apos;équipe.
        </p>

        <a href={href} className="btn btn-primary mt-8 w-full gap-3">
          <SteamIcon />
          Continuer avec Steam
        </a>

        {error && (
          <p className="mt-6 border border-[color-mix(in_oklab,var(--danger)_35%,var(--border))] px-4 py-3 text-sm text-[var(--danger)]">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function SteamIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 0C5.4 0 0 5.4 0 12c0 5.5 3.7 10.1 8.7 11.5l3.5-5.1c-.5-.1-1-.2-1.5-.2-2.9 0-5.2-2.3-5.2-5.2 0-.3 0-.6.1-.9L2 9.6v.1C2.5 5.4 6.8 2 12 2c5.5 0 10 4.5 10 10s-4.5 10-10 10c-.4 0-.7 0-1.1-.1l-1.6 2.4c.9.2 1.8.3 2.7.3 6.6 0 12-5.4 12-12S18.6 0 12 0zm-3.4 17.6-2.1.9c-.8-.5-1.4-1.2-1.7-2.1l2.2-.9c.4.9 1.2 1.6 2.1 2.1h-.5zm8.3-4.1c0 2.3-1.9 4.2-4.2 4.2-1.8 0-3.3-1.1-3.9-2.7l2.3-1c.3.7.9 1.2 1.7 1.2 1 0 1.8-.8 1.8-1.8s-.8-1.8-1.8-1.8c-.3 0-.6.1-.9.2L9.1 9.4c.6-.4 1.3-.6 2-.6 2.3 0 4.2 1.9 4.2 4.2.1.2.1.3.1.5z" />
      <circle cx="16.9" cy="7.1" r="2.4" />
    </svg>
  );
}
