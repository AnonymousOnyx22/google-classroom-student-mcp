Where this goes: the Google Classroom page on brightspacemcp.com, then the same text in the MCP Discord, r/mcp and r/ClaudeAI. For Reddit, use the heading as the post title.

# Google Classroom MCP for students

I built an MCP server that lets Claude Desktop, Claude Code, Cursor, VS Code and Windsurf read my Google Classroom. It answers the questions I actually have during the week: what is due, what is overdue, what did I forget to turn in, and what did my teacher say on the work I got back.

It is read only. It cannot turn in, edit or delete anything. It is free, open source and MIT licensed, with no sign up. Your Google login only ever goes to Google.

## What it can read

- Your active classes and their IDs
- Everything you have not turned in, with a link to open it in Classroom
- Work that is due soon, soonest first
- Work that was due and is still missing
- Assignments for one class, with due dates and status
- Points earned on returned work, with the comment your teacher left
- The points you need on the work that is left to reach a target percent
- Recent announcements and course materials, including Drive links for attached files
- One catch up digest with new announcements, new grades, overdue work and what is due next

## Install

```bash
npx -y google-classroom-student-mcp setup
```

That prints the config block for your app, with the Google values filled in when they are in your environment. Setup takes about 10 minutes the first time, because Google makes every app ask for its own permission. You create a small private Google Cloud project, run the one time sign in, and paste three values into your MCP config. The README has the steps.

One thing to know: while your Cloud project is in testing mode, Google expires the refresh token every 7 days, so you run the login command again now and then.

## Try asking

- "What do I still need to turn in?"
- "What's overdue?"
- "What's due this week across all my classes?"
- "What do I need to score to get a 90?"
- "What's new since yesterday?"

## Why I made it

I kept opening Classroom class by class just to work out what was actually left. The information was there, but getting it into one place took longer than it should. Now I ask once and get a short list with links.

If it saves you time, a star on GitHub helps other students find it: https://github.com/AnonymousOnyx22/google-classroom-student-mcp

It is also on npm: https://www.npmjs.com/package/google-classroom-student-mcp
