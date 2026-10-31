import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createClassroomApi } from "../src/classroom.js";
import { createServer } from "../src/server.js";

const json = (code: number, data: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status: code, headers: { "content-type": "application/json", ...headers } });

const fast = { baseDelayMs: 1 };

describe("retries", () => {
  it("retries a 429 and then succeeds", async () => {
    let calls = 0;
    const f = (async () => (++calls < 3 ? json(429, {}, { "retry-after": "0" }) : json(200, { ok: true }))) as unknown as typeof fetch;
    const api = createClassroomApi(async () => "t", "http://x", f, fast);
    expect(await api.get("/v1/courses")).toEqual({ ok: true });
    expect(calls).toBe(3);
  });

  it("retries a 403 that says rate limit but not a plain 403", async () => {
    let limited = 0;
    const f1 = (async () => (++limited < 2 ? json(403, { error: { errors: [{ reason: "rateLimitExceeded" }] } }) : json(200, {}))) as unknown as typeof fetch;
    await createClassroomApi(async () => "t", "http://x", f1, fast).get("/a");
    expect(limited).toBe(2);

    let plain = 0;
    const f2 = (async () => (plain++, json(403, {}))) as unknown as typeof fetch;
    await expect(createClassroomApi(async () => "t", "http://x", f2, fast).get("/a")).rejects.toMatchObject({ status: 403 });
    expect(plain).toBe(1);
  });

  it("gives up after the retries run out", async () => {
    let calls = 0;
    const f = (async () => (calls++, json(503, {}))) as unknown as typeof fetch;
    await expect(createClassroomApi(async () => "t", "http://x", f, { retries: 2, baseDelayMs: 1 }).get("/a")).rejects.toMatchObject({ status: 503 });
    expect(calls).toBe(3);
  });
});

describe("get_whats_new with a failing class", () => {
  async function digest(failAll: boolean) {
    const f = (async (url: string) => {
      const p = new URL(url).pathname;
      if (p === "/v1/courses") return json(200, { courses: [{ id: "1", name: "Math" }, { id: "2", name: "Art" }] });
      if (p.startsWith("/v1/courses/2/") || failAll) return json(403, {});
      if (p.endsWith("/announcements"))
        return json(200, { announcements: [{ text: "Bring a ruler", updateTime: new Date().toISOString() }] });
      return json(200, {});
    }) as unknown as typeof fetch;
    const server = createServer(createClassroomApi(async () => "t", "http://x", f, fast));
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test", version: "0" });
    await Promise.all([server.connect(a), client.connect(b)]);
    const res: any = await client.callTool({ name: "get_whats_new", arguments: {} });
    return { text: res.content[0].text as string, isError: Boolean(res.isError) };
  }

  it("keeps the other classes and names the one it left out", async () => {
    const { text, isError } = await digest(false);
    expect(isError).toBe(false);
    expect(text).toContain("Bring a ruler");
    expect(text).toContain("Could not load 1 of 2 classes");
    expect(text).toContain("Art");
  });

  it("still reports an error when every class fails", async () => {
    expect((await digest(true)).isError).toBe(true);
  });
});

describe("get_whats_new with many classes", () => {
  async function many(count: number, failing: string[] = []) {
    const seen = new Set<string>();
    const courses = Array.from({ length: count }, (_, i) => ({ id: String(i + 1), name: `Class ${i + 1}` }));
    const f = (async (url: string) => {
      const p = new URL(url).pathname;
      if (p === "/v1/courses") return json(200, { courses });
      const id = p.split("/")[3];
      seen.add(id);
      if (failing.includes(id)) return json(403, {});
      return json(200, {});
    }) as unknown as typeof fetch;
    const server = createServer(createClassroomApi(async () => "t", "http://x", f, fast));
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test", version: "0" });
    await Promise.all([server.connect(a), client.connect(b)]);
    const res: any = await client.callTool({ name: "get_whats_new", arguments: {} });
    return { text: res.content[0].text as string, isError: Boolean(res.isError), seen };
  }

  it("reads only the first 15 classes and says so", async () => {
    const { text, seen } = await many(20);
    expect(text).toContain("showing first 15 of 20 classes");
    expect(seen.size).toBe(15);
    expect(seen.has("16")).toBe(false);
  });

  it("does not print the cap line for exactly 15 classes", async () => {
    const { text, seen } = await many(15);
    expect(text).not.toContain("showing first");
    expect(seen.size).toBe(15);
  });

  it("counts failures against the classes it tried, not the total", async () => {
    const { text, isError } = await many(20, ["2", "3"]);
    expect(isError).toBe(false);
    expect(text).toContain("showing first 15 of 20 classes");
    expect(text).toContain("Could not load 2 of 15 classes");
    expect(text).toContain("Class 2");
    expect(text).toContain("Class 3");
  });
});
