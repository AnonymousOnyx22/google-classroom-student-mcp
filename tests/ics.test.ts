import { describe, it, expect } from "vitest";
import { buildIcs } from "../src/core/ics.js";

/** A fixed clock, so DTSTAMP and the output stay repeatable. */
const NOW = new Date("2026-10-26T12:00:00Z");

/** Split a calendar into its content lines, with the CRLF endings removed. */
function lines(ics: string): string[] {
  expect(ics.endsWith("\r\n"), "the calendar ends with CRLF").toBe(true);
  return ics.slice(0, -2).split("\r\n");
}

/** The lines that belong to one event. */
function eventLines(ics: string): string[] {
  const all = lines(ics);
  const start = all.indexOf("BEGIN:VEVENT");
  const end = all.indexOf("END:VEVENT");
  return all.slice(start, end + 1);
}

/** Undo the RFC 5545 line folding. */
function unfold(ics: string): string {
  return ics.replace(/\r\n /g, "");
}

describe("buildIcs", () => {
  it("writes a complete calendar for one due date with no time", () => {
    const ics = buildIcs([{ title: "Essay outline", course: "English", due: new Date("2026-10-24T03:59:00Z"), dueHasTime: false }], {
      now: NOW,
      timeZone: "America/Toronto",
    });

    expect(lines(ics)).toEqual([
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//AnonymousOnyx22//google-classroom-student-mcp//EN",
      "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      expect.stringMatching(/^UID:[0-9a-f]+-0@google-classroom-student-mcp$/),
      "DTSTAMP:20261026T120000Z",
      "DTSTART;VALUE=DATE:20261023",
      "DTEND;VALUE=DATE:20261024",
      "SUMMARY:Essay outline (English)",
      "END:VEVENT",
      "END:VCALENDAR",
    ]);
  });

  it("uses the chosen zone to find the day of a date only due date", () => {
    const due = new Date("2026-10-24T03:59:00Z");
    const toronto = buildIcs([{ title: "Essay", due, dueHasTime: false }], { now: NOW, timeZone: "America/Toronto" });
    const tokyo = buildIcs([{ title: "Essay", due, dueHasTime: false }], { now: NOW, timeZone: "Asia/Tokyo" });

    expect(toronto).toContain("DTSTART;VALUE=DATE:20261023");
    expect(tokyo).toContain("DTSTART;VALUE=DATE:20261024");
  });

  it("keeps a due time in UTC and gives the event 30 minutes", () => {
    const ics = buildIcs([{ title: "Lab write up", course: "Biology", due: new Date("2026-10-23T23:59:00Z"), dueHasTime: true }], {
      now: NOW,
      timeZone: "America/Toronto",
    });

    const event = eventLines(ics);
    expect(event).toContain("DTSTART:20261023T235900Z");
    expect(event).toContain("DTEND:20261024T002900Z");
    expect(event).not.toContain("DTSTART;VALUE=DATE:20261023");
  });

  it("leaves out work with no due date and sorts the rest by due date", () => {
    const ics = buildIcs(
      [
        { title: "Later", due: new Date("2026-11-02T17:00:00Z"), dueHasTime: true },
        { title: "No date", due: null, dueHasTime: false },
        { title: "Sooner", due: new Date("2026-10-30T17:00:00Z"), dueHasTime: true },
      ],
      { now: NOW },
    );

    const summaries = lines(ics).filter((line) => line.startsWith("SUMMARY:"));
    expect(summaries).toEqual(["SUMMARY:Sooner", "SUMMARY:Later"]);
    expect(ics).not.toContain("No date");
    expect(lines(ics).filter((line) => line === "BEGIN:VEVENT")).toHaveLength(2);
  });

  it("escapes text that would break the format", () => {
    const ics = buildIcs(
      [
        {
          title: "Reading, part 1; chapters \\ 2",
          due: new Date("2026-10-30T17:00:00Z"),
          dueHasTime: true,
          description: "Bring notes.\nRead chapter 2.",
        },
      ],
      { now: NOW },
    );

    expect(ics).toContain("SUMMARY:Reading\\, part 1\\; chapters \\\\ 2");
    expect(ics).toContain("DESCRIPTION:Bring notes.\\nRead chapter 2.");
  });

  it("folds long lines at 75 bytes without splitting a character", () => {
    const title = "é".repeat(60);
    const ics = buildIcs([{ title, due: new Date("2026-10-30T17:00:00Z"), dueHasTime: true }], { now: NOW });

    for (const line of lines(ics)) {
      expect(Buffer.byteLength(line, "utf8"), `line over 75 bytes: ${line}`).toBeLessThanOrEqual(75);
    }
    const folded = lines(ics).filter((line) => line.startsWith(" "));
    expect(folded.length).toBeGreaterThan(0);
    expect(unfold(ics)).toContain(`SUMMARY:${title}`);
  });

  it("gives each event its own UID and keeps the same UID on a later run", () => {
    const items = [
      { title: "Same title", due: new Date("2026-10-30T17:00:00Z"), dueHasTime: true },
      { title: "Same title", due: new Date("2026-10-30T17:00:00Z"), dueHasTime: true },
    ];
    const first = buildIcs(items, { now: NOW });
    const second = buildIcs(items, { now: new Date("2026-11-01T09:00:00Z") });
    const uids = (ics: string) => lines(ics).filter((line) => line.startsWith("UID:"));

    expect(new Set(uids(first)).size).toBe(2);
    expect(uids(first)).toEqual(uids(second));
    expect(unfold(second)).toContain("DTSTAMP:20261101T090000Z");
  });

  it("returns a valid empty calendar when nothing has a due date", () => {
    const ics = buildIcs([{ title: "No date", due: null, dueHasTime: false }], { now: NOW });

    expect(lines(ics)).toEqual([
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//AnonymousOnyx22//google-classroom-student-mcp//EN",
      "CALSCALE:GREGORIAN",
      "END:VCALENDAR",
    ]);
  });

  it("adds the calendar name when one is given", () => {
    const ics = buildIcs([], { now: NOW, calendarName: "School, fall term" });

    expect(ics).toContain("X-WR-CALNAME:School\\, fall term");
  });

  it("falls back to UTC for an unknown zone", () => {
    const ics = buildIcs([{ title: "Essay", due: new Date("2026-10-24T03:59:00Z"), dueHasTime: false }], {
      now: NOW,
      timeZone: "Not/AZone",
    });

    expect(ics).toContain("DTSTART;VALUE=DATE:20261024");
  });

  it("puts the Classroom link in the event", () => {
    const ics = buildIcs(
      [
        {
          title: "Problem set 4",
          due: new Date("2026-10-30T17:00:00Z"),
          dueHasTime: true,
          link: "https://classroom.google.com/c/abc/course/1/courseWork/w5",
        },
      ],
      { now: NOW },
    );

    expect(ics).toContain("URL:https://classroom.google.com/c/abc/course/1/courseWork/w5");
    expect(unfold(ics)).toContain(
      "DESCRIPTION:Open in Classroom: https://classroom.google.com/c/abc/course/1/courseWork/w5",
    );
  });
});
