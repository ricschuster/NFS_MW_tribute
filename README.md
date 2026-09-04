# claude-project-template

Stack-agnostic project harness for Claude Code workflows.

> Status: WIP stub. The reusable harness lives in
> [ricschuster/SCP_tutorial](https://github.com/ricschuster/SCP_tutorial) today
> and has not yet been extracted and genericized here. See the checklist below.

## What this will be

A GitHub template repository that seeds new projects with the process
scaffolding (no tech stack baked in): docs framework (design notes, ADRs,
handoffs), issue/PR templates, contribution and security policies, a license,
and Claude Code working rules (`CLAUDE.md`, `.claude/settings.json`).

## Setup checklist (to complete later)

Extraction and genericization:

- [ ] Copy the harness files from SCP_tutorial (everything except `src/` and
      project-specific prose): `CLAUDE.md`, `CONTRIBUTING.md`, `SECURITY.md`,
      `CHANGELOG.md`, `LICENSE`, `.gitignore`, `.claude/settings.json`,
      `.github/`, `docs/` framework.
- [ ] Replace project-specific naming with placeholders (for example
      `{{PROJECT_NAME}}`) or clearly generic text. Files to scrub: `README.md`,
      `CLAUDE.md`, `docs/design/00_project_brief.md`, `CHANGELOG.md`.
- [ ] Add a "Using this template" section listing exactly what a new user must
      fill in and delete.
- [ ] Add one example ADR to model the format (for example
      `docs/decisions/0001-record-architecture-decisions.md`).

Automation (files copy, settings do NOT):

- [ ] Add a settings-bootstrap script (or first-run GitHub Action) that reapplies
      repo settings a template does not carry: branch protection on `main`,
      auto-merge, and labels.
- [ ] Decide on variable substitution: plain GitHub template (manual find/
      replace) vs. copier/cookiecutter vs. the self-deleting setup-workflow
      trick that find-replaces placeholders on first push then removes itself.
- [ ] (Optional) Add a stack-neutral CI workflow (markdown lint, the no-em-dash
      rule, docs-structure check) so branch protection has a real required
      check.

Finalize:

- [ ] Enable the "Template repository" setting (already toggled on for this stub).
- [ ] Update this README to real usage instructions and drop the WIP note.

## License

GNU General Public License v3.0 (planned, to match SCP_tutorial).
