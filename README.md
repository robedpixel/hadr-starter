# HADR Monitor

A monitoring agent for humanitarian assistance and disaster response (HADR) — and
the three-day course that has you build it with Claude Code.

This repository is a **starter template**, not a finished product. It ships with the
raw materials — feed documentation, conventions files, issue templates, a review
workflow — and an empty space where the agent goes. Filling that space is the course.

## The end state

By Wednesday afternoon this repository contains an agent that:

- **watches live disaster feeds** — GDACS, USGS and ReliefWeb (documented in `feeds/`)
- **filters out the noise and assesses what remains** — what happened, where, how bad,
  and who is affected
- **publishes a morning situation report** to `dashboard.html` at 08:30 Singapore time
- **runs on a schedule, unattended**, and stays quiet when nothing has changed

How it does any of that is not specified anywhere in this repository. That is the point:
you design the system, Claude Code helps you build it, and you learn to trust — and
review — work you did not write by hand.

## The three days

1. **Plan** — interrogate the feeds, write the PRD, cut it into vertical slices
2. **Autonomy** — build the first slice, write a skill, wire up the 08:30 routine,
   launch the overnight loop
3. **Trust** — review code you didn't write, harden the pipeline, demo

## Repository layout

| Path | What lives here |
| --- | --- |
| `CLAUDE.md` | Project conventions Claude Code reads on every prompt. **Fill this in before your first prompt** — an empty conventions file is a decision, just not one you made. |
| `feeds/` | One file per data source (`gdacs.md`, `usgs.md`, `reliefweb.md`): endpoint, a truncated example response, and the open questions each feed forces you to answer. |
| `scripts/` | Deterministic checks. Anything that must give the same answer twice does not belong in a prompt — it belongs here. |
| `skills/` | Skills you write on Day 2, one folder per skill (a `SKILL.md`, its assets, and a note on which model each step should use). |
| `docs/solutions/` | One learning per file. When something costs you more than ten minutes, the fix goes here so no future session pays for it twice. |
| `implementation-notes.md` | Kept by the agent, reviewed by you — one entry per working block, recording decisions, open questions, and any deviation from the PRD or `CLAUDE.md`. |
| `.github/` | The `@claude` PR-review workflow plus issue templates for vertical slices and skill feedback. |

## The feeds

Three independent sources, documented but not wired up — reconciling them is your job:

- **GDACS** — Global Disaster Alert and Coordination System (EU/UN). Multi-hazard,
  colour-coded alert levels. GeoJSON event list.
- **USGS** — earthquake feed from the US Geological Survey.
- **ReliefWeb** — humanitarian reports and situation updates (UN OCHA).

Each `feeds/*.md` file ends with open questions — de-duplicating the same earthquake
arriving from two feeds, choosing a polite polling frequency, deciding what the 08:30
report says on a morning a feed is down. Answer them in your PRD, not in your code.

## Artefacts expected by the end

`prd.html` · `system-view.html` · `implementation-notes.md` · `dashboard.html` ·
`goal.md` · at least one skill

## Day 1 setup

1. Sign in to Claude Code with your Team seat
2. Create your own repository from this template, then clone it
3. Run `/install-github-app` so `@claude` reviews your pull requests from Day 2
4. Install OpenCode and sign in with your Go key

Then fill in `CLAUDE.md` before your first prompt.
