#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createTokenProvider } from "./auth.js";
import { createClassroomApi } from "./classroom.js";
import { login } from "./login.js";
import { createServer, VERSION } from "./server.js";
import { setupText } from "./setup.js";

function usage(): void {
  console.log(`google-classroom-student-mcp ${VERSION}

Read-only Google Classroom server for AI apps (MCP).

Environment
  GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN
                     Your own Google OAuth client and the refresh token from "login"
  GOOGLE_ACCESS_TOKEN
                     Optional. A short lived token for a quick one hour test

Commands
  (no command)       Start the MCP server over stdio
  setup              Print the MCP config to paste into your AI app
  login              One time sign in. Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET
  doctor             Check that your credentials work
  --help, --version`);
}

async function main(): Promise<void> {
  const cmd = process.argv[2];
  if (cmd === "--help" || cmd === "-h") return usage();
  if (cmd === "--version" || cmd === "-v") return console.log(VERSION);

  if (cmd === "setup") return console.log(setupText(process.env));

  if (cmd === "login") {
    const id = process.env.GOOGLE_CLIENT_ID;
    const secret = process.env.GOOGLE_CLIENT_SECRET;
    if (!id || !secret) {
      console.error("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET first. The README shows how to make them.");
      process.exit(1);
    }
    return login(id, secret);
  }

  let provider;
  try {
    provider = createTokenProvider(process.env);
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
  const api = createClassroomApi(provider);

  if (cmd === "doctor") {
    try {
      const courses = await api.list<{ name: string }>("/v1/courses", "courses", { courseStates: "ACTIVE", studentId: "me" }, 1);
      console.log(`Connected. Found ${courses.length} active class${courses.length === 1 ? "" : "es"}.`);
    } catch (e) {
      console.error(`Could not connect. ${(e as Error).message}`);
      process.exit(1);
    }
    return;
  }

  const server = createServer(api);
  await server.connect(new StdioServerTransport());
  console.error(`google-classroom-student-mcp ${VERSION} running`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
