# Changelog

## 0.1.4

- Add example asks to all 8 tool descriptions and sync docs tests
- Add Claude Code and Cursor config examples to README Quick start

## 0.1.3

- Small fixes and clearer docs

## 0.1.2

- Keep llms.txt and glama.json in lockstep with the 8 tool descriptions vi
- Rewrite description and keywords around the phrase google classroom mcp
- Add a version parity check and file the approval to publish 0.1.1 to the official registry
- Turn Google 401, 403 and 404 responses into messages that match the README Troubleshooting table
- Add optional course_ids and days_ahead arguments to get_todo, get_upcoming_due_dates, get_missing_assignments and get_my
- Restructure the README first screen around npx install and three example asks
- Rewrite the npm description to lead with the literal phrase 'Google Classroom MCP'

## Unreleased

- The package description and the npm keywords now spell out "Google Classroom MCP", so the server shows up when people search npm for that phrase.
- server.json now has the title "Google Classroom MCP for students" and a description that names the phrase. The registry allows 100 characters at most for the description.
- The README and llms.txt now call it the Google Classroom MCP server.
- Added a test that checks the phrase stays in package.json and server.json.
- get_todo, get_upcoming_due_dates, get_missing_assignments and get_my_grades now take an optional course_ids list, so you can check specific classes only.
- get_upcoming_due_dates now takes an optional days_ahead number to cap how far ahead it looks.
- Added a test that keeps llms.txt and glama.json in step with the tool list and the tool descriptions.
- Every tool description now ends with a real example ask, such as 'What's overdue?' or 'What's due this week across all my classes?', so it is clearer which tool fits the question.
- Added a test that checks every tool description carries at least one example ask.

## 0.1.1

- README now lists every free student MCP server from the same author. Nothing else changed.

## 0.1.0

- First release. Read only tools for Google Classroom, a doctor command to check your setup, and tests that run against a fake server.
