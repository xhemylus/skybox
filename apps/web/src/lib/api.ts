import { NextResponse } from "next/server";

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function jsonError(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

/** Error whose message is safe to show to the client. */
export class HttpError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function handleRouteError(err: unknown) {
  if (err instanceof HttpError) {
    return jsonError(err.message, err.status);
  }
  if (err instanceof Error) {
    if (err.message === "UNAUTHORIZED") {
      return jsonError("Non authentifié", 401);
    }
    if (err.message === "NO_TEAM") {
      return jsonError("Aucune équipe associée", 403);
    }
    // Malformed JSON body from req.json()
    if (err instanceof SyntaxError) {
      return jsonError("Requête invalide", 400);
    }
    // Postgres invalid_text_representation, e.g. a non-UUID in /api/matches/[id]
    if ((err as { code?: string }).code === "22P02") {
      return jsonError("Introuvable", 404);
    }
  }
  // Never leak DB / storage internals to the client
  console.error("[api] unhandled error", err);
  return jsonError("Erreur serveur", 500);
}
