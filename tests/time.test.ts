import { describe, expect, it } from "vitest";
import { addDays, dayBounds, inQuietHours, localDateOf, localMinutesOf, nextQuietEnd, weekStartOf, zonedToUtcMs } from "@/lib/domain/time";

describe("time & DST", () => {
  it("spring-forward day is 23 hours in the planning timezone", () => {
    const { startMs, endMs } = dayBounds("2027-03-14", "America/Chicago");
    expect((endMs - startMs) / 3_600_000).toBe(23);
  });
  it("fall-back day is 25 hours", () => {
    const { startMs, endMs } = dayBounds("2026-11-01", "America/Chicago");
    expect((endMs - startMs) / 3_600_000).toBe(25);
  });
  it("07:00 local maps to different UTC offsets either side of DST", () => {
    expect(new Date(zonedToUtcMs("2027-03-13", 420, "America/Chicago")).toISOString()).toBe("2027-03-13T13:00:00.000Z"); // CST
    expect(new Date(zonedToUtcMs("2027-03-14", 420, "America/Chicago")).toISOString()).toBe("2027-03-14T12:00:00.000Z"); // CDT
  });
  it("same instant lands on different local dates in different zones, planning zone decides", () => {
    const instant = Date.parse("2026-11-18T03:30:00Z");
    expect(localDateOf(instant, "America/Chicago")).toBe("2026-11-17");
    expect(localDateOf(instant, "Asia/Tokyo")).toBe("2026-11-18");
    expect(localMinutesOf(instant, "America/Chicago")).toBe(21 * 60 + 30);
  });
  it("quiet hours wrap past midnight", () => {
    const q = { start: "22:00", end: "07:00" };
    expect(inQuietHours(zonedToUtcMs("2026-11-17", 23 * 60, "America/Chicago"), "America/Chicago", q)).toBe(true);
    expect(inQuietHours(zonedToUtcMs("2026-11-17", 6 * 60, "America/Chicago"), "America/Chicago", q)).toBe(true);
    expect(inQuietHours(zonedToUtcMs("2026-11-17", 12 * 60, "America/Chicago"), "America/Chicago", q)).toBe(false);
    const resume = nextQuietEnd(zonedToUtcMs("2026-11-17", 23 * 60, "America/Chicago"), "America/Chicago", q);
    expect(localDateOf(resume, "America/Chicago")).toBe("2026-11-18");
    expect(localMinutesOf(resume, "America/Chicago")).toBe(7 * 60);
  });
  it("date arithmetic", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(weekStartOf("2026-11-17")).toBe("2026-11-16");
  });
});
