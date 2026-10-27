/**
 * Build iCalendar text from work that has a due date. This is a pure helper:
 * the same input and the same `now` always give the same text.
 *
 * The output follows RFC 5545 closely enough for Google Calendar, Apple
 * Calendar and Outlook: CRLF line endings, escaped text and folded lines.
 */

/** The parts of a piece of work a calendar event needs. A WorkItem fits this shape. */
export interface IcsWork {
  title: string;
  due: Date | null;
  /** True when the work has a due time. False means the due date is the whole day. */
  dueHasTime: boolean;
  course?: string;
  /** The Classroom page of the work. */
  link?: string;
  /** Extra text for the event, such as the teacher's note. */
  description?: string;
}

export interface IcsOptions {
  /** The moment written on every event. Pass a fixed date to keep the output repeatable. */
  now?: Date;
  /** The zone used to find the calendar day of a due date with no time. Defaults to UTC. */
  timeZone?: string;
  /** The name the calendar app shows for this calendar. */
  calendarName?: string;
}

const PRODID = "-//AnonymousOnyx22//google-classroom-student-mcp//EN";
const UID_DOMAIN = "google-classroom-student-mcp";

/** How long a timed due date blocks out in the calendar. */
const TIMED_MINUTES = 30;

const encoder = new TextEncoder();

function utf8Length(text: string): number {
  return encoder.encode(text).length;
}

/** Escape a TEXT value as RFC 5545 asks, before any line folding. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

/** Break a content line into chunks of at most 75 bytes, keeping characters whole. */
function foldLine(line: string): string[] {
  if (utf8Length(line) <= 75) return [line];
  const parts: string[] = [];
  let current = "";
  for (const ch of line) {
    if (utf8Length(current + ch) > 75) {
      parts.push(current);
      current = ` ${ch}`;
    } else {
      current += ch;
    }
  }
  if (current) parts.push(current);
  return parts;
}

function zoneName(zone: string | undefined): string {
  if (!zone) return "UTC";
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: zone });
    return zone;
  } catch {
    return "UTC";
  }
}

interface CalendarDay {
  year: number;
  month: number;
  day: number;
}

/** The calendar day the moment falls on in the zone. */
function dayInZone(at: Date, zone: string): CalendarDay {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const value = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day") };
}

function dateStamp(day: CalendarDay): string {
  return `${day.year}${String(day.month).padStart(2, "0")}${String(day.day).padStart(2, "0")}`;
}

/** The day after the given one, used as the exclusive end of an all day event. */
function nextDay(day: CalendarDay): CalendarDay {
  const d = new Date(Date.UTC(day.year, day.month - 1, day.day + 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function utcStamp(at: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${at.getUTCFullYear()}${pad(at.getUTCMonth() + 1)}${pad(at.getUTCDate())}` +
    `T${pad(at.getUTCHours())}${pad(at.getUTCMinutes())}${pad(at.getUTCSeconds())}Z`
  );
}

/** A short stable hash, so the same work keeps the same UID between exports. */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** The content lines of one event, before folding. */
function eventLines(item: IcsWork, index: number, now: Date, zone: string): string[] {
  const due = item.due!;
  const title = item.course ? `${item.title} (${item.course})` : item.title;
  const details = [
    item.description?.trim(),
    item.link ? `Open in Classroom: ${item.link}` : undefined,
  ].filter((part): part is string => !!part);
  const key = [item.title, item.course, due.toISOString(), item.link].join("|");

  const lines = [
    "BEGIN:VEVENT",
    `UID:${hash(key)}-${index}@${UID_DOMAIN}`,
    `DTSTAMP:${utcStamp(now)}`,
  ];

  if (item.dueHasTime) {
    const end = new Date(due.getTime() + TIMED_MINUTES * 60000);
    lines.push(`DTSTART:${utcStamp(due)}`, `DTEND:${utcStamp(end)}`);
  } else {
    const day = dayInZone(due, zone);
    lines.push(`DTSTART;VALUE=DATE:${dateStamp(day)}`, `DTEND;VALUE=DATE:${dateStamp(nextDay(day))}`);
  }

  lines.push(`SUMMARY:${escapeText(title)}`);
  if (details.length) lines.push(`DESCRIPTION:${escapeText(details.join("\n"))}`);
  if (item.link) lines.push(`URL:${item.link}`);
  lines.push("END:VEVENT");
  return lines;
}

/**
 * Build an iCalendar document for every item that has a due date. Items with
 * no due date are left out, and the rest are sorted by due date.
 */
export function buildIcs(items: IcsWork[], options: IcsOptions = {}): string {
  const now = options.now instanceof Date && !Number.isNaN(options.now.getTime()) ? options.now : new Date();
  const zone = zoneName(options.timeZone);
  const dated = items
    .filter((item): item is IcsWork & { due: Date } => item.due instanceof Date && !Number.isNaN(item.due.getTime()))
    .slice()
    .sort((a, b) => a.due.getTime() - b.due.getTime() || (a.title < b.title ? -1 : a.title > b.title ? 1 : 0));

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
  ];
  if (options.calendarName) lines.push(`X-WR-CALNAME:${escapeText(options.calendarName)}`);
  for (const [index, item] of dated.entries()) lines.push(...eventLines(item, index, now, zone));
  lines.push("END:VCALENDAR");

  return lines.flatMap(foldLine).join("\r\n") + "\r\n";
}
