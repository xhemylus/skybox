import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { teamSlug } from "@/lib/teamIdentity";
import { listTeams } from "@/lib/teamStats";

export default async function TeamsIndexPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.team) redirect("/team");

  const teams = await listTeams(user.team.id);

  return (
    <div className="h-full overflow-y-auto">
      <div className="page-shell space-y-8">
        <header>
          <p className="section-label mb-2">Analyse</p>
          <h1 className="page-title">Adversaires</h1>
          <p className="muted mt-2 max-w-xl text-sm leading-relaxed">
            Équipes vues dans vos démos. Ouvre un profil, puis une map pour le scout
            (pistols, buys, starts).
          </p>
        </header>

        {teams.length === 0 ? (
          <div className="panel px-8 py-16 text-center">
            <p className="font-display text-2xl">Aucune équipe</p>
            <p className="muted mt-2 text-sm">
              Importe des démos avec des noms d&apos;équipes pour les voir ici.
            </p>
          </div>
        ) : (
          <div className="panel overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[var(--border)] text-[10px] tracking-[0.14em] text-[var(--muted)] uppercase">
                <tr>
                  <th className="px-5 py-3.5 font-medium">Équipe</th>
                  <th className="px-3 py-3.5 text-right font-medium">Maps</th>
                  <th className="px-3 py-3.5 text-right font-medium">W–L</th>
                  <th className="px-5 py-3.5 text-right font-medium">WR</th>
                </tr>
              </thead>
              <tbody>
                {teams.map((t) => {
                  const initials = t.name
                    .split(/\s+/)
                    .map((w) => w[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase();
                  return (
                    <tr
                      key={t.name}
                      className="border-b border-[var(--border)] last:border-0 hover:bg-[color-mix(in_oklab,var(--bg-hover)_70%,transparent)]"
                    >
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/teams/${teamSlug(t.name)}`}
                          className="flex items-center gap-3 hover:text-[var(--accent)]"
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-[var(--border)] bg-[var(--bg-elevated)] text-[11px] font-medium text-[var(--accent)]">
                            {initials}
                          </span>
                          <span className="font-medium tracking-wide hover:underline">{t.name}</span>
                        </Link>
                      </td>
                      <td className="px-3 py-3.5 text-right font-mono tabular-nums">{t.matches}</td>
                      <td className="px-3 py-3.5 text-right font-mono tabular-nums text-[var(--muted)]">
                        {t.wins}–{t.losses}
                        {t.draws ? `–${t.draws}` : ""}
                      </td>
                      <td
                        className={`px-5 py-3.5 text-right font-mono tabular-nums ${
                          t.winrate >= 55
                            ? "text-[var(--accent)]"
                            : t.winrate < 45 && t.wins + t.losses > 0
                              ? "text-[var(--danger)]"
                              : ""
                        }`}
                      >
                        {t.winrate.toFixed(0)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
