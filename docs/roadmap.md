# Roadmap

Specwright follows the build spec in [`../../teardown.md`](../../teardown.md) (sections 6a–6e). This page records what
is built, what is known to be missing, and what to build next.

## Built

| Milestone | What shipped |
|---|---|
| **M1 Foundation** | Projects, plans (idea, output language, tech stack with presets), SQLite + Drizzle with auto-migration, Models page with per-step models across 9 providers |
| **M2 Questions** | 3–6 typed questions (text / single / multi, "Other", Skip), then one answer check that asks up to 3 follow-ups. Skipped answers become explicit PRD assumptions. |
| **M5 Feature map** *(moved before the PRD)* | 3–9 features with 2–5 sub-features each, phases, priorities and icons, shown as a tree; full editing, reordering and "edited" marking |
| **M3 PRD** | Streamed generation with Stop, 12 fixed sections, Mermaid sequence and ER diagrams, manual editing, append-only versions with diff and restore. Lean length budget (about 2,400 words). |
| **M4 Quality gate** | 9 instant rule checks re-run on every version, AI review, **Fix with AI** per finding (section-scoped rewrite), dismiss/undo |
| **M6 Tasks** | Per-feature generation in build order with reuse of earlier groundwork, db/backend/frontend/test layers, backward-only dependencies, 4-column board with filters, blocked state and coverage warnings, manual add/edit, per-feature regenerate with dependency warning |
| **M7 Export** *(partial)* | `AGENTS.md`, `PRD.md`, per-feature and per-task Markdown, `tasks.json`; ZIP download or safe folder write with manifest; kick-off prompt |
| **M8 Revision chat** | Questions with cited IDs, typed change proposals (PRD section, feature, sub-feature, task) shown as diffs, accept/reject individually or all, staleness and dependency safety |

## Known limitations

- **No automated tests.** Prompts, rule checks, dependency ordering, chat-ops and the folder writer are all untested
  beyond manual use.
- **No plan backup or transfer inside the app.** The only way to move or copy a plan is to copy the whole `data/`
  folder.
- **Regenerating the map or a feature's tasks replaces hand edits.** Features carry a `source = user` flag, but
  regeneration does not yet respect it.
- **Whole-PRD regeneration only.** You can fix a section through a quality finding or the chat, but there is no direct
  "regenerate this section with this instruction" button.
- **No stack preset management.** Presets are seeded; adding one means editing the database.
- **English-only UI.** Output language is configurable, the interface is not.
- **Board uses clicks, not drag and drop.**
- **`generation_runs` grows without limit.**
- **Localhost only.** No authentication, so it must not be exposed on a network.

## Next development

Ordered by value to the quality of the plans, then by effort.

### Near term

1. **Plan export / import (.json).** Finish M7: export a whole plan (idea, answers, map, all PRD versions, tasks,
   findings) as one JSON file, and import it as a new plan. Covers backup, moving between machines and "fork a plan".
2. **Protect user edits on regeneration.** Fields with `source = user` are kept when the map or tasks are regenerated,
   unless the user ticks "overwrite my edits". Show what would be replaced before confirming.
3. **Regenerate one PRD section** with an optional instruction ("make the data model multi-tenant"), producing a new
   version and leaving other sections untouched.
4. **Traceability view.** A requirements × features × tasks grid with empty cells highlighted, so coverage gaps are
   visible at a glance. Most of the data already exists in `prd-parse.ts` and the task records.
5. **Test suite.** Start with pure logic that is easy to cover and costly to break: `quality-rules.ts`,
   `prd-parse.ts`, task ordering and dependency rules, `chat-ops.ts`, and the path checks in `export-folder.ts`.
   Add a fake LLM adapter so step flows can be tested without API calls.
6. **Log housekeeping.** Add a "clear logs older than N days" action on the Models page.

### Medium term

7. **Stack preset editor** on the Models (or a new Settings) page.
8. **Drag and drop** on the task board and the feature map (dnd-kit is in the original stack plan).
9. **Cost tracking.** Show tokens and estimated cost per plan and per step from `generation_runs`.
10. **Prompt evaluation loop.** Re-run a step on a saved plan with a different prompt or model and compare outputs
    side by side, using the logged runs as fixtures.
11. **Import progress back from the repo.** Read the checkboxes in an exported `AGENTS.md` (or `tasks.json`) and
    update task statuses on the board.
12. **Indonesian UI** through an i18n layer (spec 6d).

### Later

13. **Hosted / multi-user version.** Move to Postgres (the schema is kept compatible), add authentication and owner
    fields, and reintroduce share links as read-only snapshots.
14. **Reference attachments** on the idea step (screenshots, existing docs) passed to the model as context.
15. **Codebase-aware planning.** Point a plan at an existing repository so features and tasks build on what is there.
16. **Voice input** for the idea and answers via the browser speech API.
