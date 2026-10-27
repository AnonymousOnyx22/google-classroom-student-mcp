import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createClassroomApi } from "../src/classroom.js";
import { createTokenProvider, buildAuthUrl, exchangeCode, SCOPES } from "../src/auth.js";
import { createServer } from "../src/server.js";
import { tools } from "../src/tools.js";

const day = 86400000;
function dueParts(offsetDays: number, withTime = true) {
  const d = new Date(Date.now() + offsetDays * day);
  const out: any = { dueDate: { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() } };
  if (withTime) out.dueTime = { hours: 23, minutes: 0 };
  return out;
}

let srv: http.Server;
let base = "";
let refreshCalls = 0;
const authHeaders: string[] = [];

beforeAll(async () => {
  srv = http.createServer((req, res) => {
    const url = new URL(req.url!, "http://x");
    const send = (code: number, data: unknown) => {
      res.writeHead(code, { "content-type": "application/json" });
      res.end(JSON.stringify(data));
    };
    if (url.pathname === "/token") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const p = new URLSearchParams(body);
        if (p.get("grant_type") === "refresh_token") {
          refreshCalls++;
          return p.get("refresh_token") === "rt-good"
            ? send(200, { access_token: "at-fresh", expires_in: 3600 })
            : send(400, { error: "invalid_grant", error_description: "Token has been expired or revoked." });
        }
        if (p.get("grant_type") === "authorization_code") {
          return p.get("code") === "code-good"
            ? send(200, { access_token: "at1", refresh_token: "rt-good" })
            : send(200, { access_token: "at1" });
        }
        send(400, {});
      });
      return;
    }
    authHeaders.push(String(req.headers.authorization));
    if (req.headers.authorization !== "Bearer at-fresh") return send(401, {});
    const p = url.pathname;
    if (p === "/v1/courses") {
      if (url.searchParams.get("pageToken") === "p2") return send(200, { courses: [{ id: "300", name: "Biology" }] });
      return send(200, { courses: [{ id: "100", name: "Math", section: "Period 1" }, { id: "200", name: "English" }], nextPageToken: "p2" });
    }
    if (p.startsWith("/v1/courses/403/")) return send(403, {});
    if (p === "/v1/courses/100/courseWork")
      return send(200, { courseWork: [
        { id: "w1", title: "Worksheet 1", ...dueParts(-3), maxPoints: 10, alternateLink: "https://classroom.google.com/c/Math/course/100/courseWork/w1" },
        { id: "w2", title: "Quiz 2", ...dueParts(2), maxPoints: 20, alternateLink: "https://classroom.google.com/c/Math/course/100/courseWork/w2" },
        { id: "w3", title: "Project", ...dueParts(5, false), maxPoints: 50, alternateLink: "https://classroom.google.com/c/Math/course/100/courseWork/w3" },
        { id: "w4", title: "Reading", maxPoints: 5, updateTime: new Date(Date.now() - 2 * day).toISOString() },
      ] });
    if (p === "/v1/courses/100/courseWork/-/studentSubmissions")
      return send(200, { studentSubmissions: [
        { courseWorkId: "w1", state: "NEW" },
        { courseWorkId: "w2", state: "TURNED_IN" },
        { courseWorkId: "w3", state: "CREATED" },
        { courseWorkId: "w4", state: "RETURNED", assignedGrade: 4, assignedComment: { text: "<p>Nice work,<br>watch your signs.</p>", creationTime: new Date(Date.now() - 2 * day).toISOString() } },
      ] });
    if (p === "/v1/courses/200/courseWork") return send(200, { courseWork: [
      { id: "e1", title: "Essay", ...dueParts(-10), maxPoints: 100, updateTime: new Date(Date.now() - 30 * day).toISOString(), alternateLink: "https://classroom.google.com/c/English/course/200/courseWork/e1" },
      { id: "e2", title: "Outline", ...dueParts(7), maxPoints: 25, alternateLink: "https://classroom.google.com/c/English/course/200/courseWork/e2" },
    ] });
    if (p === "/v1/courses/200/courseWork/-/studentSubmissions") return send(200, { studentSubmissions: [
      { courseWorkId: "e1", state: "RETURNED", assignedGrade: 90, assignedComment: { text: "Good argument, add one more source.", creationTime: new Date(Date.now() - 30 * day).toISOString() } },
    ] });
    if (p === "/v1/courses/300/courseWork" || p === "/v1/courses/300/courseWork/-/studentSubmissions") return send(200, {});
    if (p.endsWith("/announcements")) {
      if (!p.includes("/100/")) return send(200, { announcements: [] });
      return send(200, { announcements: [
        { text: "Bring your textbook", alternateLink: "https://classroom.google.com/c/Math/course/100/announcements/a1", updateTime: new Date(Date.now() - 2 * day).toISOString() },
        { text: "Test <b>Friday</b>", updateTime: new Date(Date.now() - 30 * day).toISOString() },
      ] });
    }
    if (p === "/v1/courses/100/courseWorkMaterials") return send(200, { courseWorkMaterial: [
      {
        title: "Slides week 3",
        description: "Chapter 3",
        alternateLink: "https://classroom.google.com/c/Math/course/100/courseWorkMaterials/m1",
        materials: [
          { title: "Slides week 3", driveFile: { driveFile: { title: "Week 3 slides", alternateLink: "https://drive.google.com/file/d/abc123" } } },
          { title: "Handout", driveFile: { title: "Chapter 3 handout", alternateLink: "https://drive.google.com/file/d/def456" } },
        ],
      },
    ] });
    send(404, {});
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((r) => srv.close(() => r())));

async function connect(token = "at-fresh") {
  const api = createClassroomApi(async () => token, base);
  const server = createServer(api);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const res: any = await client.callTool({ name, arguments: args });
  return { text: res.content[0].text as string, isError: Boolean(res.isError) };
}

describe("google-classroom-student-mcp", () => {
  it("exposes only read-only tools", async () => {
    const { tools } = await (await connect()).listTools();
    expect(tools.length).toBe(11);
    for (const t of tools) expect(t.annotations?.readOnlyHint).toBe(true);
  });

  it("lists classes and follows nextPageToken", async () => {
    const { text } = await call(await connect(), "get_my_courses");
    expect(text).toContain("Math (Period 1)");
    expect(text).toContain("Biology");
  });

  it("builds a to-do list from work that is not turned in, soonest first", async () => {
    const { text } = await call(await connect(), "get_todo");
    expect(text).toContain("Worksheet 1");
    expect(text).toContain("Project");
    expect(text).not.toContain("Quiz 2");
    expect(text).not.toContain("Essay");
    expect(text.indexOf("Worksheet 1")).toBeLessThan(text.indexOf("Project"));
    expect(text.indexOf("Project")).toBeLessThan(text.indexOf("no due date") === -1 ? 1e9 : text.indexOf("no due date"));
  });

  it("separates upcoming from missing", async () => {
    const c = await connect();
    const up = (await call(c, "get_upcoming_due_dates")).text;
    expect(up).toContain("Project");
    expect(up).not.toContain("Worksheet 1");
    const missing = (await call(c, "get_missing_assignments")).text;
    expect(missing).toContain("Worksheet 1");
    expect(missing).not.toContain("Project");
  });

  it("limits work to the given course ids", async () => {
    const c = await connect();
    const todo = (await call(c, "get_todo", { course_ids: ["200"] })).text;
    expect(todo).toContain("Outline");
    expect(todo).not.toContain("Worksheet 1");
    const up = (await call(c, "get_upcoming_due_dates", { course_ids: ["100"] })).text;
    expect(up).toContain("Project");
    expect(up).not.toContain("Outline");
    const missing = (await call(c, "get_missing_assignments", { course_ids: ["200"] })).text;
    expect(missing).toContain("No missing assignments.");
    const grades = (await call(c, "get_my_grades", { course_ids: ["200"] })).text;
    expect(grades).toContain("English 90/100");
    expect(grades).not.toContain("Math");
  });

  it("caps how far ahead it looks with days_ahead", async () => {
    const c = await connect();
    const wide = (await call(c, "get_upcoming_due_dates", { days_ahead: 10 })).text;
    expect(wide).toContain("Project");
    expect(wide).toContain("Outline");
    const narrow = (await call(c, "get_upcoming_due_dates", { days_ahead: 1 })).text;
    expect(narrow).toContain("No upcoming due dates.");
  });

  it("labels assignment status for a class", async () => {
    const { text } = await call(await connect(), "get_assignments", { course_id: "100" });
    expect(text).toMatch(/Worksheet 1.*not turned in/);
    expect(text).toMatch(/Quiz 2.*turned in/);
    expect(text).toMatch(/Reading.*graded 4\/5/);
  });

  it("adds up graded work per class and says when there is none", async () => {
    const { text } = await call(await connect(), "get_my_grades");
    expect(text).toContain("Math 4/5 points on 1 graded items (80.0%)");
    expect(text).toContain("English 90/100");
    expect(text).toContain("Biology no graded work yet");
  });

  it("works out the points needed on the work that is left", async () => {
    const { text } = await call(await connect(), "get_target_grade", { course_ids: ["100"], target_percent: 90 });
    expect(text).toBe(
      "- Math 4/5 points on 1 graded item now (80.0%). Target 90.0%: 72.5 points needed on the 80 points of work left, which is 90.6% on that work.",
    );
  });

  it("says when a target is out of reach or already met", async () => {
    const c = await connect();
    const high = (await call(c, "get_target_grade", { course_ids: ["200"], target_percent: 95 })).text;
    expect(high).toContain("English 90/100 points on 1 graded item now (90.0%)");
    expect(high).toContain("28.8 points needed on the 25 points of work left, which is more than that work is worth.");
    expect(high).toContain("The best you can reach is 92.0%.");
    const low = (await call(c, "get_target_grade", { course_ids: ["200"], target_percent: 70 })).text;
    expect(low).toContain("already there, so the 25 points of work left can only help");
  });

  it("says the percent stays when no work is left and leaves returned work out", async () => {
    const api: any = {
      get: async () => ({}),
      list: async (path: string) => {
        if (path === "/v1/courses") return [{ id: "1", name: "Math" }];
        if (path.endsWith("/studentSubmissions"))
          return [
            { courseWorkId: "w1", state: "RETURNED", assignedGrade: 8 },
            { courseWorkId: "w2", state: "RETURNED" },
          ];
        return [
          { id: "w1", title: "Quiz 1", maxPoints: 10 },
          { id: "w2", title: "Quiz 2", maxPoints: 20 },
        ];
      },
    };
    const tool = tools.find((t) => t.name === "get_target_grade")!;
    const out = await tool.run({ target_percent: 90 }, api);
    expect(out).toContain("Math 8/10 points on 1 graded item now (80.0%)");
    expect(out).toContain("no work left to score, so the percent on this work stays at 80.0%");
  });

  it("says when a class has no points to work with", async () => {
    const { text } = await call(await connect(), "get_target_grade", { target_percent: 90 });
    expect(text).toContain("Biology no graded work and no work left to score");
  });

  it("prints the comment the teacher left on returned work", async () => {
    const c = await connect();
    const grades = (await call(c, "get_my_grades")).text;
    expect(grades).toContain("Reading: 4/5");
    expect(grades).toContain("teacher said: Nice work, watch your signs.");
    expect(grades).toContain("teacher said: Good argument, add one more source.");
    expect(grades).toContain("link: https://classroom.google.com/c/English/course/200/courseWork/e1");
    expect(grades).not.toContain("<p>");
    const digest = (await call(c, "get_whats_new")).text;
    expect(digest).toContain("teacher said: Nice work, watch your signs.");
  });

  it("weights grades by category and notes when a class is unweighted", async () => {
    const make = (settings: unknown): any => ({
      get: async () => ({ gradebookSettings: settings }),
      list: async (path: string) => {
        if (path === "/v1/courses") return [{ id: "1", name: "Math" }];
        if (path.endsWith("/studentSubmissions"))
          return [
            { courseWorkId: "w1", state: "RETURNED", assignedGrade: 9 },
            { courseWorkId: "w2", state: "RETURNED", assignedGrade: 50 },
          ];
        return [
          { id: "w1", title: "Homework 1", maxPoints: 10, gradeCategory: { id: "hw" } },
          { id: "w2", title: "Exam 1", maxPoints: 100, gradeCategory: { id: "ex" } },
        ];
      },
    });
    const tool = tools.find((t) => t.name === "get_my_grades")!;
    const weighted = await tool.run({}, make({ calculationType: "WEIGHTED_CATEGORIES", gradeCategories: [{ id: "hw", name: "Homework", weight: 40000 }, { id: "ex", name: "Exams", weight: 60000 }] }));
    expect(weighted).toContain("Math 59/110 points on 2 graded items (53.6%)");
    expect(weighted).toContain("weighted by category: 66.0% (Homework 40.0% weight: 90.0%, Exams 60.0% weight: 50.0%)");
    const plain = await tool.run({}, make({ calculationType: "TOTAL_POINTS" }));
    expect(plain).toContain("does not weight work by category");
  });

  it("leaves the comment line out when the teacher wrote nothing", async () => {
    const api: any = {
      get: async () => ({}),
      list: async (path: string) => {
        if (path === "/v1/courses") return [{ id: "1", name: "Math" }];
        if (path.endsWith("/studentSubmissions")) return [{ courseWorkId: "w1", state: "RETURNED", assignedGrade: 8 }];
        return [{ id: "w1", title: "Quiz 1", maxPoints: 10, alternateLink: "https://classroom.google.com/c/Math/course/1/courseWork/w1" }];
      },
    };
    const tool = tools.find((t) => t.name === "get_my_grades")!;
    const out = await tool.run({}, api);
    expect(out).toContain("Math 8/10 points on 1 graded items (80.0%)");
    expect(out).not.toContain("teacher said:");
  });

  it("shows announcements with HTML stripped and materials", async () => {
    const c = await connect();
    const ann = (await call(c, "get_announcements")).text;
    expect(ann).toContain("Test Friday");
    expect(ann).not.toContain("<b>");
    expect((await call(c, "get_course_materials", { course_id: "100" })).text).toContain("Slides week 3");
  });

  it("filters announcements to the last N days with since_days", async () => {
    const c = await connect();
    const recent = (await call(c, "get_announcements", { since_days: 7 })).text;
    expect(recent).toContain("Bring your textbook");
    expect(recent).not.toContain("Test Friday");
    const all = (await call(c, "get_announcements")).text;
    expect(all).toContain("Bring your textbook");
    expect(all).toContain("Test Friday");
  });

  it("prints the web page of each assignment, announcement and material", async () => {
    const c = await connect();
    const todo = (await call(c, "get_todo")).text;
    expect(todo).toContain("link: https://classroom.google.com/c/Math/course/100/courseWork/w1");
    const assignments = (await call(c, "get_assignments", { course_id: "100" })).text;
    expect(assignments).toContain("link: https://classroom.google.com/c/Math/course/100/courseWork/w2");
    const announcements = (await call(c, "get_announcements")).text;
    expect(announcements).toContain("link: https://classroom.google.com/c/Math/course/100/announcements/a1");
    const materials = (await call(c, "get_course_materials", { course_id: "100" })).text;
    expect(materials).toContain("link: https://classroom.google.com/c/Math/course/100/courseWorkMaterials/m1");
  });

  it("prints the Drive link of every file attached to a material", async () => {
    const { text } = await call(await connect(), "get_course_materials", { course_id: "100" });
    expect(text).toContain("file: Week 3 slides, https://drive.google.com/file/d/abc123");
    expect(text).toContain("file: Chapter 3 handout, https://drive.google.com/file/d/def456");
  });

  it("leaves the link line out when the API sends no link", async () => {
    const c = await connect();
    const assignments = (await call(c, "get_assignments", { course_id: "100" })).text;
    expect(assignments).toContain("Reading");
    expect(assignments).not.toContain("courseWork/w4");
    const announcements = (await call(c, "get_announcements")).text;
    expect(announcements).toContain("Test Friday");
    expect(announcements).not.toContain("announcements/a2");
  });

  it("bundles new announcements, new grades, overdue work and what is due next", async () => {
    const { text } = await call(await connect(), "get_whats_new");
    expect(text).toContain("New announcements");
    expect(text).toContain("Bring your textbook");
    expect(text).not.toContain("Test Friday");
    expect(text).toContain("New grades");
    expect(text).toMatch(/Reading \(Math\) graded 4\/5 on /);
    expect(text).not.toContain("Essay");
    expect(text).toContain("Overdue work");
    expect(text).toMatch(/Worksheet 1 \(Math\) was due /);
    expect(text).toContain("Due next");
    expect(text).toMatch(/Project \(Math\) due /);
    expect(text).toMatch(/Outline \(English\) due /);
    expect(text).not.toContain("Quiz 2");
  });

  it("prints the Classroom link under each new announcement in the digest", async () => {
    const c = await connect();
    const digest = (await call(c, "get_whats_new")).text;
    expect(digest).toContain("Bring your textbook");
    expect(digest).toContain("link: https://classroom.google.com/c/Math/course/100/announcements/a1");
  });

  it("takes the window and the class list for the digest", async () => {
    const c = await connect();
    const wide = (await call(c, "get_whats_new", { since_days: 60 })).text;
    expect(wide).toContain("Test Friday");
    const narrow = (await call(c, "get_whats_new", { days_ahead: 1 })).text;
    expect(narrow).not.toContain("Project");
    expect(narrow).toContain("Nothing due in that time.");
    const one = (await call(c, "get_whats_new", { course_ids: ["200"] })).text;
    expect(one).toContain("Outline");
    expect(one).not.toContain("Math");
  });

  it("returns a friendly error when the token is rejected", async () => {
    const { text, isError } = await call(await connect("stale"), "get_my_courses");
    expect(isError).toBe(true);
    expect(text).toContain("Not signed in");
    expect(text).toContain("Run `login` again to get a new refresh token");
  });

  it("maps 403 and 404 to the README troubleshooting fixes", async () => {
    const c = await connect();
    const denied = await call(c, "get_assignments", { course_id: "403" });
    expect(denied.isError).toBe(true);
    expect(denied.text).toContain("Access denied");
    expect(denied.text).toContain("school's Google admin may block third party apps");
    expect(denied.text).toContain("Ask your admin or use a personal account");
    const missing = await call(c, "get_assignments", { course_id: "999" });
    expect(missing.isError).toBe(true);
    expect(missing.text).toContain("Not found");
    expect(missing.text).toContain("Check the course or item ID");
  });

  it("refreshes tokens, caches them and reports revoked tokens clearly", async () => {
    const tokenUrl = `${base}/token`;
    const good = createTokenProvider({ GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "s", GOOGLE_REFRESH_TOKEN: "rt-good" }, fetch, tokenUrl);
    refreshCalls = 0;
    expect(await good()).toBe("at-fresh");
    expect(await good()).toBe("at-fresh");
    expect(refreshCalls).toBe(1);
    const bad = createTokenProvider({ GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "s", GOOGLE_REFRESH_TOKEN: "rt-old" }, fetch, tokenUrl);
    await expect(bad()).rejects.toThrow(/expired or revoked/);
    await expect(bad()).rejects.toThrow(/expires refresh tokens after 7 days/);
    await expect(bad()).rejects.toThrow(/Run `login` again/);
    expect(await createTokenProvider({ GOOGLE_ACCESS_TOKEN: "quick" })()).toBe("quick");
    expect(() => createTokenProvider({})).toThrow(/No Google credentials/);
  });

  it("builds a read only sign in link and exchanges the code", async () => {
    const link = new URL(buildAuthUrl("my-id", "http://127.0.0.1:5000"));
    expect(link.searchParams.get("access_type")).toBe("offline");
    expect(link.searchParams.get("scope")).toBe(SCOPES.join(" "));
    for (const s of SCOPES) expect(s.endsWith(".readonly")).toBe(true);
    const ok = await exchangeCode({ clientId: "a", clientSecret: "b", code: "code-good", redirectUri: "http://x" }, fetch, `${base}/token`);
    expect(ok.refresh_token).toBe("rt-good");
    await expect(exchangeCode({ clientId: "a", clientSecret: "b", code: "other", redirectUri: "http://x" }, fetch, `${base}/token`)).rejects.toThrow(/refresh token/);
  });
});
