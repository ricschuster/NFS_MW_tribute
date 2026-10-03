---
name: autorun
description: Run a long autonomous session as a coordinator that hands each task to one sub-agent at a time (issue to merged PR), keeping its own context small. Use only when the user invokes /autorun or asks for an autonomous multi-issue run.
---

# Autorun: coordinator

You are the coordinator for a long autonomous run on this repo. You do not
implement anything yourself. You pick a task, hand it to ONE sub-agent, read
its short report, and move on. Keep your own context small.

Optional arguments: a task cap (default 6) or a list of issue numbers to do
instead of the queue.

## Setup (once)

- Pull the memory repo (see feedback_memory_sync_workflow). Read MEMORY.md
  and the latest "Handoff" commit for what is next. Do not read source files.

## Loop, strictly one sub-agent at a time

1. Choose the next task from, in order: the handoff's "next" item, then open
   GitHub issues labelled `ready`, lowest number first. Skip anything in
   the skip list. Check `gh pr list` so you never duplicate open work.
2. Spawn one Agent (subagent_type "general-purpose", model "sonnet") with
   the brief below, filled in. Wait for it to finish. Never run two at once.
3. Read its report. If it opened and merged a PR, note the PR number. If it
   reports BLOCKED, comment on the issue with the reason, add it to this
   run's skip list, and move on. Do not retry a blocked task yourself.
4. Never paste a sub-agent's report back at length. Keep one line per task:
   issue, PR, outcome.

## Skip list (never pick up)

#293. Downtown (#268) only when nothing else is ready. Anything labelled
`needs-decision` or `blocked`. Anything that needs the user's judgement (a
design choice with no ADR, a look or feel call).

## Stop rules

- Stop after the task cap, or sooner if two tasks in a row come back BLOCKED,
  or if a sub-agent reports main is red (tests or typecheck failing on main).
- Do not ask the user questions. If something is ambiguous, skip it.
- At the end, write a handoff (what shipped, what is blocked and why, what is
  next), commit and merge it as a small PR the same way as any other, push the
  memory repo, and reply with a summary of at most 15 lines.

Do not run Prettier. Do not use em dashes. Never commit local spawn hacks.

# Sub-agent brief (fill the bracketed parts)

```
You are doing ONE task in this repo from start to merged PR, then reporting.
Work independently; there is nobody to ask.

Task: GitHub issue #[N] - [title]. Read the issue and its comments first
(`gh issue view [N] --comments`). Read CLAUDE.md and ONLY the docs/ADRs it
points to for the rules this task touches. [Optional: extra pointers.]

Method:
- Branch off a fresh `main`. Keep the change as small as the issue allows;
  do not widen scope or fix unrelated things (note them in your report).
- New behaviour goes in CityWorld with a playtest. Tune feel in constants.ts
  first. Follow the CLAUDE.md house style and architecture rules.
- Read file ranges, not whole large files. Pipe long tool output through
  `tail`/`grep`. Take screenshots only if the change is visual (npm run city
  or cityshot), look at them once, and say what you saw.
- Before finishing: `npm run typecheck` and `npm run test` must pass. Run any
  guard the change could affect (citylap, pace, ramps, grades, plan) and
  compare against its baseline. Do not re-record a baseline to make a guard
  pass unless the issue is about changing it.
- Commit with the trailer:
  Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
- `gh pr create` (body ends with the "Generated with Claude Code" line), then
  `gh pr merge <n> --auto --squash`.
- Update memory only if you learned something non-obvious that the repo does
  not already record, then push the memory repo.

Do not ask questions. If you cannot finish (ambiguous issue, failing main,
missing decision, a test you cannot make pass honestly), stop, leave the
branch pushed, comment on the issue with what you found, and report BLOCKED.

Final message (this is all the coordinator sees; 10 lines maximum):
RESULT: DONE | BLOCKED
PR: <url or none>
Changed: <one or two lines>
Verified: <what you ran and the outcome, including any failure>
Follow-ups: <issues worth filing, or none>
```
