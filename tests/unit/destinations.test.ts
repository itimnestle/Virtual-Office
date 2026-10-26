import { describe, expect, it } from "vitest";
import { NAV, navFor } from "@/lib/rbac";
import { SPOT_ROUTE, navKeyForPath, spotForNavKey, type SpotKey } from "@/lib/office/destinations";

describe("3D office destinations", () => {
  it("maps pages, including nested ones, to the right window", () => {
    expect(navKeyForPath("/office", NAV)).toBeNull();
    expect(navKeyForPath("/tasks", NAV)).toBe("tasks");
    expect(navKeyForPath("/tasks/abc/files/1", NAV)).toBe("tasks");
    expect(navKeyForPath("/meetings/xyz", NAV)).toBe("meetings");
    expect(navKeyForPath("/admin/config", NAV)).toBe("adminConfig");
    expect(navKeyForPath("/admin/health", NAV)).toBe("health");
    expect(navKeyForPath("/tasksx", NAV)).toBeNull();
  });

  it("flies the camera to the object that opened the page", () => {
    expect(spotForNavKey("dashboard")).toBe("desk");
    expect(spotForNavKey("calendar")).toBe("calendar");
    expect(spotForNavKey("adminConfig")).toBe("admin");
    expect(spotForNavKey("health")).toBe("admin");
    expect(spotForNavKey("settings")).toBeNull();
    expect(spotForNavKey(null)).toBeNull();
  });

  it("every object opens a real page, and each role only gets objects for its pages", () => {
    const keys = new Set(NAV.map((n) => n.key));
    for (const spot of Object.keys(SPOT_ROUTE) as SpotKey[]) expect(keys.has(SPOT_ROUTE[spot])).toBe(true);
    const objectsFor = (role: Parameters<typeof navFor>[0]) => {
      const allowed = new Set(navFor(role).map((n) => n.key));
      return (Object.keys(SPOT_ROUTE) as SpotKey[]).filter((s) => allowed.has(SPOT_ROUTE[s]));
    };
    expect(objectsFor("member")).not.toContain("inbox");
    expect(objectsFor("member")).not.toContain("admin");
    expect(objectsFor("manager")).toContain("inbox");
    expect(objectsFor("admin")).toContain("admin");
    expect(objectsFor("admin")).not.toContain("me");
  });
});
