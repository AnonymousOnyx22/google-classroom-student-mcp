import type { AuthEnv } from "./auth.js";

const PACKAGE_NAME = "google-classroom-student-mcp";

export interface SetupConfig {
  mcpServers: {
    classroom: {
      command: string;
      args: string[];
      env: {
        GOOGLE_CLIENT_ID: string;
        GOOGLE_CLIENT_SECRET: string;
        GOOGLE_REFRESH_TOKEN: string;
      };
    };
  };
}

/**
 * The mcpServers block every MCP app accepts. Values that are already in the
 * environment are filled in, so a student who just ran the login command can
 * copy the block without editing it.
 */
export function setupConfig(env: AuthEnv = {}): SetupConfig {
  return {
    mcpServers: {
      classroom: {
        command: "npx",
        args: ["-y", PACKAGE_NAME],
        env: {
          GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID || "your-id",
          GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET || "your-secret",
          GOOGLE_REFRESH_TOKEN: env.GOOGLE_REFRESH_TOKEN || "paste-from-login",
        },
      },
    },
  };
}

/** Ready to paste setup text, with one config block for each MCP app. */
export function setupText(env: AuthEnv = {}): string {
  const json = JSON.stringify(setupConfig(env), null, 2);
  return `MCP config for ${PACKAGE_NAME}

Run the login command first to get the three Google values, then paste the
block for your app. The values below come from your environment when they are
set, otherwise they are placeholders.

Claude Desktop
File: claude_desktop_config.json (Settings > Developer > Edit Config)

${json}

Claude Code
File: .mcp.json in your project folder

${json}

Cursor
File: .cursor/mcp.json in your project folder, or ~/.cursor/mcp.json for every project

${json}

Other MCP apps
Use the same mcpServers block, with command set to npx and args set to
["-y", "${PACKAGE_NAME}"].

After you paste it, restart your app and run
npx ${PACKAGE_NAME} doctor to check the three values.`;
}
