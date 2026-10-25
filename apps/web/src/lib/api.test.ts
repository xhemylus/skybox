import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpError, handleRouteError } from "./api";

async function body(res: Response) {
  return { status: res.status, ...(await res.json()) };
}

describe("handleRouteError", () => {
  afterEach(() => vi.restoreAllMocks());

  it("passes through user-facing HttpErrors", async () => {
    expect(await body(handleRouteError(new HttpError("Nope", 403)))).toMatchObject({
      status: 403,
      error: "Nope",
    });
  });

  it("maps auth errors", async () => {
    expect((await body(handleRouteError(new Error("UNAUTHORIZED")))).status).toBe(401);
    expect((await body(handleRouteError(new Error("NO_TEAM")))).status).toBe(403);
  });

  it("maps invalid JSON and invalid UUIDs", async () => {
    expect((await body(handleRouteError(new SyntaxError("bad json")))).status).toBe(400);
    const pgErr = Object.assign(new Error('invalid input syntax for type uuid: "x"'), {
      code: "22P02",
    });
    expect((await body(handleRouteError(pgErr))).status).toBe(404);
  });

  it("never leaks internal error messages", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await body(
      handleRouteError(new Error('duplicate key value violates unique constraint "users_pkey"')),
    );
    expect(res).toEqual({ status: 500, error: "Erreur serveur" });
  });
});
