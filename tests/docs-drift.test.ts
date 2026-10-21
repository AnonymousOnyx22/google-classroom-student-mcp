import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { tools } from "../src/tools.js";

const expected = tools.map((t) => ({ name: t.name, description: t.description }));
const expectedNames = expected.map((t) => t.name);

/** Optional arguments that llms.txt talks about in its note under the tool list. */
const NOTED_PARAMS = ["course_ids", "days_ahead", "since_days"];

/** One tool line in llms.txt, for example "- get_todo: What is left to turn in." */
const TOOL_LINE = /^- ([a-z0-9_]+): (.*)$/;

/** One tool row in the README table, for example "| `get_todo` | What is left to turn in |". */
const README_ROW = /^\|\s*`([a-z0-9_]+)`\s*\|\s*(.*?)\s*\|\s*$/;

/** Words that say nothing about what a tool does. */
const FILLER_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "by", "each", "for", "from", "in", "is", "it", "its",
  "of", "on", "one", "or", "per", "that", "the", "this", "to", "with", "you", "your",
]);

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

/** The tool rows of the README table, each with the short summary the row gives. */
function readmeRows(): { name: string; summary: string }[] {
  const out: { name: string; summary: string }[] = [];
  for (const raw of toolsSection("README.md").split("\n")) {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    const m = line.match(README_ROW);
    if (m) out.push({ name: m[1], summary: m[2] });
  }
  return out;
}

/** The words of a piece of text that carry meaning, in lower case. */
function contentWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2 && !FILLER_WORDS.has(w)),
  );
}

function namesIn(text: string): string[] {
  return expectedNames.filter((name) => new RegExp(`\\b${name}\\b`).test(text));
}

/** The comparison between the Classroom server and the Brightspace server in the README. */
function compareSection(): string {
  const section = readRootFile("README.md")
    .split(/^## /m)
    .find((s) => s.startsWith("Google Classroom vs Brightspace"));
  expect(section, "README.md has no comparison section").toBeDefined();
  return section!;
}

/** Things the comparison says this server reads, so the table cannot drift from the tools. */
const COMPARED_THINGS = ["classes", "assignments", "grades", "announcements", "materials"];

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

describe("the README tool table stays in lockstep with the tool definitions", () => {
  it("lists every tool from src/tools.ts in the README table, once and in the same order", () => {
    expect(readmeRows().map((r) => r.name)).toEqual(expectedNames);
  });

  it("lists no tool in the README table that src/tools.ts does not have", () => {
    for (const row of readmeRows()) {
      expect(expectedNames, `README table lists an unknown tool ${row.name}`).toContain(row.name);
    }
  });

  it("gives every tool in the README table its own summary of what it does", () => {
    const rows = readmeRows();
    for (const row of rows) {
      expect(row.summary.length, `README table row for ${row.name} has no summary`).toBeGreaterThan(0);
      const same = rows.filter((r) => r.summary.toLowerCase() === row.summary.toLowerCase());
      expect(same.length, `README table rows share the summary "${row.summary}"`).toBe(1);
    }
  });

  it("writes every README summary about the tool the row belongs to", () => {
    for (const row of readmeRows()) {
      const tool = tools.find((t) => t.name === row.name);
      expect(tool, `README table lists an unknown tool ${row.name}`).toBeDefined();
      const words = contentWords(tool!.description);
      const shared = [...contentWords(row.summary)].filter((w) => words.has(w));
      expect(shared.length, `README summary for ${row.name} shares no word with the tool description`).toBeGreaterThan(0);
    }
  });
});

describe("the README points at llms.txt", () => {
  it("has a link to llms.txt so site indexes find the plain text tool list", () => {
    expect(readRootFile("README.md")).toMatch(LLMS_LINK);
  });
});

/** The directories the server is listed in, each with the page that shows it. */
const LISTINGS = [
  { name: "Smithery", url: "https://smithery.ai/server/google-classroom-student-mcp" },
  { name: "Glama", url: "https://glama.ai/mcp/servers/AnonymousOnyx22/google-classroom-student-mcp" },
  { name: "mcp.so", url: "https://mcp.so/servers/google-classroom-student-mcp" },
];

/** One badge line in the README, for example "[![npm version](image)](link)". */
const BADGE_LINE = /^\[!\[([^\]]+)\]\(([^)]+)\)\]\(([^)]+)\)$/;

/** The header of the README, the part above the first section. */
function readmeHeader(): string {
  return readRootFile("README.md").split(/^## /m)[0];
}

/** The badges in the README, each with its name, its image and the page it links to. */
function readmeBadges(): { name: string; image: string; link: string }[] {
  const out: { name: string; image: string; link: string }[] = [];
  for (const raw of readRootFile("README.md").split("\n")) {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    const m = line.match(BADGE_LINE);
    if (m) out.push({ name: m[1], image: m[2], link: m[3] });
  }
  return out;
}

describe("the README header shows the directories the server is listed in", () => {
  it("has a badge for every directory, and it links to the server page there", () => {
    const badges = readmeBadges();
    for (const listing of LISTINGS) {
      const badge = badges.find((b) => b.name === listing.name);
      expect(badge, `README has no badge for ${listing.name}`).toBeDefined();
      expect(badge!.link, `the ${listing.name} badge links somewhere else`).toBe(listing.url);
    }
  });

  it("keeps the badges in the header, above the first section", () => {
    const header = readmeHeader();
    for (const listing of LISTINGS) {
      expect(header, `the ${listing.name} badge is not in the header`).toContain(`[${listing.name}]`);
    }
  });

  it("names the same directories in the text", () => {
    const readme = readRootFile("README.md");
    for (const listing of LISTINGS) {
      expect(readme, `the text does not mention ${listing.name}`).toContain(`[${listing.name}](${listing.url})`);
    }
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

describe("the README compares the Classroom server with the Brightspace server", () => {
  it("has a comparison section that names both packages", () => {
    const section = compareSection();
    expect(section).toContain("google-classroom-student-mcp");
    expect(section).toContain("brightspace-d2l-mcp");
  });

  it("describes what this server really reads", () => {
    const section = compareSection().toLowerCase();
    for (const thing of COMPARED_THINGS) {
      expect(section, `comparison mentions ${thing}`).toContain(thing);
    }
  });

  it("says both servers are read only", () => {
    const row = compareSection()
      .split("\n")
      .find((line) => line.trim().startsWith("| Read only |"));
    expect(row, "comparison has no read only row").toBeDefined();
    expect(row!.toLowerCase().split("yes").length - 1).toBe(2);
  });
});

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
