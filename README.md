# Google Classroom MCP for students

Ask your AI what's actually left to do in Google Classroom.

This is a free, open source [MCP](https://modelcontextprotocol.io) server. It lets Claude, ChatGPT, Cursor and other AI apps read your Classroom classes, assignments, grades on returned work and announcements. It is **read only**. It can never turn in, edit or delete anything. Not affiliated with Google.

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

6. Add them to your AI app's MCP config (for Claude Desktop that's `claude_desktop_config.json`):

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
| Google did not return a refresh token | Remove the app from your connected apps and run `login` again. |

## Development

```bash
npm install
npm run build
npm test
```

Tests run against a fake Google server, so they need no account or network.

## Also available

- [Brightspace MCP](https://brightspacemcp.com) for D2L Brightspace, with a hosted version, deadline alerts and a daily digest.

## License

MIT
