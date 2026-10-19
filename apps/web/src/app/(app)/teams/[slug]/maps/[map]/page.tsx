import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { TeamMapScout } from "@/components/TeamMapScout";
import { getSessionUser } from "@/lib/auth";
import { mapLabel } from "@/lib/format";
import { decodeTeamSlug, teamSlug } from "@/lib/teamIdentity";
import { loadTeamMapScout } from "@/lib/teamStats";
import { normalizeMapName } from "@skybox/shared";

export default async function TeamMapScoutPage({
  params,
}: {
  params: Promise<{ slug: string; map: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.team) redirect("/team");

  const { slug, map: mapParam } = await params;
  const teamName = decodeTeamSlug(slug);
  const mapName = normalizeMapName(decodeURIComponent(mapParam));
  if (!teamName || !mapName || mapName === "unknown") notFound();

  const scout = await loadTeamMapScout(user.team.id, teamName, mapName);
  if (!scout) notFound();

  const rounds = scout.rounds.map((r) => ({
    ...r,
    createdAt: new Date(r.createdAt),
  }));

  return (
    <div className="h-full overflow-y-auto">
      <div className="page-shell space-y-6">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Link href="/teams" className="text-[var(--muted)] hover:text-[var(--text)]">
            Teams
          </Link>
          <span className="text-[var(--border-strong)]">/</span>
          <Link
            href={`/teams/${teamSlug(scout.teamName)}`}
            className="text-[var(--muted)] hover:text-[var(--text)]"
          >
            {scout.teamName}
          </Link>
          <span className="text-[var(--border-strong)]">/</span>
          <span className="text-[var(--text)]">{mapLabel(mapName)}</span>
        </div>

        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="section-label mb-2">Scout map</p>
            <h1 className="page-title">
              {scout.teamName}
              <span className="mx-3 font-sans text-lg text-[var(--muted)]">·</span>
              {mapLabel(mapName)}
            </h1>
            <p className="muted mt-2 text-sm">
              {scout.matchCount} map{scout.matchCount > 1 ? "s" : ""} · {scout.rounds.length} rounds —
              filtre pistols, fulls, sides pour voir les tendances de starts
            </p>
          </div>
          <div className="h-14 w-14 overflow-hidden border border-[var(--border)] bg-[var(--bg-elevated)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/maps/${mapName}.png`}
              alt=""
              className="h-full w-full object-cover opacity-70 grayscale"
            />
          </div>
        </header>

        <TeamMapScout teamName={scout.teamName} mapLabel={mapLabel(mapName)} rounds={rounds} />
      </div>
    </div>
  );
}
