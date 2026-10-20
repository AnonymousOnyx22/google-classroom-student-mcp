# Google Classroom MCP for students

[![npm version](https://img.shields.io/npm/v/google-classroom-student-mcp.svg)](https://www.npmjs.com/package/google-classroom-student-mcp)
[![MCP](https://img.shields.io/badge/MCP-Model%20Context%20Protocol-blue.svg)](https://modelcontextprotocol.io)

Ask your AI what's actually left to do in Google Classroom.

This is a free, open source [MCP](https://modelcontextprotocol.io) server. It lets Claude, ChatGPT, Cursor and other AI apps read your Classroom classes, assignments, grades on returned work and announcements. It is **read only**. It can never turn in, edit or delete anything. Not affiliated with Google.

Free forever. No sign up and no subscription. Your login details only ever go to Google.

## Try it now

Ask these right after setup:

- "What do I still need to turn in?"
- "What's overdue?"
- "What's due this week across all my classes?"

## Quick start with npx

Add this to your AI app's MCP config (for Claude Desktop that's `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "classroom": {
      "command": "npx",
      "args": ["-y", "google-classroom-student-mcp"],
      "env": {
        "GOOGLE_CLIENT_ID": "your-id",
        "GOOGLE_CLIENT_SECRET": "your-secret",
        "GOOGLE_REFRESH_TOKEN": "paste-from-login"
      }
    }
  }
}
```

## Setup (about 10 minutes, one time)

Google makes every app ask for its own permission, so you create a small private "app" that only you use.

1. Go to the [Google Cloud console](https://console.cloud.google.com/) and create a project.
2. Turn on the **Google Classroom API** for it (APIs & Services > Library).
3. Under **APIs & Services > OAuth consent screen**, set it up as **External**, and add your own Google account as a **test user**.
4. Under **Credentials**, create an **OAuth client ID** of type **Desktop app**. Copy the client ID and secret.
5. Run the one time sign in:

```bash
GOOGLE_CLIENT_ID=your-id GOOGLE_CLIENT_SECRET=your-secret npx google-classroom-student-mcp login
```

Open the link it prints, approve read only access, and copy the three values it prints.

6. Add them to your AI app's MCP config (for Claude Desktop that's `claude_desktop_config.json`).

7. Restart your AI app and ask "what's due this week?"

Run `npx google-classroom-student-mcp doctor` any time to check that your setup works.

> Quick test without the app setup: set `GOOGLE_ACCESS_TOKEN` to a token from the [OAuth Playground](https://developers.google.com/oauthplayground/) with the Classroom read only scopes. It stops working after about an hour.

## What you can ask

- "What do I still need to turn in?"
- "What's overdue?"
- "What's due this week across all my classes?"
- "What did my teachers post lately?"

## Tools

All tools are read only.

| Tool | What it does |
| --- | --- |
| `get_my_courses` | Your active classes and their IDs |
| `get_todo` | Everything assigned that you haven't turned in |
| `get_upcoming_due_dates` | Work due soon, soonest first |
| `get_missing_assignments` | Past due work you haven't turned in |
| `get_assignments` | Assignments for a class with due dates and status |
| `get_my_grades` | Points earned on returned work for each class |
| `get_announcements` | Recent announcements |
| `get_course_materials` | Materials posted in a class |

Google Classroom has no overall course grade, so `get_my_grades` adds up graded work only and says so.

`get_todo`, `get_upcoming_due_dates`, `get_missing_assignments` and `get_my_grades` accept an optional list of course IDs, so you can ask about a few classes only instead of all of them. `get_upcoming_due_dates` also accepts an optional number of days to look ahead. `get_announcements` accepts course IDs too.

## Privacy and security

- Your credentials stay on your computer and are only sent to Google.
- Nothing is sent to any other server by this project.
- Only read only permissions are requested. Remove access any time at myaccount.google.com/permissions.

## Troubleshooting

| Message | Fix |
| --- | --- |
| Not signed in | Run `login` again to get a new refresh token. |
| Sign in failed, expired or revoked | While your app is in testing mode, Google expires refresh tokens after 7 days. Run `login` again. |
| Access denied | Your school's Google admin may block third party apps. Ask your admin or use a personal account. |
| Not found | Check the course or item ID in your request. |
| Google did not return a refresh token | Remove the app from your connected apps and run `login` again. |

## Development

```bash
npm install
npm run build
npm test
```

Tests run against a fake Google server, so they need no account or network.

## More free student MCP servers

All free, open source and read only where they touch your accounts. Browse the full list at [brightspacemcp.com/more-mcps](https://brightspacemcp.com/more-mcps/).

| Server | What it does |
| --- | --- |
| [Brightspace MCP](https://github.com/AnonymousOnyx22/brightspace-d2l-mcp) | D2L Brightspace for AI. Due dates with real submission status, grades, a target grade calculator and course files. |
| [Canvas MCP](https://github.com/AnonymousOnyx22/canvas-lms-student-mcp) | Read-only Canvas LMS for AI. Due dates, missing work, grades and announcements. |
| [Moodle MCP](https://github.com/AnonymousOnyx22/moodle-student-mcp) | Read-only Moodle for AI. Due dates, overdue work, grades and announcements. |
| [GPA Calculator MCP](https://github.com/AnonymousOnyx22/gpa-calculator-mcp) | GPA, grade conversion and what-do-I-need-on-the-final math for AI. Works offline, no account. |
| [Citations MCP](https://github.com/AnonymousOnyx22/student-citations-mcp) | APA, MLA and Chicago citations from a DOI, an ISBN or typed details. No account. |
| [Study Planner MCP](https://github.com/AnonymousOnyx22/study-planner-mcp) | Exam study schedules, spaced repetition dates, pomodoro plans and assignment milestones. Works offline. |
| [Paper Finder MCP](https://github.com/AnonymousOnyx22/paper-finder-student-mcp) | Search scholarly papers, find open access copies and related work through OpenAlex. No key needed. |

## License

MIT
