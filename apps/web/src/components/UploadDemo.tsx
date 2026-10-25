"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type JobStatus = "queued" | "uploading" | "done" | "error" | "duplicate";

type UploadJob = {
  id: string;
  file: File;
  status: JobStatus;
  progress: number;
  error?: string;
  matchId?: string;
};

const ACCEPT_EXT = [".dem", ".dem.zst", ".dem.gz", ".zst", ".gz"];
/** Files go straight to object storage, so the web server isn't the bottleneck anymore. */
const CONCURRENCY = 2;

function isDemoFile(name: string) {
  const n = name.toLowerCase();
  return ACCEPT_EXT.some((ext) => n.endsWith(ext));
}

type UploadResult =
  | { ok: true; matchId?: string }
  | { ok: false; status: number; error: string; matchId?: string };

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

function putToStorage(
  url: string,
  headers: Record<string, string>,
  file: File,
  onProgress: (pct: number) => void,
): Promise<boolean> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
    xhr.onerror = () => resolve(false);
    xhr.send(file);
  });
}

/** Presign → PUT straight to storage → register the match. */
async function uploadOne(file: File, onProgress: (pct: number) => void): Promise<UploadResult> {
  try {
    const presign = await postJson("/api/matches/uploads", { filename: file.name, size: file.size });
    if (!presign.res.ok) {
      return { ok: false, status: presign.res.status, error: presign.data.error ?? "Upload refusé" };
    }

    const { uploadId, url, headers } = presign.data as {
      uploadId: string;
      url: string;
      headers: Record<string, string>;
    };
    // Keep the last 1% for the registration call
    const sent = await putToStorage(url, headers, file, (pct) => onProgress(Math.min(pct, 99)));
    if (!sent) {
      return { ok: false, status: 0, error: "Envoi vers le stockage échoué (réseau ou CORS)" };
    }

    const done = await postJson("/api/matches", { uploadId, filename: file.name });
    if (!done.res.ok) {
      return {
        ok: false,
        status: done.res.status,
        error: done.data.error ?? "Upload échoué",
        matchId: done.data.matchId,
      };
    }
    return { ok: true, matchId: done.data.match?.id };
  } catch {
    return { ok: false, status: 0, error: "Erreur réseau" };
  }
}

export function UploadDemo() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const busy = jobs.some((j) => j.status === "queued" || j.status === "uploading");

  function patchJob(id: string, patch: Partial<UploadJob>) {
    setJobs((list) => list.map((j) => (j.id === id ? { ...j, ...patch } : j)));
  }

  async function runQueue(initial: UploadJob[]) {
    setJobs(initial);
    let cursor = 0;
    let refreshed = false;

    async function worker() {
      while (true) {
        const index = cursor++;
        if (index >= initial.length) return;
        const job = initial[index];
        patchJob(job.id, { status: "uploading", progress: 0 });
        const result = await uploadOne(job.file, (pct) => patchJob(job.id, { progress: pct }));
        if (result.ok) {
          patchJob(job.id, { status: "done", progress: 100, matchId: result.matchId, error: undefined });
          refreshed = true;
        } else if (result.status === 409) {
          patchJob(job.id, {
            status: "duplicate",
            progress: 100,
            error: result.error,
            matchId: result.matchId,
          });
        } else {
          patchJob(job.id, { status: "error", error: result.error });
        }
      }
    }

    const workers = Array.from({ length: Math.min(CONCURRENCY, initial.length) }, () => worker());
    await Promise.all(workers);
    if (refreshed) router.refresh();
  }

  function enqueue(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => isDemoFile(f.name));
    if (!list.length) {
      setJobs([
        {
          id: crypto.randomUUID(),
          file: new File([], "invalid"),
          status: "error",
          progress: 0,
          error: "Aucun fichier .dem / .dem.zst / .dem.gz valide",
        },
      ]);
      return;
    }
    if (busy) return;

    const next: UploadJob[] = list.map((file) => ({
      id: crypto.randomUUID(),
      file,
      status: "queued" as const,
      progress: 0,
    }));
    void runQueue(next);
  }

  const done = jobs.filter((j) => j.status === "done").length;
  const failed = jobs.filter((j) => j.status === "error" || j.status === "duplicate").length;
  const total = jobs.length;
  const overall =
    total === 0
      ? null
      : Math.round(jobs.reduce((sum, j) => sum + (j.status === "queued" ? 0 : j.progress), 0) / total);

  return (
    <div
      id="upload"
      className={`panel space-y-4 border-dashed p-6 transition-colors duration-300 ${
        dragOver
          ? "border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_5%,var(--bg-panel))]"
          : ""
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files.length) enqueue(e.dataTransfer.files);
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-[15px] font-medium tracking-wide">Uploader des démos</div>
          <div className="muted mt-1 text-sm">
            .dem / .dem.zst / .dem.gz — plusieurs fichiers OK, les doublons sont détectés à
            l&apos;analyse
          </div>
        </div>
        <div className="flex items-center gap-4">
          {busy && overall != null && (
            <div className="flex items-center gap-3">
              <div className="h-px w-44 overflow-hidden bg-[var(--border)]">
                <div
                  className="h-full bg-[var(--accent)] transition-[width] duration-300"
                  style={{ width: `${overall}%` }}
                />
              </div>
              <span className="w-28 text-sm text-[var(--muted)] tabular-nums">
                {done}/{total} · {overall}%
              </span>
            </div>
          )}
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            Choisir des fichiers
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".dem,.zst,.gz"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) enqueue(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {jobs.length > 0 && (
        <ul className="space-y-2 border-t border-[var(--border)] pt-4">
          {jobs.map((j) => (
            <li key={j.id} className="flex flex-wrap items-center gap-3 text-sm">
              <span className="min-w-0 flex-1 truncate font-medium tracking-wide">{j.file.name || "—"}</span>
              <StatusLabel job={j} />
              {(j.status === "uploading" || j.status === "queued") && (
                <span className="w-12 text-right tabular-nums text-[var(--muted)]">
                  {j.status === "queued" ? "…" : `${j.progress}%`}
                </span>
              )}
              {j.matchId && (j.status === "done" || j.status === "duplicate") && (
                <Link href={`/m/${j.matchId}`} className="text-[var(--accent)] hover:underline">
                  Ouvrir
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}

      {!busy && total > 0 && (
        <p className="muted text-xs">
          {done} importé{done > 1 ? "s" : ""}
          {failed ? ` · ${failed} ignoré${failed > 1 ? "s" : ""} / en erreur` : ""}
        </p>
      )}
    </div>
  );
}

function StatusLabel({ job }: { job: UploadJob }) {
  if (job.status === "queued") return <span className="text-[var(--muted)]">En file</span>;
  if (job.status === "uploading") return <span className="text-[var(--accent)]">Envoi…</span>;
  if (job.status === "done") return <span className="text-[var(--text)]">OK</span>;
  if (job.status === "duplicate") {
    return <span className="text-[var(--t)]" title={job.error}>{job.error ?? "Doublon"}</span>;
  }
  return <span className="text-[var(--danger)]">{job.error ?? "Erreur"}</span>;
}
