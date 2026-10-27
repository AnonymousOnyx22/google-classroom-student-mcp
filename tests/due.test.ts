import { describe, it, expect, afterEach } from "vitest";
import { parseDue } from "../src/tools.js";

const work = { dueDate: { year: 2026, month: 3, day: 10 } };

describe("date only due dates", () => {
  afterEach(() => {
    delete process.env.CLASSROOM_TIMEZONE;
  });

  it("ends the day in the chosen zone", () => {
    process.env.CLASSROOM_TIMEZONE = "America/Toronto";
    expect(parseDue(work).due?.toISOString()).toBe("2026-03-11T03:59:00.000Z");
    process.env.CLASSROOM_TIMEZONE = "Asia/Tokyo";
    expect(parseDue(work).due?.toISOString()).toBe("2026-03-10T14:59:00.000Z");
  });

  it("follows daylight saving", () => {
    process.env.CLASSROOM_TIMEZONE = "America/Toronto";
    expect(parseDue({ dueDate: { year: 2026, month: 7, day: 1 } }).due?.toISOString()).toBe("2026-07-02T03:59:00.000Z");
  });

  it("falls back to a usable zone for a bad name", () => {
    process.env.CLASSROOM_TIMEZONE = "Not/AZone";
    expect(parseDue(work).due).toBeInstanceOf(Date);
  });

  it("keeps explicit times in UTC", () => {
    process.env.CLASSROOM_TIMEZONE = "America/Toronto";
    const r = parseDue({ ...work, dueTime: { hours: 15, minutes: 30 } });
    expect(r.due?.toISOString()).toBe("2026-03-10T15:30:00.000Z");
    expect(r.hasTime).toBe(true);
  });
});
