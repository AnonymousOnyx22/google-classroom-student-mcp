import { z } from "zod";
import type { ClassroomApi } from "./classroom.js";
import { type ToolDef, bullets, fmtDate, stripHtml } from "./core/tools.js";

type Api = ClassroomApi;

const courseId = z.union([z.string(), z.number()]).describe("Classroom course ID. Use get_my_courses to find it.");
const courseIds = z.array(courseId).optional().describe("Classroom course IDs to check. Leave empty for all active classes.");
const daysAhead = z.number().int().positive().optional().describe("Only show work due within this many days from now. Leave empty for every future due date.");
const sinceDays = z.number().int().positive().optional().describe("How many days back to look for new announcements and new grades. Leave empty for the last 7 days.");
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
  late?: boolean;
  /** When the teacher gave the work back with a grade. */
  gradedAt?: Date;
  /** The page of this assignment in the Classroom web UI. */
  link?: string;
}

async function activeCourses(api: Api): Promise<Course[]> {
  return api.list<Course>("/v1/courses", "courses", { courseStates: "ACTIVE", studentId: "me" });
}

/** Classroom due dates are UTC. If there is no time, treat it as the end of that day. */
function parseDue(w: any): { due: Date | null; hasTime: boolean } {
  const d = w.dueDate;
  if (!d?.year) return { due: null, hasTime: false };
  const t = w.dueTime;
  const hasTime = Boolean(t);
  return { due: new Date(Date.UTC(d.year, d.month - 1, d.day, t?.hours ?? 23, t?.minutes ?? 59)), hasTime };
}

function dueText(i: { due: Date | null; dueHasTime: boolean }): string {
  if (!i.due) return "no due date";
  if (i.dueHasTime) return fmtDate(i.due.toISOString());
  return i.due.toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
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
      late: s?.late,
      gradedAt: gradedAt(w, s),
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

/** A titled part of the digest, with one bullet per line. */
function section(title: string, lines: string[], empty: string): string {
  return `${title}\n${bullets(lines, empty)}`;
}

function statusOf(i: WorkItem): string {
  if (i.state === "TURNED_IN") return i.late ? "turned in late" : "turned in";
  if (i.state === "RETURNED") return i.grade != null ? `graded ${i.grade}/${i.maxPoints ?? "?"}` : "returned";
  return OPEN.has(i.state) ? "not turned in" : i.state.toLowerCase();
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
    name: "get_my_grades",
    title: "My grades",
    description: "Grades on returned work for each class. Google Classroom has no overall grade, so this adds up graded work only. Pass course_ids to limit it, or leave empty for all active classes. Use this when the user asks 'How am I doing in my classes?' or 'What grades have I gotten back?'",
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
        lines.push(`${name} ${earned}/${possible} points on ${graded.length} graded items (${((earned / possible) * 100).toFixed(1)}%)`);
      }
      let text = bullets(lines, "No grades found.");
      if (total > 15) text += `\nshowing first 15 of ${total} classes`;
      return text;
    },
  },
  {
    name: "get_announcements",
    title: "Announcements",
    description: "Recent announcements, each with a link to open it in Classroom. Pass course_ids to limit it, or leave empty for all active classes. Use this when the user asks 'Did my teacher post anything new?' or 'What did my teacher announce?'",
    inputSchema: { course_ids: z.array(courseId).optional() },
    run: async ({ course_ids }, api) => {
      const courses = await activeCourses(api);
      const allIds: string[] = (course_ids?.length ? course_ids : courses.map((c) => c.id)).map(String);
      const total = allIds.length;
      const ids: string[] = allIds.slice(0, 15);
      const names = new Map(courses.map((c) => [String(c.id), c.name]));
      const rows = (
        await Promise.all(
          ids.map(async (id) => {
            const list = await api.list<any>(`/v1/courses/${id}/announcements`, "announcements", { announcementStates: "PUBLISHED" }, 1);
            return list.slice(0, 5).map((a) => ({ id, a }));
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
    description: "One catch up digest for every class: new announcements, newly graded work, overdue work and what is due next. Pass course_ids to limit it, since_days for how far back to look and days_ahead for how far ahead to look. Use this when the user asks 'What's new since yesterday?' or 'What changed in my classes?'",
    inputSchema: { course_ids: courseIds, since_days: sinceDays, days_ahead: dueAhead },
    run: async ({ course_ids, since_days, days_ahead }, api) => {
      const back = since_days ?? 7;
      const ahead = days_ahead ?? 14;
      const now = Date.now();
      const from = now - back * 86400000;
      const to = now + ahead * 86400000;

      const { courses, total } = await coursesFor(api, course_ids);
      const perCourse = await Promise.all(
        courses.map(async (c) => ({
          name: c.name,
          work: await courseWork(api, c),
          announcements: await courseAnnouncements(api, c),
        })),
      );
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
            return `${x.course} (${fmtDate(x.when.toISOString())})${note ? ` ${note}` : ""}`;
          }),
          "No new announcements.",
        ),
        section(
          `New grades (last ${back} days)`,
          graded.map((i) => `${i.title} (${i.course}) graded ${i.grade}/${i.maxPoints ?? "?"} on ${fmtDate(i.gradedAt.toISOString())}`),
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
      return total > 15 ? `${text}\nshowing first 15 of ${total} classes` : text;
    },
  },
];
