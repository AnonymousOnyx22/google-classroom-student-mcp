# Google Classroom MCP server for students

[![npm version](https://img.shields.io/npm/v/google-classroom-student-mcp.svg)](https://www.npmjs.com/package/google-classroom-student-mcp)
[![MCP](https://img.shields.io/badge/MCP-Model%20Context%20Protocol-blue.svg)](https://modelcontextprotocol.io)
[![Smithery](https://img.shields.io/badge/Smithery-Google%20Classroom%20MCP-blue.svg)](https://smithery.ai/server/google-classroom-student-mcp)
[![Glama](https://img.shields.io/badge/Glama-Google%20Classroom%20MCP-blue.svg)](https://glama.ai/mcp/servers/AnonymousOnyx22/google-classroom-student-mcp)
[![mcp.so](https://img.shields.io/badge/mcp.so-Google%20Classroom%20MCP-blue.svg)](https://mcp.so/servers/google-classroom-student-mcp)

Ask your AI what's actually left to do in Google Classroom.

This is the Google Classroom MCP server: a free, open source [MCP](https://modelcontextprotocol.io) server that lets Claude, ChatGPT, Cursor and other AI apps read your Classroom classes, assignments, due dates, missing work, grades on returned work with the comments your teachers leave on them, the points you need to reach a target grade, announcements, course materials and a catch up digest. It is **read only**. It can never turn in, edit or delete anything. Not affiliated with Google.

Free forever. No sign up and no subscription. Your login details only ever go to Google.

## Try it now

Ask these right after setup:

- "What do I still need to turn in?"
- "What's overdue?"
- "What's due this week across all my classes?"
- "What did my teacher say about my work?"
- "What do I need to score to get a 90?"
- "What's new since yesterday?"

### Sample answer

The third question goes to `get_upcoming_due_dates`. It reads your classes and prints one line per assignment, soonest first. Here is what an answer looks like:

```text
- Essay outline (English) due Fri, Oct 23
- Lab write up (Biology) due Fri, Oct 23, 11:59 p.m. UTC
- Problem set 4 (Calculus) due Mon, Oct 26
```

Every line has the assignment title, the class and the due date. Work you already turned in is left out. Pass `days_ahead` set to 7 to that tool for a week ahead. Classroom keeps due times in UTC, and the server prints them in your own time zone. More sample answers are in [Questions students ask](#questions-students-ask).

## Quick start with npx

Install the Google Classroom MCP server with npx, then add it to your AI app. Pick your app below.

### Claude Desktop

Add this to `claude_desktop_config.json`:

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

### Claude Code

Run this one command:

```bash
claude mcp add google-classroom-student-mcp \
  -e GOOGLE_CLIENT_ID=your-id \
  -e GOOGLE_CLIENT_SECRET=your-secret \
  -e GOOGLE_REFRESH_TOKEN=paste-from-login \
  -- npx -y google-classroom-student-mcp
```

Or put the same JSON block as Claude Desktop in a `.mcp.json` file in your project folder, or run `claude mcp add-json` with it.

### Cursor

Put this in `.cursor/mcp.json` in your project folder, or in `~/.cursor/mcp.json` to use it everywhere:

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

Other MCP apps take the same `mcpServers` JSON, with `command` set to `npx` and `args` set to `["-y", "google-classroom-student-mcp"]`.

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

6. Add them to your AI app's MCP config, using one of the formats from the Quick start above.

7. Restart your AI app and ask "what's due this week?"

Run `npx google-classroom-student-mcp doctor` any time to check that your setup works.

> Quick test without the app setup: set `GOOGLE_ACCESS_TOKEN` to a token from the [OAuth Playground](https://developers.google.com/oauthplayground/) with the Classroom read only scopes. It stops working after about an hour.

## Questions students ask

Here are the questions students ask, and the tool that answers each one. The answer comes back in the chat, ready to read.

| Your question | Tool | What the answer holds |
| --- | --- | --- |
| "What do I still need to turn in?" | `get_todo` | Every assignment you have not handed in, with a link to open it in Classroom |
| "What's overdue?" | `get_missing_assignments` | Work that was due and is still not handed in |
| "What's due this week across all my classes?" | `get_upcoming_due_dates` | Work that is due soon, soonest first |
| "What did my teacher say about my work?" | `get_my_grades` | The comment the teacher left on the graded work, with the score and a link to open it in Classroom |
| "What do I need to score to get a 90?" | `get_target_grade` | The points you need on the work that is left to reach that percent in each class |
| "What did my teachers post lately?" | `get_announcements` | Recent announcements from every class |
| "What's new since yesterday?" | `get_whats_new` | New announcements, new grades, overdue work and what is due next |

Here is what the answers look like.

### Sample answer for get_todo

The question "What do I still need to turn in?" goes to `get_todo`. It prints everything you have not handed in, and it puts the Classroom page of each one under the title so you can open the work itself.

```text
- Lab safety form (English) due Fri, Oct 9
  link: https://classroom.google.com/c/English/course/1/courseWork/w2
- Chapter 3 questions (Biology) due Mon, Oct 19
  link: https://classroom.google.com/c/Biology/course/2/courseWork/w4
- Essay outline (English) due Fri, Oct 23
  link: https://classroom.google.com/c/English/course/1/courseWork/w1
- Lab write up (Biology) due Fri, Oct 23, 11:59 p.m. UTC
  link: https://classroom.google.com/c/Biology/course/2/courseWork/w3
- Problem set 4 (Calculus) due Mon, Oct 26
  link: https://classroom.google.com/c/Calculus/course/3/courseWork/w5
```

Work you already turned in is left out, and work with no due date goes last. Pass `course_ids` to check a few classes only.

### Sample answer for get_missing_assignments

The question "What's overdue?" goes to `get_missing_assignments`. It prints the work that was due and is still not handed in, the most recent due date first.

```text
- Chapter 3 questions (Biology) was due Mon, Oct 19
- Lab safety form (English) was due Fri, Oct 9
```

### Sample answer for get_whats_new

The question "What's new since yesterday?" goes to `get_whats_new`. It prints one digest with new announcements, new grades, overdue work and what is due next. The times in this sample are in UTC.

```text
New announcements (last 7 days)
- Biology (Wed, Oct 21, 8:00 a.m. UTC) Field trip permission slip due Friday
- English (Tue, Oct 20, 9:00 a.m. UTC) Bring your textbook

New grades (last 7 days)
- Midterm review (Calculus) graded 88/100 on Tue, Oct 20, 3:00 p.m. UTC
  teacher said: Good work on the analysis. Watch the units on question 3.
  link: https://classroom.google.com/c/Calculus/course/3/courseWork/w6

Overdue work
- Chapter 3 questions (Biology) was due Mon, Oct 19
- Lab safety form (English) was due Fri, Oct 9

Due next (14 days)
- Essay outline (English) due Fri, Oct 23
- Lab write up (Biology) due Fri, Oct 23, 11:59 p.m. UTC
- Problem set 4 (Calculus) due Mon, Oct 26
```

Pass `since_days` to look further back and `days_ahead` to look further ahead.

## Tools

All tools are read only.

| Tool | What it does |
| --- | --- |
| `get_my_courses` | Your active classes and their IDs |
| `get_todo` | Everything assigned that you haven't turned in |
| `get_upcoming_due_dates` | Work due soon, soonest first |
| `get_missing_assignments` | Past due work you haven't turned in |
| `get_assignments` | Assignments for a class with due dates and status |
| `get_my_grades` | Points earned on returned work for each class, with the comment the teacher left |
| `get_target_grade` | Points needed on the work left to reach a target percent |
| `get_announcements` | Recent announcements |
| `get_course_materials` | Materials posted in a class |
| `get_whats_new` | One catch up digest: new announcements, new grades, overdue work and what is due next |

The same list is in plain text in [llms.txt](./llms.txt), one line per tool with its description and the arguments it takes. That file ships with the package, so site indexes and AI apps that read plain text files can pick it up.

get_todo, get_assignments, get_announcements and get_course_materials print the Classroom page of each item under the title, so the AI can hand the student a direct link to the work. get_course_materials also prints the Drive link of every file attached to a material. Classroom sends a link only for published items.

Google Classroom has no overall course grade, so `get_my_grades` adds up graded work only and says so.

`get_my_grades` and `get_whats_new` print what the teacher wrote when they returned the work, under the score, with the Classroom page of the work. `get_my_grades` lists the graded work that has a comment under each class.

`get_todo`, `get_upcoming_due_dates`, `get_missing_assignments`, `get_my_grades`, `get_target_grade` and `get_whats_new` accept an optional list of course IDs (`course_ids`), so you can ask about a few classes only instead of all of them. `get_upcoming_due_dates` and `get_whats_new` also accept an optional number of days to look ahead (`days_ahead`). `get_whats_new` also accepts an optional number of days to look back (`since_days`), which defaults to 7 days. `get_announcements` accepts course IDs (`course_ids`) too. `get_target_grade` takes a required `target_percent` from 0 to 100, which is the class percent you want.

`get_target_grade` adds up the points earned on graded work and the points the work that is left is worth. It then works out how many of those points you need to reach `target_percent`. Work counts as left when it has points and no grade yet, and work the teacher already returned without a grade is left out. If the target needs more points than the work left is worth, the answer says so and gives the best percent you can still reach. The server only sees the points on each piece of work, not any weighting the teacher may use, so the answer counts every point the same.

`get_whats_new` is the catch up digest. It prints new announcements, new grades with the comment the teacher left, overdue work and what is due next in one answer. An announcement counts as new when it was posted or changed inside the window. The date of a new grade comes from the teacher's comment on the work when there is one, otherwise from the last change to the assignment. The comment itself is printed under the grade.

## Google Classroom vs Brightspace MCP

Google Classroom and D2L Brightspace are different platforms, so they need different servers. This one reads Google Classroom. The [Brightspace MCP](https://github.com/AnonymousOnyx22/brightspace-d2l-mcp) reads D2L Brightspace. Here is how they line up.

| | Google Classroom MCP (this one) | Brightspace MCP |
| --- | --- | --- |
| Platform | Google Classroom, the one inside Google Workspace for Education | D2L Brightspace, common in colleges and universities |
| Install | `npx -y google-classroom-student-mcp`, then three values in your app config | `npx brightspace-d2l-mcp setup`, which writes the config for you |
| Sign in | You make your own OAuth app in the Google Cloud console, run one time sign in, then paste the client ID, the client secret and the refresh token | You pick your school and sign in with your own school account in a browser window. Any sign in method your school uses works, and your password is never stored |
| After setup | While your Cloud app is in testing mode, Google expires the refresh token every 7 days, so you run the login command again now and then | It stays signed in quietly, and a browser window only opens when your school asks you to sign in again |
| What your school has to do | Nothing. Your own Google account and your own Cloud project are enough, though a school admin can block third party apps | Nothing. It uses your own student sign in, so no API key from an administrator is needed |
| Classes and work | Active classes, then every assignment with its due date, its points, whether you turned it in and a link to open it in Classroom | Enrolled courses, then assignments and quizzes with the real submission status of each one |
| Grades | Points earned on returned work, added up per class, plus a target grade tool that says how many points you need on the work that is left. Google Classroom has no overall grade, so the percentage is only over graded work | Grade breakdown per course with points, percentages and instructor comments, plus a target grade tool that tells you what you need on the work that is left |
| News | Recent announcements, and a catch up digest with new announcements, new grades, overdue work and what is due next | Recent announcements, and a catch up digest that also covers newly marked work, unread discussions and quizzes you have not tried yet |
| Course files | Materials posted in a class, each with a link to open it and the Drive link of every attached file | Course modules, files, links, the syllabus, the files attached to an assignment, discussions, class lists and calendar events such as exams and labs. It can also save a course file to a folder you pick and build a calendar file of your deadlines |
| Read only | Yes, it can never turn in, edit or delete anything | Yes, it only reads from Brightspace |
| Price and license | Free forever, open source, MIT license | Open source, MIT license, and it runs on your own computer |

Both servers only read, so neither one can hand in your work for you. If your classes are in Google Classroom, install this one. If your school runs D2L Brightspace, install the Brightspace MCP instead.

Other Brightspace servers exist too, such as brightspace-mcp-server and brightspace-mcp. The author keeps a side by side comparison of them at [brightspace-mcp.netlify.app/compare](https://brightspace-mcp.netlify.app/compare/).

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
| Rate limited | Too many requests. Wait a minute and try again. |
| Google did not return a refresh token | Remove the app from your connected apps and run `login` again. |

## Development

```bash
npm install
npm run build
npm test
```

Tests run against a fake Google server, so they need no account or network. Other tests check that the tool table in this README, [llms.txt](./llms.txt) and glama.json still list every tool, that the tool descriptions in llms.txt and glama.json match the code, that every sample answer in this README and in llms.txt matches what the tool really prints, and that the version matches package.json.

The version that `--version` prints and the MCP handshake sends comes from package.json, so bump the version there and nowhere else.

The test runner needs Node 22.12 or newer. The server itself runs on Node 20 or newer.

## More free student MCP servers

All free, open source and read only where they touch your accounts. Browse the full list at [brightspacemcp.com/more-mcps](https://brightspacemcp.com/more-mcps/).

This server is also listed in the [Smithery](https://smithery.ai/server/google-classroom-student-mcp), [Glama](https://glama.ai/mcp/servers/AnonymousOnyx22/google-classroom-student-mcp) and [mcp.so](https://mcp.so/servers/google-classroom-student-mcp) directories.

| Server | What it does |
| --- | --- |
| [Brightspace MCP](https://github.com/AnonymousOnyx22/brightspace-d2l-mcp) | D2L Brightspace for AI. Due dates with real submission status, grades, a target grade calculator and course files. |
| [Canvas MCP](https://github.com/AnonymousOnyx22/canvas-lms-student-mcp) | Read-only Canvas LMS for AI. Due dates, missing work, grades and announcements. |
| [Moodle MCP](https://github.com/AnonymousOnyx22/moodle-student-mcp) | Read-only Moodle for AI. Due dates, overdue work, grades and announcements. |
| [GPA Calculator MCP](https://github.com/AnonymousOnyx22/gpa-calculator-mcp) | GPA, grade conversion and what-do-I-need-on-the-final math for AI. Works offline, no account. |
| [Citations MCP](https://github.com/AnonymousOnyx22/student-citations-mcp) | APA, MLA and Chicago citations from a DOI, an ISBN or typed details. No account. |
| [Study Planner MCP](https://github.com/AnonymousOnyx22/study-planner-mcp) | Exam study schedules, spaced repetition dates, pomodoro plans and assignment milestones. Works offline. |
| [Paper Finder MCP](https://github.com/AnonymousOnyx22/paper-finder-student-mcp) | Search scholarly papers, find open access copies and related work through OpenAlex. No key needed. |

Picking between the two school platforms? See [Google Classroom vs Brightspace MCP](#google-classroom-vs-brightspace-mcp).

## License

MIT
