import { MIN_DEMO_BYTES } from "@skybox/shared";
import { HttpError } from "./api";
import { env } from "./env";

const DEMO_EXTENSIONS = [".dem", ".zst", ".gz"];

/** Validates name + size of a demo before it's uploaded or registered. */
export function assertValidDemo(filename: string, size: number) {
  const name = filename.toLowerCase();
  if (!DEMO_EXTENSIONS.some((ext) => name.endsWith(ext))) {
    throw new HttpError("Formats acceptés : .dem, .dem.zst, .dem.gz");
  }
  if (size > env.maxDemoSizeMb * 1024 * 1024) {
    throw new HttpError(`Fichier trop volumineux (max ${env.maxDemoSizeMb} Mo)`);
  }
  if (size < MIN_DEMO_BYTES) {
    throw new HttpError("Fichier trop petit pour être une démo CS2 complète.");
  }
}

/**
 * Storage key for an uploaded demo. Always derived server-side from the caller's
 * team, so a client can never point a match at another team's object.
 */
export function demoKeyFor(teamId: string, matchId: string, filename: string) {
  const safeName =
    filename
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .replace(/^\.+/, "")
      .slice(0, 180) || "demo.dem";
  return `demos/${teamId}/${matchId}/${safeName}`;
}
