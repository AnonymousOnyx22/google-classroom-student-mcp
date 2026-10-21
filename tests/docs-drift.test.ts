import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { tools } from "../src/tools.js";

const expected = tools.map((t) => ({ name: t.name, description: t.description }));
const expectedNames = expected.map((t) => t.name);

/** Optional arguments that llms.txt talks about in its note under the tool list. */
const NOTED_PARAMS = ["course_ids", "days_ahead"];

/** One tool line in llms.txt, for example "- get_todo: What is left to turn in." */
const TOOL_LINE = /^- ([a-z0-9_]+): (.*)$/;

/** A markdown link to llms.txt in the README, for example "[llms.txt](./llms.txt)". */
const LLMS_LINK = /\]\(\s*\.?\/?llms\.txt\s*\)/;

function readRootFile(name: string): string {
  return readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
}

function toolsSection(file: string): string {
  const section = readRootFile(file).split(/^## /m).find((s) => s.startsWith("Tools"));
  expect(section, `${file} has no Tools section`).toBeDefined();
  return section!;
}

function llmsEntries(): { name: string; description: string }[] {
  const out: { name: string; description: string }[] = [];
  for (const raw of toolsSection("llms.txt").split("\n")) {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    const m = line.match(TOOL_LINE);
    if (m) out.push({ name: m[1], description: m[2] });
  }
  return out;
}

function glamaEntries(): { name: string; description: string }[] {
  const json = JSON.parse(readRootFile("glama.json"));
  expect(Array.isArray(json.tools), "glama.json has no tools array").toBe(true);
  return json.tools;
}

/** The prose under the tool list in llms.txt, where the optional arguments are described. */
function llmsNote(): string {
  return toolsSection("llms.txt")
    .split("\n")
    .filter((line) => !TOOL_LINE.test(line))
    .join("\n");
}

/** The prose under the tool table in README.md, where the optional arguments are described. */
function readmeNote(): string {
  return toolsSection("README.md")
    .split("\n")
    .filter((line) => !line.trim().startsWith("|"))
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");
}

function namesIn(text: string): string[] {
  return expectedNames.filter((name) => new RegExp(`\\b${name}\\b`).test(text));
}

/** Tools a note says take the given optional argument. */
function notedToolsIn(note: string, param: string): string[] {
  const claims = new Set<string>();
  for (const sentence of note.split(/(?<=[.!?])\s+/)) {
    if (!sentence.includes(param)) continue;
    for (const name of namesIn(sentence)) claims.add(name);
  }
  return [...claims];
}

/** Tools the llms.txt note says take the given optional argument. */
function notedTools(param: string): string[] {
  return notedToolsIn(llmsNote(), param);
}

/** Tools that really take the given argument. */
function toolsWithParam(param: string): string[] {
  return tools.filter((t) => Object.hasOwn(t.inputSchema, param)).map((t) => t.name);
}

describe("llms.txt and glama.json stay in lockstep with the tool definitions", () => {
  it("lists every tool from src/tools.ts in llms.txt, once and in the same order", () => {
    expect(llmsEntries().map((t) => t.name)).toEqual(expectedNames);
  });

  it("lists every tool from src/tools.ts in glama.json, once and in the same order", () => {
    expect(glamaEntries().map((t) => t.name)).toEqual(expectedNames);
  });

  it("uses the exact tool descriptions from src/tools.ts in llms.txt", () => {
    const listed = llmsEntries();
    for (const tool of expected) {
      const found = listed.find((t) => t.name === tool.name);
      expect(found?.description, `llms.txt description for ${tool.name}`).toBe(tool.description);
    }
  });

  it("uses the exact tool descriptions from src/tools.ts in glama.json", () => {
    const listed = glamaEntries();
    for (const tool of expected) {
      const found = listed.find((t) => t.name === tool.name);
      expect(found?.description, `glama.json description for ${tool.name}`).toBe(tool.description);
    }
  });

  it("gives a real example ask in every tool description", () => {
    for (const tool of expected) {
      const examples = tool.description.match(/'[^']+\?'/g) ?? [];
      expect(examples.length, `example asks in the description for ${tool.name}`).toBeGreaterThanOrEqual(1);
      expect(tool.description, `description for ${tool.name}`).toContain("Use this when the user asks");
    }
  });

  it("names the right tools for the optional arguments in the llms.txt note", () => {
    for (const param of NOTED_PARAMS) {
      expect(notedTools(param).sort(), `llms.txt note about ${param}`).toEqual(toolsWithParam(param).sort());
    }
  });

  it("names the right tools for the optional arguments in the README", () => {
    for (const param of NOTED_PARAMS) {
      expect(notedToolsIn(readmeNote(), param).sort(), `README note about ${param}`).toEqual(toolsWithParam(param).sort());
    }
  });
});

describe("the README points at llms.txt", () => {
  it("has a link to llms.txt so site indexes find the plain text tool list", () => {
    expect(readRootFile("README.md")).toMatch(LLMS_LINK);
  });
});

/** One line of the sample answer, for example "- Essay outline (English) due Fri, Oct 23". */
const SAMPLE_LINE = /^- .+ \(.+\) due .+$/;

/** The heading of the sample answer section in the README and in llms.txt. */
const SAMPLE_HEADING = /^#+ (Sample|Example) answer$/;

/** A fixed clock, so the sample answer does not move with the day. */
const FIXED_NOW = new Date("2026-10-21T12:00:00Z");

/** The sample answer lines that follow the sample heading in a file. */
function sampleLines(file: string): string[] {
  const lines = readRootFile(file)
    .split("\n")
    .map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l));
  const start = lines.findIndex((l) => SAMPLE_HEADING.test(l));
  expect(start, `${file} has no sample answer section`).toBeGreaterThan(-1);
  const out: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^#+ /.test(line)) break;
    if (SAMPLE_LINE.test(line)) out.push(line);
  }
  return out;
}

/** A stand in Classroom API that returns the given course work, so the sample can be checked against real tool output. */
function stubApi(work: any[]): any {
  return {
    get: async () => ({}),
    list: async (path: string) => {
      if (path === "/v1/courses") return [{ id: "1", name: "English" }];
      if (path.endsWith("/studentSubmissions")) return [];
      return work;
    },
  };
}

describe("the sample answer matches what the tool prints", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("puts the sample answer under the example asks in the README first screen", () => {
    const readme = readRootFile("README.md");
    const ask = readme.indexOf('- "What\'s due this week across all my classes?"');
    expect(ask).toBeGreaterThan(-1);
    const heading = readme.search(/^#+ Sample answer$/m);
    expect(heading).toBeGreaterThan(ask);
    expect(heading).toBeLessThan(readme.indexOf("\n## ", ask));
  });

  it("prints the sample lines the way get_upcoming_due_dates prints them", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    const tool = tools.find((t) => t.name === "get_upcoming_due_dates")!;
    const noTime = await tool.run(
      {},
      stubApi([{ id: "w1", title: "Essay outline", dueDate: { year: 2026, month: 10, day: 23 } }]),
    );
    expect(noTime).toBe("- Essay outline (English) due Fri, Oct 23");
    const withTime = await tool.run(
      {},
      stubApi([
        { id: "w2", title: "Lab write up", dueDate: { year: 2026, month: 10, day: 23 }, dueTime: { hours: 23, minutes: 59 } },
      ]),
    );
    expect(withTime).toMatch(/^- Lab write up \(English\) due .+, \d{1,2}:\d{2} [ap]\.m\. \w+$/);
  });

  it("shows the same sample lines in the README and in llms.txt", () => {
    const lines = sampleLines("README.md");
    expect(lines.length).toBeGreaterThanOrEqual(3);
    expect(lines[0]).toBe("- Essay outline (English) due Fri, Oct 23");
    expect(sampleLines("llms.txt")).toEqual(lines);
  });
});
