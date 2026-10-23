import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/** The phrase people search for on npm. */
const PHRASE = "google classroom mcp";

/** The longer phrases students type into npm search. */
const LONG_TAIL_KEYWORDS = [
  "assignment tracker",
  "homework tracker",
  "classroom due dates tracker",
  "lms deadline tracker",
];

/** How many keywords the list has today. It should only ever grow. */
const MIN_KEYWORDS = 85;

function readRootFile(name: string): string {
  return readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
}

function readRootJson(name: string): any {
  return JSON.parse(readRootFile(name));
}

describe("package metadata keeps the google classroom mcp phrase", () => {
  it("keeps the phrase in the npm description", () => {
    const pkg = readRootJson("package.json");
    expect(pkg.description.toLowerCase()).toContain(PHRASE);
  });

  it("keeps the phrase in the npm keywords", () => {
    const pkg = readRootJson("package.json");
    const keywords: string[] = pkg.keywords;
    expect(keywords.map((k) => k.toLowerCase())).toContain(PHRASE);
  });

  it("keeps the phrase in the registry description and title", () => {
    const server = readRootJson("server.json");
    expect(server.description.toLowerCase()).toContain(PHRASE);
    expect(server.title.toLowerCase()).toContain(PHRASE);
  });

  it("keeps the registry description within 100 characters", () => {
    const server = readRootJson("server.json");
    expect(server.description.length).toBeLessThanOrEqual(100);
  });

  it("keeps the long tail phrases students search for", () => {
    const pkg = readRootJson("package.json");
    const keywords = pkg.keywords.map((k: string) => k.toLowerCase());
    for (const phrase of LONG_TAIL_KEYWORDS) {
      expect(keywords, `package.json keywords are missing "${phrase}"`).toContain(phrase);
    }
  });

  it("keeps the keyword list from shrinking", () => {
    const pkg = readRootJson("package.json");
    expect(pkg.keywords.length).toBeGreaterThanOrEqual(MIN_KEYWORDS);
  });

  it("lists each keyword only once", () => {
    const pkg = readRootJson("package.json");
    const keywords = pkg.keywords.map((k: string) => k.toLowerCase());
    expect(new Set(keywords).size).toBe(keywords.length);
  });

  it("keeps the name and the binary name unchanged", () => {
    const pkg = readRootJson("package.json");
    expect(pkg.name).toBe("google-classroom-student-mcp");
    expect(pkg.bin["google-classroom-student-mcp"]).toBe("build/src/index.js");
  });

  it("mentions the phrase in the README and llms.txt", () => {
    expect(readRootFile("README.md").toLowerCase()).toContain(PHRASE);
    expect(readRootFile("llms.txt").toLowerCase()).toContain(PHRASE);
  });
});

/** The page that lists every free student MCP server. */
const LISTING_URL = "https://brightspacemcp.com/more-mcps/";

describe("the package points at the listing page", () => {
  it("uses the listing page as the npm homepage", () => {
    const pkg = readRootJson("package.json");
    expect(pkg.homepage).toBe(LISTING_URL);
  });

  it("uses the listing page as the website in server.json", () => {
    const server = readRootJson("server.json");
    expect(server.websiteUrl).toBe(LISTING_URL);
  });
});
