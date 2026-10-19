import { NextResponse } from "next/server";

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function jsonError(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export function handleRouteError(err: unknown) {
  if (err instanceof Error) {
    if (err.message === "UNAUTHORIZED") {
      return jsonError("Non authentifié", 401);
    }
    if (err.message === "NO_TEAM") {
      return jsonError("Aucune équipe associée", 403);
    }
    return jsonError(err.message, 400);
  }
  return jsonError("Erreur serveur", 500);
}
