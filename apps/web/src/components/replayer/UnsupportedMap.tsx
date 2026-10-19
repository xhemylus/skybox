import Link from "next/link";
import { SUPPORTED_MAPS, mapDisplayName } from "@skybox/shared";

export function UnsupportedMap({ map }: { map: string }) {
  const label = mapDisplayName(map);
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="panel max-w-lg px-8 py-10 text-center">
        <p className="section-label text-[var(--accent)]">Map non supportée</p>
        <h1 className="page-title mt-3">{label}</h1>
        <p className="muted mt-3 text-sm leading-relaxed">
          La démo a bien été analysée, mais le 2D Replayer n&apos;a pas de radar pour{" "}
          <code className="border border-[var(--border)] bg-[var(--bg-hover)] px-1.5 py-0.5 text-[12px] text-[var(--text)]">
            {map}
          </code>
          .
        </p>
        <p className="section-label mt-8">Maps supportées</p>
        <ul className="mt-3 flex flex-wrap justify-center gap-1.5">
          {SUPPORTED_MAPS.map((m) => (
            <li
              key={m}
              className="border border-[var(--border)] px-2.5 py-1 text-[11px] font-medium tracking-wide text-[var(--muted)]"
            >
              {mapDisplayName(m)}
            </li>
          ))}
        </ul>
        <div className="mt-8 flex justify-center">
          <Link href="/dashboard" className="btn btn-ghost">
            Retour aux matches
          </Link>
        </div>
      </div>
    </div>
  );
}
