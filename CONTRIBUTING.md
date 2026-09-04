# Contributing

Thanks for helping build the *Most Wanted* tribute. This is a small,
dependency-light TypeScript + Canvas project; the goal is to keep it that way.

## Workflow

1. Pick or open an [issue](../../issues). Comment so we don't double up.
2. Branch from `main`: `type/short-description` (e.g. `feat/traffic`,
   `fix/offroad-decel`, `chore/ci`).
3. Make the change. Run `npm run typecheck` and `npm run build` locally.
4. Open a PR against `main` and link the issue (`Closes #NN`). CI must pass.
5. Squash-merge once green.

## Ground rules

- Read [`CLAUDE.md`](CLAUDE.md) and the [ADRs](docs/decisions/) before touching
  the renderer or physics — the pseudo-3D approach has non-obvious constraints.
- Tune game feel via `src/game/constants.ts` first.
- Keep rendering pure: draw from state, don't mutate game state in render code.
- No new runtime dependencies without an ADR explaining why.
- No em dashes in prose or comments; use a hyphen or reword.

## Reporting bugs / ideas

Use the issue templates (Feature or Bug). For gameplay tasks, a short
acceptance-criteria checklist helps a lot.
