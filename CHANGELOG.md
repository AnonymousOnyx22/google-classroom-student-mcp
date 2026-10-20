# Changelog

## Unreleased

- The package description and the npm keywords now spell out "Google Classroom MCP", so the server shows up when people search npm for that phrase.
- server.json now has the title "Google Classroom MCP for students" and a description that names the phrase. The registry allows 100 characters at most for the description.
- The README and llms.txt now call it the Google Classroom MCP server.
- Added a test that checks the phrase stays in package.json and server.json.
- get_todo, get_upcoming_due_dates, get_missing_assignments and get_my_grades now take an optional course_ids list, so you can check specific classes only.
- get_upcoming_due_dates now takes an optional days_ahead number to cap how far ahead it looks.
- Added a test that keeps llms.txt and glama.json in step with the tool list and the tool descriptions.

## 0.1.1

- README now lists every free student MCP server from the same author. Nothing else changed.

## 0.1.0

- First release. Read only tools for Google Classroom, a doctor command to check your setup, and tests that run against a fake server.
