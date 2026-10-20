import { z } from "zod";
import type { ClassroomApi } from "./classroom.js";
import { type ToolDef, bullets, fmtDate, stripHtml } from "./core/tools.js";

type Api = ClassroomApi;

const courseId = z.union([z.string(), z.number()]).describe("Classroom course ID. Use get_my_courses to find it.");
const courseIds = z.array(courseId).optional().describe("Classroom course IDs to check. Leave empty for all active classes.");
const daysAhead = z.number().int().positive().optional().describe("Only show work due within this many days from now. Leave empty for every future due date.");

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
    };
  });
}

async function coursesFor(api: Api, ids?: string[]): Promise<Course[]> {
  const courses = await activeCourses(api);
  if (!ids?.length) return courses.slice(0, 15);
  const byId = new Map(courses.map((c) => [String(c.id), c]));
  return ids.slice(0, 15).map((id) => byId.get(String(id)) ?? { id: String(id), name: `class ${id}` });
}

async function allWork(api: Api, ids?: string[]): Promise<WorkItem[]> {
  const courses = await coursesFor(api, ids);
  return (await Promise.all(courses.map((c) => courseWork(api, c)))).flat();
}

const OPEN = new Set(["NEW", "CREATED", "RECLAIMED_BY_STUDENT"]);

function statusOf(i: WorkItem): string {
  if (i.state === "TURNED_IN") return i.late ? "turned in late" : "turned in";
  if (i.state === "RETURNED") return i.grade != null ? `graded ${i.grade}/${i.maxPoints ?? "?"}` : "returned";
  return OPEN.has(i.state) ? "not turned in" : i.state.toLowerCase();
}

export const tools: ToolDef<Api>[] = [
  {
    name: "get_my_courses",
    title: "My courses",
    description: "List the student's active Google Classroom classes with their IDs.",
    inputSchema: {},
    run: async (_args, api) => {
      const courses = await activeCourses(api);
      return bullets(courses.map((c) => `${c.name}${c.section ? ` (${c.section})` : ""} [id ${c.id}]`), "No active classes found.");
    },
  },
  {
    name: "get_todo",
    title: "To-do list",
    description: "Everything assigned that the student has not turned in yet. Pass course_ids to limit it, or leave empty for all active classes.",
    inputSchema: { course_ids: courseIds },
    run: async ({ course_ids }, api) => {
      const items = (await allWork(api, course_ids)).filter((i) => OPEN.has(i.state));
      items.sort((a, b) => (a.due?.getTime() ?? 9e15) - (b.due?.getTime() ?? 9e15));
      return bullets(items.map((i) => `${i.title} (${i.course}) due ${dueText(i)}`), "Nothing left to turn in.");
    },
  },
  {
    name: "get_upcoming_due_dates",
    title: "Upcoming due dates",
    description: "Work that is due soon and not turned in, soonest first. Pass course_ids or days_ahead to narrow it, or leave both empty.",
    inputSchema: { course_ids: courseIds, days_ahead: daysAhead },
    run: async ({ course_ids, days_ahead }, api) => {
      const now = Date.now();
      const until = days_ahead == null ? Infinity : now + days_ahead * 86400000;
      const items = (await allWork(api, course_ids)).filter(
        (i) => OPEN.has(i.state) && i.due && i.due.getTime() >= now && i.due.getTime() <= until,
      );
      items.sort((a, b) => a.due!.getTime() - b.due!.getTime());
      return bullets(items.map((i) => `${i.title} (${i.course}) due ${dueText(i)}`), "No upcoming due dates.");
    },
  },
  {
    name: "get_missing_assignments",
    title: "Missing assignments",
    description: "Past due work that has not been turned in. Pass course_ids to limit it, or leave empty for all active classes.",
    inputSchema: { course_ids: courseIds },
    run: async ({ course_ids }, api) => {
      const now = Date.now();
      const items = (await allWork(api, course_ids)).filter((i) => OPEN.has(i.state) && i.due && i.due.getTime() < now);
      items.sort((a, b) => b.due!.getTime() - a.due!.getTime());
      return bullets(items.map((i) => `${i.title} (${i.course}) was due ${dueText(i)}`), "No missing assignments.");
    },
  },
  {
    name: "get_assignments",
    title: "Class assignments",
    description: "Assignments for one class with due dates and status.",
    inputSchema: { course_id: courseId },
    run: async ({ course_id }, api) => {
      const course = (await activeCourses(api)).find((c) => String(c.id) === String(course_id)) ?? { id: String(course_id), name: `class ${course_id}` };
      const items = await courseWork(api, course);
      items.sort((a, b) => (a.due?.getTime() ?? 9e15) - (b.due?.getTime() ?? 9e15));
      return bullets(
        items.map((i) => `${i.title} due ${dueText(i)}${i.maxPoints ? ` (${i.maxPoints} pts)` : ""} ${statusOf(i)}`),
        "No assignments found.",
      );
    },
  },
  {
    name: "get_my_grades",
    title: "My grades",
    description: "Grades on returned work for each class. Google Classroom has no overall grade, so this adds up graded work only. Pass course_ids to limit it, or leave empty for all active classes.",
    inputSchema: { course_ids: courseIds },
    run: async ({ course_ids }, api) => {
      const courses = await coursesFor(api, course_ids);
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
      return bullets(lines, "No grades found.");
    },
  },
  {
    name: "get_announcements",
    title: "Announcements",
    description: "Recent announcements. Pass course_ids to limit it, or leave empty for all active classes.",
    inputSchema: { course_ids: z.array(courseId).optional() },
    run: async ({ course_ids }, api) => {
      const courses = await activeCourses(api);
      const ids: string[] = (course_ids?.length ? course_ids : courses.map((c) => c.id)).map(String).slice(0, 15);
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
      return bullets(
        rows.slice(0, 20).map(({ id, a }) => `${names.get(id) ?? `class ${id}`} (${fmtDate(a.updateTime)})\n  ${stripHtml(a.text, 400).replace(/\n/g, " ")}`),
        "No recent announcements.",
      );
    },
  },
  {
    name: "get_course_materials",
    title: "Class materials",
    description: "Posted materials for one class.",
    inputSchema: { course_id: courseId },
    run: async ({ course_id }, api) => {
      const items = await api.list<any>(`/v1/courses/${course_id}/courseWorkMaterials`, "courseWorkMaterial", { courseWorkMaterialStates: "PUBLISHED" });
      return bullets(
        items.map((m) => `${m.title}${m.description ? `, ${stripHtml(m.description, 160).replace(/\n/g, " ")}` : ""}`),
        "No materials posted.",
      );
    },
  },
];
