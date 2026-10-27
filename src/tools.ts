import { z } from "zod";
import type { ClassroomApi } from "./classroom.js";
import { type ToolDef, bullets, fmtDate, stripHtml } from "./core/tools.js";
import { ApiError } from "./core/http.js";
import { buildIcs } from "./core/ics.js";

type Api = ClassroomApi;

const courseId = z.union([z.string(), z.number()]).describe("Classroom course ID. Use get_my_courses to find it.");
const courseIds = z.array(courseId).optional().describe("Classroom course IDs to check. Leave empty for all active classes.");
const targetPercent = z.number().min(0).max(100).describe("The class percent you want, from 0 to 100. For example 90.");
const daysAhead = z.number().int().positive().optional().describe("Only show work due within this many days from now. Leave empty for every future due date.");
const sinceDays = z.number().int().positive().optional().describe("How many days back to look for new announcements and new grades. Leave empty for the last 7 days.");
const sinceDaysAnnouncements = z.number().int().positive().optional().describe("Only show announcements updated within this many days back from now. Leave empty to show every recent announcement.");
const dueAhead = z.number().int().positive().optional().describe("How many days ahead to look for work that is due next. Leave empty for the next 14 days.");

interface Course {
  id: string;
  name: string;
  section?: string;
}

interface WorkItem {
  course: string;
  courseId: string;
  title: string;
  due: Date | null;
  dueHasTime: boolean;
  state: string;
  maxPoints?: number;
  grade?: number;
  /** The id of the grading category the teacher put the work in. */
  category?: string;
  late?: boolean;
  /** When the teacher gave the work back with a grade. */
  gradedAt?: Date;
  /** What the teacher wrote when they returned the work. */
  comment?: string;
  /** The page of this assignment in the Classroom web UI. */
  link?: string;
}

async function activeCourses(api: Api): Promise<Course[]> {
  return api.list<Course>("/v1/courses", "courses", { courseStates: "ACTIVE", studentId: "me" });
}

/** The time zone for due dates with no time: CLASSROOM_TIMEZONE, else this computer's zone, else UTC. */
function dueZone(): string {
  for (const zone of [process.env.CLASSROOM_TIMEZONE, Intl.DateTimeFormat().resolvedOptions().timeZone]) {
    if (!zone) continue;
    try {
      new Intl.DateTimeFormat("en-CA", { timeZone: zone });
      return zone;
    } catch {
      // not a valid zone name, try the next one
    }
  }
  return "UTC";
}

/** How many milliseconds the zone is ahead of UTC at this moment. */
function zoneOffset(at: number, zone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(new Date(at));
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second")) - Math.floor(at / 1000) * 1000;
}

/** The moment 23:59 on this calendar day in the zone. */
function endOfDay(d: { year: number; month: number; day: number }, zone: string): Date {
  const wall = Date.UTC(d.year, d.month - 1, d.day, 23, 59);
  let at = wall - zoneOffset(wall, zone);
  at = wall - zoneOffset(at, zone);
  return new Date(at);
}

/** Classroom due times are UTC. If there is no time, treat it as the end of that day in the user's zone. */
export function parseDue(w: any): { due: Date | null; hasTime: boolean } {
  const d = w.dueDate;
  if (!d?.year) return { due: null, hasTime: false };
  const t = w.dueTime;
  if (!t) return { due: endOfDay(d, dueZone()), hasTime: false };
  return { due: new Date(Date.UTC(d.year, d.month - 1, d.day, t.hours ?? 0, t.minutes ?? 0)), hasTime: true };
}

function dueText(i: { due: Date | null; dueHasTime: boolean }): string {
  if (!i.due) return "no due date";
  if (i.dueHasTime) return fmtDate(i.due.toISOString());
  return i.due.toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric", timeZone: dueZone() });
}

/** Parse a Classroom timestamp, or return undefined when there is none. */
function stampOf(value: unknown): Date | undefined {
  if (!value) return undefined;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * When the work was given back with a grade. The comment the teacher left
 * says when they returned it. Without a comment, the last change to the
 * assignment is the best date we have.
 */
function gradedAt(work: any, submission: any): Date | undefined {
  return stampOf(submission?.assignedComment?.creationTime) ?? stampOf(work?.updateTime);
}

/**
 * What the teacher wrote when they returned the work. Classroom sends the
 * comment as HTML, so the tags come off and the text stays on one line.
 */
function commentText(submission: any): string | undefined {
  const text = stripHtml(submission?.assignedComment?.text).replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  return text.length > 300 ? `${text.slice(0, 300)}...` : text;
}

async function courseAnnouncements(api: Api, course: Course): Promise<any[]> {
  return api.list<any>(`/v1/courses/${course.id}/announcements`, "announcements", { announcementStates: "PUBLISHED" }, 1);
}

async function courseWork(api: Api, course: Course): Promise<WorkItem[]> {
  const [work, subs] = await Promise.all([
    api.list<any>(`/v1/courses/${course.id}/courseWork`, "courseWork", { courseWorkStates: "PUBLISHED" }),
    api.list<any>(`/v1/courses/${course.id}/courseWork/-/studentSubmissions`, "studentSubmissions", { userId: "me" }),
  ]);
  const byWork = new Map(subs.map((s) => [s.courseWorkId, s]));
  return work.map((w) => {
    const s = byWork.get(w.id);
    const { due, hasTime } = parseDue(w);
    return {
      course: course.name,
      courseId: course.id,
      title: w.title,
      due,
      dueHasTime: hasTime,
      state: s?.state ?? "NEW",
      maxPoints: w.maxPoints,
      grade: s?.assignedGrade,
      category: w.gradeCategory?.id ?? (typeof w.gradeCategory === "string" ? w.gradeCategory : undefined),
      late: s?.late,
      gradedAt: gradedAt(w, s),
      comment: commentText(s),
      link: w.alternateLink,
    };
  });
}

interface CoursesResult {
  courses: Course[];
  total: number;
}

async function coursesFor(api: Api, ids?: string[]): Promise<CoursesResult> {
  const courses = await activeCourses(api);
  if (!ids?.length) return { courses: courses.slice(0, 15), total: courses.length };
  const byId = new Map(courses.map((c) => [String(c.id), c]));
  return { courses: ids.slice(0, 15).map((id) => byId.get(String(id)) ?? { id: String(id), name: `class ${id}` }), total: ids.length };
}

async function allWork(api: Api, ids?: string[]): Promise<{ items: WorkItem[]; totalCourses: number }> {
  const { courses, total } = await coursesFor(api, ids);
  const items = (await Promise.all(courses.map((c) => courseWork(api, c)))).flat();
  return { items, totalCourses: total };
}

const OPEN = new Set(["NEW", "CREATED", "RECLAIMED_BY_STUDENT"]);

/**
 * Put the web page of an item under its text, so the student can open the
 * work itself and not only read the title. Classroom only sends the link
 * for published items.
 */
function linked(text: string, url?: string): string {
  return url ? `${text}\n  link: ${url}` : text;
}

/**
 * The Drive files attached to a material, one line each with the link that
 * opens the file. The Classroom API nests the file inside the shared file
 * record, and older records hold it one level higher.
 */
function driveFiles(material: any): string[] {
  const out: string[] = [];
  for (const m of material?.materials ?? []) {
    const file = m?.driveFile?.driveFile ?? m?.driveFile;
    if (!file?.alternateLink) continue;
    out.push(`  file: ${file.title ? `${file.title}, ` : ""}${file.alternateLink}`);
  }
  return out;
}

/**
 * The files and links attached to an assignment, one line each with the link
 * that opens the file. Classroom nests the file inside the shared file
 * record, and older records hold it one level higher.
 */
function attachmentLines(work: any): string[] {
  const out: string[] = [];
  for (const m of work?.materials ?? []) {
    const file = m?.driveFile?.driveFile ?? m?.driveFile;
    if (file?.alternateLink) {
      out.push(`  file: ${file.title ? `${file.title}, ` : ""}${file.alternateLink}`);
      continue;
    }
    if (m?.link?.url) out.push(`  link: ${m.link.url}`);
  }
  return out;
}

/** A titled part of the digest, with one bullet per line. */
function section(title: string, lines: string[], empty: string): string {
  return `${title}\n${bullets(lines, empty)}`;
}

function statusOf(i: Pick<WorkItem, "state" | "late" | "grade" | "maxPoints">): string {
  if (i.state === "TURNED_IN") return i.late ? "turned in late" : "turned in";
  if (i.state === "RETURNED") return i.grade != null ? `graded ${i.grade}/${i.maxPoints ?? "?"}` : "returned";
  return OPEN.has(i.state) ? "not turned in" : i.state.toLowerCase();
}

/**
 * A grade with the words the teacher wrote under it and the Classroom page
 * of the work, so the student can read the comment and open the work.
 */
function gradedItem(item: WorkItem, head: string): string {
  const lines = [head];
  if (item.comment) lines.push(`  teacher said: ${item.comment}`);
  if (item.link) lines.push(`  link: ${item.link}`);
  return lines.join("\n");
}

/** One decimal place, with a whole number printed without the .0. */
function fmtPoints(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** One decimal place, the way the grade tools print percentages. */
function fmtPercent(n: number): string {
  return `${n.toFixed(1)}%`;
}

/**
 * The points earned so far and the points still needed on the work that has
 * no grade yet, for one class and one target percent. Classroom sends points
 * on each piece of work but no overall grade, so this is straight arithmetic
 * on those points. Work the teacher already returned without a grade is left
 * out, because it will not add points.
 */
function targetLine(name: string, work: WorkItem[], target: number): string {
  const graded = work.filter((i) => i.grade != null && i.maxPoints);
  const left = work.filter((i) => i.grade == null && i.maxPoints && i.state !== "RETURNED");
  if (!graded.length && !left.length) return `${name} no graded work and no work left to score`;
  const earned = graded.reduce((n, i) => n + (i.grade ?? 0), 0);
  const possible = graded.reduce((n, i) => n + (i.maxPoints ?? 0), 0);
  const remaining = left.reduce((n, i) => n + (i.maxPoints ?? 0), 0);
  const now = possible ? (earned / possible) * 100 : 0;
  const head = graded.length
    ? `${name} ${fmtPoints(earned)}/${fmtPoints(possible)} points on ${graded.length} graded item${graded.length === 1 ? "" : "s"} now (${fmtPercent(now)})`
    : `${name} no graded work yet`;
  const goal = fmtPercent(target);
  if (!remaining) {
    return `${head}. Target ${goal}: no work left to score, so the percent on this work stays at ${fmtPercent(now)}.`;
  }
  const needed = (target / 100) * (possible + remaining) - earned;
  if (needed <= 0) {
    return `${head}. Target ${goal}: already there, so the ${fmtPoints(remaining)} points of work left can only help.`;
  }
  if (needed > remaining) {
    const best = ((earned + remaining) / (possible + remaining)) * 100;
    return `${head}. Target ${goal}: ${fmtPoints(needed)} points needed on the ${fmtPoints(remaining)} points of work left, which is more than that work is worth. The best you can reach is ${fmtPercent(best)}.`;
  }
  return `${head}. Target ${goal}: ${fmtPoints(needed)} points needed on the ${fmtPoints(remaining)} points of work left, which is ${fmtPercent((needed / remaining) * 100)} on that work.`;
}

/**
 * The percent for a class that weights its work by grading category, as a
 * line to print under the plain points line. Only categories with graded
 * work count, and their weights are scaled to add up to 100. A class with no
 * weights gets a plain note. When the course settings cannot be read, there
 * is no line at all.
 */
async function weightedLine(api: Api, course: Course, graded: WorkItem[]): Promise<string | undefined> {
  let settings: any;
  try {
    settings = (await api.get<any>(`/v1/courses/${course.id}`))?.gradebookSettings;
  } catch {
    return undefined;
  }
  const cats: any[] = settings?.gradeCategories ?? [];
  if (settings?.calculationType !== "WEIGHTED_CATEGORIES" || !cats.length) {
    return "  This class does not weight work by category in Classroom, so the percent above is plain points.";
  }
  const parts = cats
    .map((cat) => {
      const items = graded.filter((i) => i.category === cat.id);
      const possible = items.reduce((n, i) => n + (i.maxPoints ?? 0), 0);
      const earned = items.reduce((n, i) => n + (i.grade ?? 0), 0);
      return { name: cat.name ?? "Category", weight: Number(cat.weight) || 0, percent: possible ? (earned / possible) * 100 : undefined };
    })
    .filter((p) => p.percent != null && p.weight > 0);
  const total = parts.reduce((n, p) => n + p.weight, 0);
  if (!total) return "  This class weights work by category, but none of the graded work is in a weighted category, so the percent above is plain points.";
  const overall = parts.reduce((n, p) => n + (p.weight / total) * (p.percent ?? 0), 0);
  const detail = parts.map((p) => `${p.name} ${fmtPercent((p.weight / total) * 100)} weight: ${fmtPercent(p.percent ?? 0)}`).join(", ");
  return `  weighted by category: ${fmtPercent(overall)} (${detail})`;
}

export const tools: ToolDef<Api>[] = [
  {
    name: "get_my_courses",
    title: "My courses",
    description: "List the student's active Google Classroom classes with their IDs. Use this when the user asks 'What classes am I in?' or needs a course ID to pass to another tool.",
    inputSchema: {},
    run: async (_args, api) => {
      const courses = await activeCourses(api);
      return bullets(courses.map((c) => `${c.name}${c.section ? ` (${c.section})` : ""} [id ${c.id}]`), "No active classes found. Run `npx google-classroom-student-mcp doctor` to check your setup, and make sure the Google Classroom API is enabled in your Google Cloud project.");
    },
  },
  {
    name: "get_todo",
    title: "To-do list",
    description: "Everything assigned that the student has not turned in yet, each with a link to open it in Classroom. Pass course_ids to limit it, or leave empty for all active classes. Use this when the user asks 'What do I still have to do?' or 'What's left to turn in across all my classes?'",
    inputSchema: { course_ids: courseIds },
    run: async ({ course_ids }, api) => {
      const { items: all, totalCourses } = await allWork(api, course_ids);
      const items = all.filter((i) => OPEN.has(i.state));
      items.sort((a, b) => (a.due?.getTime() ?? 9e15) - (b.due?.getTime() ?? 9e15));
      let text = bullets(items.map((i) => linked(`${i.title} (${i.course}) due ${dueText(i)}`, i.link)), "Nothing left to turn in.");
      if (totalCourses > 15) text += `\nshowing first 15 of ${totalCourses} classes`;
      return text;
    },
  },
  {
    name: "export_due_dates_calendar",
    title: "Export due dates calendar",
    description: "Build an ICS calendar file of upcoming due dates so they can be imported into a calendar app. Pass course_ids to limit it, or leave empty for all active classes. Use this when the user asks 'Can you give me my due dates as a calendar file?'",
    inputSchema: { course_ids: courseIds },
    run: async ({ course_ids }, api) => {
      const now = Date.now();
      const { items: all } = await allWork(api, course_ids);
      // only what get_upcoming_due_dates would list: work not turned in and still due, so old and finished work stays out of the calendar
      const upcoming = all.filter((i) => OPEN.has(i.state) && i.due && i.due.getTime() >= now);
      const ics = buildIcs(
        upcoming.map((i) => ({
          title: i.title,
          course: i.course,
          due: i.due,
          dueHasTime: i.dueHasTime,
          link: i.link,
        })),
        { calendarName: "Classroom due dates" },
      );
      return ics;
    },
  },
  {
    name: "get_upcoming_due_dates",
    title: "Upcoming due dates",
    description: "Work that is due soon and not turned in, soonest first. Pass course_ids or days_ahead to narrow it, or leave both empty. Use this when the user asks 'What's due this week across all my classes?' or 'What's coming up?'",
    inputSchema: { course_ids: courseIds, days_ahead: daysAhead },
    run: async ({ course_ids, days_ahead }, api) => {
      const now = Date.now();
      const until = days_ahead == null ? Infinity : now + days_ahead * 86400000;
      const { items: all, totalCourses } = await allWork(api, course_ids);
      const items = all.filter(
        (i) => OPEN.has(i.state) && i.due && i.due.getTime() >= now && i.due.getTime() <= until,
      );
      items.sort((a, b) => a.due!.getTime() - b.due!.getTime());
      let text = bullets(items.map((i) => `${i.title} (${i.course}) due ${dueText(i)}`), "No upcoming due dates.");
      if (totalCourses > 15) text += `\nshowing first 15 of ${totalCourses} classes`;
      return text;
    },
  },
  {
    name: "get_missing_assignments",
    title: "Missing assignments",
    description: "Past due work that has not been turned in. Pass course_ids to limit it, or leave empty for all active classes. Use this when the user asks 'What's overdue?' or 'What am I behind on?'",
    inputSchema: { course_ids: courseIds },
    run: async ({ course_ids }, api) => {
      const now = Date.now();
      const { items: all, totalCourses } = await allWork(api, course_ids);
      const items = all.filter((i) => OPEN.has(i.state) && i.due && i.due.getTime() < now);
      items.sort((a, b) => b.due!.getTime() - a.due!.getTime());
      let text = bullets(items.map((i) => `${i.title} (${i.course}) was due ${dueText(i)}`), "No missing assignments.");
      if (totalCourses > 15) text += `\nshowing first 15 of ${totalCourses} classes`;
      return text;
    },
  },
  {
    name: "get_assignments",
    title: "Class assignments",
    description: "Assignments for one class with due dates and status, each with a link to open it in Classroom. Use this when the user asks 'What's due in this class?' or wants every assignment and its points for a single class.",
    inputSchema: { course_id: courseId },
    run: async ({ course_id }, api) => {
      const course = (await activeCourses(api)).find((c) => String(c.id) === String(course_id)) ?? { id: String(course_id), name: `class ${course_id}` };
      const items = await courseWork(api, course);
      items.sort((a, b) => (a.due?.getTime() ?? 9e15) - (b.due?.getTime() ?? 9e15));
      return bullets(
        items.map((i) => linked(`${i.title} due ${dueText(i)}${i.maxPoints ? ` (${i.maxPoints} pts)` : ""} ${statusOf(i)}`, i.link)),
        "No assignments found.",
      );
    },
  },
  {
    name: "get_assignment_details",
    title: "Assignment details",
    description: "Everything about one assignment: what the teacher wrote in the description, the files and links attached to it, its due date, points and your status. Pass the course ID and the assignment ID. Use this when the user asks 'What does this assignment ask for?' or 'What do I need to turn in?' about one specific assignment.",
    inputSchema: { course_id: courseId, course_work_id: z.union([z.string(), z.number()]).describe("The assignment ID. Use get_assignments to find it.") },
    run: async ({ course_id, course_work_id }, api) => {
      const id = String(course_work_id);
      const [work, sub] = await Promise.all([
        api.list<any>(`/v1/courses/${course_id}/courseWork`, "courseWork", { courseWorkStates: "PUBLISHED" }),
        api.list<any>(`/v1/courses/${course_id}/courseWork/-/studentSubmissions`, "studentSubmissions", { userId: "me" }),
      ]);
      const item = work.find((w) => String(w.id) === id);
      if (!item) throw new ApiError(`Assignment ${id} was not found in this course. Check the course and assignment ID.`, 404);
      const s = sub.find((x) => String(x.courseWorkId) === id);
      const { due, hasTime } = parseDue(item);
      const lines: string[] = [];
      lines.push(`title: ${item.title}`);
      if (item.description) lines.push(`description: ${stripHtml(item.description, 4000).replace(/\n/g, " ").replace(/\s+/g, " ").trim()}`);
      lines.push(`due: ${dueText({ due, dueHasTime: hasTime })}`);
      if (item.maxPoints != null) lines.push(`points: ${item.maxPoints}`);
      lines.push(`status: ${statusOf({ state: s?.state ?? "NEW", late: s?.late, grade: s?.assignedGrade, maxPoints: item.maxPoints })}`);
      if (item.alternateLink) lines.push(`link: ${item.alternateLink}`);
      const attached = attachmentLines(item);
      if (attached.length) lines.push(...attached);
      return lines.join("\n");
    },
  },
  {
    name: "get_my_grades",
    title: "My grades",
    description: "Grades on returned work for each class, with the comment the teacher left on the work. Google Classroom has no overall grade, so this adds up graded work only, and adds a weighted percent when the class uses grading categories with weights. Pass course_ids to limit it, or leave empty for all active classes. Use this when the user asks 'How am I doing in my classes?' or 'What grades have I gotten back?'",
    inputSchema: { course_ids: courseIds },
    run: async ({ course_ids }, api) => {
      const { courses, total } = await coursesFor(api, course_ids);
      const perCourse = await Promise.all(courses.map((c) => courseWork(api, c)));
      const lines: string[] = [];
      for (const [idx, list] of perCourse.entries()) {
        const name = courses[idx].name;
        const graded = list.filter((i) => i.grade != null && i.maxPoints);
        if (!graded.length) {
          lines.push(`${name} no graded work yet`);
          continue;
        }
        const earned = graded.reduce((n, i) => n + (i.grade ?? 0), 0);
        const possible = graded.reduce((n, i) => n + (i.maxPoints ?? 0), 0);
        const head = `${name} ${earned}/${possible} points on ${graded.length} graded items (${((earned / possible) * 100).toFixed(1)}%)`;
        const weighted = await weightedLine(api, courses[idx], graded);
        const feedback = graded
          .filter((i) => i.comment)
          .map((i) => gradedItem(i, `  ${i.title}: ${i.grade}/${i.maxPoints ?? "?"}`))
          .join("\n");
        lines.push([head, weighted, feedback].filter(Boolean).join("\n"));
      }
      let text = bullets(lines, "No grades found.");
      if (total > 15) text += `\nshowing first 15 of ${total} classes`;
      return text;
    },
  },
  {
    name: "get_target_grade",
    title: "Target grade",
    description: "Points needed on the work that is left to reach a target percent in each class. Adds up the points earned on graded work and the points the work left is worth, then says how many of those points you still need. target_percent is the percent you want, from 0 to 100. Pass course_ids to limit it, or leave empty for all active classes. Use this when the user asks 'What do I need to score to get a 90?' or 'Can I still get an A in this class?'",
    inputSchema: { course_ids: courseIds, target_percent: targetPercent },
    run: async ({ course_ids, target_percent }, api) => {
      const { courses, total } = await coursesFor(api, course_ids);
      const perCourse = await Promise.all(courses.map((c) => courseWork(api, c)));
      const lines = perCourse.map((list, idx) => targetLine(courses[idx].name, list, target_percent));
      let text = bullets(lines, "No target grade to work out.");
      if (total > 15) text += `\nshowing first 15 of ${total} classes`;
      return text;
    },
  },
  {
    name: "get_announcements",
    title: "Announcements",
    description: "Recent announcements, each with a link to open it in Classroom. Pass course_ids or since_days to limit how far back they go, or leave empty for all active classes. Use this when the user asks 'Did my teacher post anything new?' or 'What did my teacher announce?'",
    inputSchema: { course_ids: courseIds, since_days: sinceDaysAnnouncements },
    run: async ({ course_ids, since_days }, api) => {
      const courses = await activeCourses(api);
      const allIds: string[] = (course_ids?.length ? course_ids : courses.map((c) => c.id)).map(String);
      const total = allIds.length;
      const ids: string[] = allIds.slice(0, 15);
      const names = new Map(courses.map((c) => [String(c.id), c.name]));
      const from = since_days == null ? 0 : Date.now() - since_days * 86400000;
      const rows = (
        await Promise.all(
          ids.map(async (id) => {
            const list = await api.list<any>(`/v1/courses/${id}/announcements`, "announcements", { announcementStates: "PUBLISHED" }, 1);
            return list
              .filter((a) => {
                const when = stampOf(a.updateTime ?? a.creationTime);
                return when == null || when.getTime() >= from;
              })
              .slice(0, 5).map((a) => ({ id, a }));
          }),
        )
      ).flat();
      rows.sort((x, y) => String(y.a.updateTime).localeCompare(String(x.a.updateTime)));
      let text = bullets(
        rows.slice(0, 20).map(({ id, a }) =>
          linked(`${names.get(id) ?? `class ${id}`} (${fmtDate(a.updateTime)})\n  ${stripHtml(a.text, 400).replace(/\n/g, " ")}`, a.alternateLink),
        ),
        "No recent announcements.",
      );
      if (total > 15) text += `\nshowing first 15 of ${total} classes`;
      return text;
    },
  },
  {
    name: "get_course_materials",
    title: "Class materials",
    description: "Posted materials for one class, each with a link to open it in Classroom and the Drive link of every attached file. Use this when the user asks 'What materials did my teacher post?' or wants the readings, slides and handouts for one class.",
    inputSchema: { course_id: courseId },
    run: async ({ course_id }, api) => {
      const items = await api.list<any>(`/v1/courses/${course_id}/courseWorkMaterials`, "courseWorkMaterial", { courseWorkMaterialStates: "PUBLISHED" });
      return bullets(
        items.map((m) =>
          [
            linked(`${m.title}${m.description ? `, ${stripHtml(m.description, 160).replace(/\n/g, " ")}` : ""}`, m.alternateLink),
            ...driveFiles(m),
          ].join("\n"),
        ),
        "No materials posted.",
      );
    },
  },
  {
    name: "get_whats_new",
    title: "What's new",
    description: "One catch up digest for every class: new announcements, newly graded work with the comment the teacher left, overdue work and what is due next. Pass course_ids to limit it, since_days for how far back to look and days_ahead for how far ahead to look. Use this when the user asks 'What's new since yesterday?' or 'What changed in my classes?'",
    inputSchema: { course_ids: courseIds, since_days: sinceDays, days_ahead: dueAhead },
    run: async ({ course_ids, since_days, days_ahead }, api) => {
      const back = since_days ?? 7;
      const ahead = days_ahead ?? 14;
      const now = Date.now();
      const from = now - back * 86400000;
      const to = now + ahead * 86400000;

      const { courses, total } = await coursesFor(api, course_ids);
      const failed: string[] = [];
      let firstError: unknown;
      const settled = await Promise.all(
        courses.map(async (c) => {
          try {
            return {
              name: c.name,
              work: await courseWork(api, c),
              announcements: await courseAnnouncements(api, c),
            };
          } catch (err) {
            failed.push(c.name);
            firstError ??= err;
            return null;
          }
        }),
      );
      if (courses.length && failed.length === courses.length) throw firstError;
      const perCourse = settled.filter((c): c is NonNullable<typeof c> => c != null);
      const all = perCourse.flatMap((c) => c.work);
      const announcements = perCourse.flatMap((c) => c.announcements.map((a) => ({ course: c.name, a })));

      const fresh = announcements
        .map((x) => ({ ...x, when: stampOf(x.a.updateTime ?? x.a.creationTime) }))
        .filter((x): x is { course: string; a: any; when: Date } => x.when != null && x.when.getTime() >= from)
        .sort((x, y) => y.when.getTime() - x.when.getTime())
        .slice(0, 10);

      const graded = all
        .filter((i): i is WorkItem & { gradedAt: Date } => i.gradedAt != null && i.grade != null && i.gradedAt.getTime() >= from)
        .sort((a, b) => b.gradedAt.getTime() - a.gradedAt.getTime())
        .slice(0, 10);

      const overdue = all
        .filter((i) => OPEN.has(i.state) && i.due != null && i.due.getTime() < now)
        .sort((a, b) => b.due!.getTime() - a.due!.getTime())
        .slice(0, 10);

      const next = all
        .filter((i) => OPEN.has(i.state) && i.due != null && i.due.getTime() >= now && i.due.getTime() <= to)
        .sort((a, b) => a.due!.getTime() - b.due!.getTime())
        .slice(0, 10);

      const text = [
        section(
          `New announcements (last ${back} days)`,
          fresh.map((x) => {
            const note = stripHtml(x.a.text, 200).replace(/\n/g, " ");
            return linked(`${x.course} (${fmtDate(x.when.toISOString())})${note ? ` ${note}` : ""}`, x.a.alternateLink);
          }),
          "No new announcements.",
        ),
        section(
          `New grades (last ${back} days)`,
          graded.map((i) =>
            gradedItem(i, `${i.title} (${i.course}) graded ${i.grade}/${i.maxPoints ?? "?"} on ${fmtDate(i.gradedAt.toISOString())}`),
          ),
          "No new grades.",
        ),
        section(
          "Overdue work",
          overdue.map((i) => `${i.title} (${i.course}) was due ${dueText(i)}`),
          "No overdue work.",
        ),
        section(
          `Due next (${ahead} days)`,
          next.map((i) => `${i.title} (${i.course}) due ${dueText(i)}`),
          "Nothing due in that time.",
        ),
      ].join("\n\n");
      const skipped = failed.length
        ? `\n\nCould not load ${failed.length} of ${courses.length} classes, so they are missing from this digest: ${failed.join(", ")}. Try again shortly.`
        : "";
      return (total > 15 ? `${text}\nshowing first 15 of ${total} classes` : text) + skipped;
    },
  },
];
