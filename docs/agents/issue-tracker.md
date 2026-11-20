# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`.
- **Read an issue**: `gh issue view <number> --json number,title,body,labels,comments`.
- **List issues**: use `gh issue list` with explicit state and label filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`.
- **Apply or remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`.
- **Close**: explain the outcome in a comment, then run `gh issue close <number>`.

Infer the repository from `git remote -v`; this repo is `Angle-AOB/sleep-well`.

## Pull requests as a triage surface

**No.** Pull requests are not treated as a triage request surface. This repository uses GitHub Issues for user-reported bugs and requests.

## User-reported errors

The application does not collect telemetry. Error details are displayed locally so users can include them in a GitHub issue when reporting a problem. Do not request or include sleep diary contents or other health data in an issue unless the user intentionally redacts and provides it.
