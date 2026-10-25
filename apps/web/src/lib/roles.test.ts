import { describe, expect, it } from "vitest";
import type { TeamRole } from "@skybox/shared";
import { canAssignRole, canManageMember, canManageTeam, rolesAssignableBy } from "./roles";

const ALL: TeamRole[] = ["player", "manager", "coach", "admin"];

describe("roles", () => {
  it("only admins can grant admin", () => {
    expect(canAssignRole("admin", "admin")).toBe(true);
    expect(canAssignRole("coach", "admin")).toBe(false);
    expect(canAssignRole("manager", "admin")).toBe(false);
  });

  it("nobody can grant a role above their own", () => {
    expect(canAssignRole("manager", "coach")).toBe(false);
    expect(canAssignRole("player", "manager")).toBe(false);
    expect(canAssignRole("coach", "coach")).toBe(true);
  });

  it("players cannot manage the team or any member", () => {
    expect(canManageTeam("player")).toBe(false);
    for (const target of ALL) expect(canManageMember("player", target)).toBe(false);
  });

  it("non-admins cannot touch admins or higher-ranked members", () => {
    expect(canManageMember("coach", "admin")).toBe(false);
    expect(canManageMember("manager", "coach")).toBe(false);
    expect(canManageMember("coach", "manager")).toBe(true);
    expect(canManageMember("admin", "admin")).toBe(true);
  });

  it("lists assignable roles", () => {
    expect(rolesAssignableBy("admin")).toEqual(ALL);
    expect(rolesAssignableBy("coach")).toEqual(["player", "manager", "coach"]);
    expect(rolesAssignableBy("player")).toEqual(["player"]);
  });
});
