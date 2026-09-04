# 1. Record architecture decisions

- Status: accepted
- Date: 2026-09-04

## Context

We want a lightweight, durable record of the architectural choices that shape
this project, so future work (and future Claude sessions) can understand *why*
the code looks the way it does without re-litigating settled decisions.

## Decision

We use Architecture Decision Records (ADRs), one Markdown file per decision in
`docs/decisions/`, numbered sequentially (`0001-...`, `0002-...`). Each record
captures the context, the decision, and its consequences. Decisions are
immutable once accepted: to change one, add a new ADR that supersedes it rather
than editing history.

## Format

Each ADR has: a title line (`# N. Title`), a status and date, and the sections
**Context**, **Decision**, and **Consequences**. Keep them short — a screen or
two. Status is one of: proposed, accepted, superseded (by ADR-N), or deprecated.

## Consequences

- New non-obvious architectural choices get a numbered ADR.
- Reversing a decision means writing a superseding ADR, preserving the trail.
- Small, local, easily-reversible choices do not need an ADR; use judgement.
