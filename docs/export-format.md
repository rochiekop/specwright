# Export format

**Export for coding agents** (on the tasks page) produces a folder that a coding agent can work through task by task. The
code that builds it is in `src/lib/export.ts`; the folder writer is in `src/lib/export-folder.ts`.

## Layout

```
AGENTS.md
PRD.md
features/
  F1-<slug>.md
  F2-<slug>.md
  …
tasks/
  001-F1-T1-db-<slug>.md
  002-F1-T2-backend-<slug>.md
  …
tasks.json
.specwright-export.json      (folder export only)
```

## Files

### `AGENTS.md`

The entry point for the agent. It contains:

- **Start here**: read the PRD, then work through the tasks in order.
- **Rules**: stay inside the current task's scope, keep the fixed tech stack, put task IDs (e.g. `F2-T3`) in commit
  messages, and only tick a task when its acceptance criteria pass.
- **Run order**: grouped by phase and feature, as checkboxes. Each line shows the task's prerequisites. Tasks marked
  *Done* in Specwright are exported as `[x]`.

### `PRD.md`

The latest PRD version.

### `features/F<n>-<slug>.md`

One per feature: its summary, sub-features, the matching excerpt of the PRD, and the list of the feature's tasks.

### `tasks/NNN-F<n>-T<m>-<layer>-<slug>.md`

One per task, numbered in run order (`NNN`), so sorting the folder gives a valid build order. Each contains:

- what to build;
- acceptance criteria as checkboxes;
- links to the tasks it depends on;
- the requirement IDs (`FR-n`, `NFR-n`) it covers;
- the definition of done.

### `tasks.json`

The same tasks in machine-readable form, for scripts or other tools.

### `.specwright-export.json`

Written only when exporting to a folder. It records the plan and the files Specwright wrote, so a later re-export can remove its own
outdated files without touching anything else in your repository.

## Delivery options

| Option | How |
|---|---|
| **Download ZIP** | `GET /api/plans/<id>/export` |
| **Write files** | Writes into `<folder>/<subfolder>` on your machine. The folder must be an existing absolute path. The choice is remembered per plan. |

Folder safety rules:

- It will not write into a non-empty folder unless that folder holds a previous Specwright export (a
  `.specwright-export.json` manifest).
- The subfolder may only use letters, numbers, `.`, `-`, `_` and `/`, and never `..`, so it cannot escape the chosen folder.
- On a re-export it removes only files listed in its own manifest that are no longer needed.

## Using the export with a coding agent

1. Export into the root of the repository you want built (or unzip there).
2. Start your agent in that folder (Claude Code, Codex, Cursor, …).
3. Paste the kick-off prompt from the export dialog. It points the agent at `AGENTS.md`.
4. Let the agent do one task at a time. Review the diff and the acceptance criteria before moving on.
5. If the plan changes, update it in Specwright and export to the same folder again. Completed tasks stay ticked if you
   marked them *Done* on the board.
