# Changelog

## 0.1.5

- get_my_grades and get_whats_new now print the comment the teacher left when they returned the work, under the score, with the Classroom page of the work. The comment comes from the same assigned comment the server already read for the date of the grade.
- Added tests that check the comment shows up, that the HTML tags come off it and that no comment line is printed when the teacher wrote nothing.
- The README now has a Questions students ask section. It lists the questions students ask, the tool that answers each one and what the answer holds.
- The README now has a sample answer for get_todo, get_missing_assignments and get_whats_new, next to the sample for get_upcoming_due_dates. llms.txt carries the same samples.
- Added a test that checks every sample answer in the README and in llms.txt matches what the tool really prints, and a test that checks the questions in both files name the same tools.

- The README header now has a badge for every directory the server is listed in: Smithery, Glama and mcp.so. Each badge links to the server page in that directory, and the README names the three directories in the text as well.
- package.json and server.json now point at the list of free student MCP servers on brightspacemcp.com, so the npm page and the registry entry land on the page that lists the server.
- llms.txt now links the three directories in its Links section.
- Added a test that checks the npm homepage and the website in server.json stay on the listing page, and a test that checks the README badges link the three directories.
- Added a test that checks the tool table in the README against the tool list in the code, so a new tool cannot land in the code without a row in the README.
- The optional since_days argument is now part of the docs checks, so the README and llms.txt have to keep naming it for the tool that takes it.
- get_todo, get_assignments, get_announcements and get_course_materials now print the Classroom page of each item under the title, so the AI can hand the student a direct link to the work instead of only a title.
- get_course_materials also prints the Drive link of every file attached to a material.
- Added tests that check the links show up, that the Drive link of an attached file shows up and that no link line is printed when the API sends none.
- The README now has a Google Classroom vs Brightspace MCP section. It compares what each server reads, how the setup differs, what your school has to do, and that both are read only.
- Added a test that keeps the comparison section in place and checks it still says what this server really reads.
- Added get_whats_new, a catch up digest that prints new announcements, newly graded work, overdue work and what is due next in one answer. It takes an optional course_ids list, an optional since_days number for how far back to look and an optional days_ahead number for how far ahead to look.
- The version now comes from package.json, so `--version` and the MCP handshake always report the version of the published package. The stale copy in src/server.ts is gone.
- Updated the dependencies. The MCP SDK stays on 1.32.1, which is the newest release, and the test runner moved from vitest 2 to vitest 5.
- The test runner needs Node 22.12 or newer. The server itself still runs on Node 20 or newer.
- The package description and the npm keywords now spell out "Google Classroom MCP", so the server shows up when people search npm for that phrase.
- server.json now has the title "Google Classroom MCP for students" and a description that names the phrase. The registry allows 100 characters at most for the description.
- The README and llms.txt now call it the Google Classroom MCP server.
- Added a test that checks the phrase stays in package.json and server.json.
- get_todo, get_upcoming_due_dates, get_missing_assignments and get_my_grades now take an optional course_ids list, so you can check specific classes only.
- get_upcoming_due_dates now takes an optional days_ahead number to cap how far ahead it looks.
- Added a test that keeps llms.txt and glama.json in step with the tool list and the tool descriptions.
- Every tool description now ends with a real example ask, such as 'What's overdue?' or 'What's due this week across all my classes?', so it is clearer which tool fits the question.
- Added a test that checks every tool description carries at least one example ask.
- The README now links to llms.txt, so site indexes and AI apps that read the README find the plain text tool list.
- The README first screen now shows a sample answer for "What's due this week across all my classes?", and llms.txt carries the same sample.
- Added a test that checks the sample answer lines match the output of get_upcoming_due_dates.

## 0.1.4

- Add example asks to all 8 tool descriptions and sync docs tests
- Add Claude Code and Cursor config examples to README Quick start

## 0.1.3

- Small fixes and clearer docs

## 0.1.2

- Keep llms.txt and glama.json in lockstep with the 8 tool descriptions
- Rewrite description and keywords around the phrase google classroom mcp
- Add a version parity check and file the approval to publish 0.1.1 to the official registry
- Turn Google 401, 403 and 404 responses into messages that match the README Troubleshooting table
- Add optional course_ids and days_ahead arguments to get_todo, get_upcoming_due_dates, get_missing_assignments and get_my_grades
- Restructure the README first screen around npx install and three example asks
- Rewrite the npm description to lead with the literal phrase 'Google Classroom MCP'

## 0.1.1

- README now lists every free student MCP server from the same author. Nothing else changed.

## 0.1.0

- First release. Read only tools for Google Classroom, a doctor command to check your setup, and tests that run against a fake server.
