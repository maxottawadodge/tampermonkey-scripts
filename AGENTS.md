# Agent Instructions

## Development and Production

- Work only in `development/` by default. Do not create, edit, move, or delete files in `production/` unless the user explicitly asks you to work on production.
- Keep changes in their requested folders; do not copy them into `production/` without explicit authorization.
- Whenever changing a script, put its version comment at the top of the file and increment it. For Tampermonkey scripts, increment the `@version` metadata value at the top.
- After making requested changes outside `production/`, always commit and push them to the GitHub remote, regardless of folder. This includes development scripts, Google Apps Scripts, documentation, and other requested files.
- Never commit or push files in `production/` unless the user explicitly authorizes production work. Keep each commit and push limited to the requested changes; exclude unrelated or pre-existing work.
- Before committing or pushing, verify the current branch, remote, and worktree. If pushing would include unauthorized production files or unrelated changes, or the correct destination is unclear, stop and ask the user rather than pushing.
