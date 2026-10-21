# User guide

This guide walks through a plan from idea to export. Each step is shown in the stepper at the top of a plan, and the
plan remembers which step you reached, so you can close the app and continue later.

```
Idea → Questions → Feature map → PRD → Tasks → Export
```

## Projects and plans

- A **project** is a folder for related plans (for example, one product with a few alternative scopes).
- A **plan** is one idea taken through the whole workflow. Each plan has its own questions, feature map, PRD versions,
  tasks, chat and export settings.
- Deleting a project deletes all of its plans. Deleting a plan deletes everything in it. Both ask for confirmation and
  cannot be undone, so back up `data/` first if in doubt.

## 1. Idea

Fill in:

| Field | Notes |
|---|---|
| **Title** | A short name for the plan. |
| **Idea** | A few sentences or paragraphs. Say who it is for, the main problem, and anything you already know you want or don't want. More detail here means fewer guesses later. |
| **Output language** | The language the questions, PRD, features and tasks are written in: English, Bahasa Indonesia, Bahasa Melayu, Español, Português, Deutsch, Français or 日本語. The app UI stays in English. |
| **Starting stack** | A preset fills the tech stack fields: Next.js + PostgreSQL, React SPA + Node API, Laravel + MySQL, or Expo + Supabase. |
| **Tech stack** | Frontend, backend, database, deployment, other. Edit freely. The PRD and the tasks treat this stack as fixed, and the exported `AGENTS.md` tells the agent not to change it. |

You can come back and edit the idea later, but downstream steps were generated from the old text, so regenerate them
if the change is significant.

## 2. Questions

Press **Generate questions** to get 3–6 clarifying questions for your idea. Each question is one of:

- **Text**: a free answer.
- **Single choice** or **multi choice**: pick from the options, or use **Other** to write your own.

Every question can be **skipped**. Skipped answers are kept, and the PRD lists them under *Risks & Assumptions* as
"A-1: <assumed default> (because <question> was not answered)", so you can see exactly what was guessed.

When you press **Check answers & continue**, the app checks your answers once. If some are too vague to plan from (for example "everyone" for
*who is the user*), it asks **up to 3 follow-up questions**. After that, the plan moves to the feature map.

Your answers are saved as you go. **Edit answers** lets you change them later.

**Tip:** concrete answers matter more than complete ones. "Small bakeries with 1–3 staff, ordering on a phone" is
worth more than three paragraphs about the market.

## 3. Feature map

The map is built from your idea and answers before the PRD is written, so you agree on the shape of the app first.

- **Features** are the app's menus or modules (3–9 of them). **Sub-features** are the screens or actions inside each
  one (2–5 each).
- Each feature has a phase (build order), a priority, an icon and a summary.
- The map is drawn as a left-to-right tree, grouped by phase.

To edit, click a feature. In the panel you can change the name, summary, phase, priority and icon, and add, remove,
rename or reorder its sub-features. You can also move a feature up or down within its phase, delete it, or add a new
one. Hand-edited features are marked **edited**.

**Tip:** this is the cheapest place to change scope. Cut features here instead of after the PRD and tasks exist.

## 4. PRD

Press the write button to stream the PRD. You can press **Stop** at any time; this cancels the model request and
nothing is saved. Later, **Rewrite with AI** writes a fresh PRD from the idea, answers and map as a new version, and
**Download .md** saves the current version.

The PRD always has the same 12 numbered sections:

1. Overview
2. Goals & Success Metrics
3. Non-goals
4. Requirements (functional `FR-n`, non-functional `NFR-n`)
5. Core Features (exactly the features on your map)
6. User Flows
7. Architecture (with a Mermaid sequence diagram)
8. Data Model (with a Mermaid ER diagram)
9. Tech Stack
10. Risks & Assumptions
11. Open Questions
12. Glossary

### Editing and versions

- **Edit** the Markdown directly and save. Every save, AI generation, AI fix, chat change or restore creates a new
  **version**. Nothing is ever overwritten.
- Open the version list to **view** any version, **compare** two versions line by line, or **restore** an older one
  (restoring also creates a new version, so you can undo the restore).
- Mermaid diagrams render inline. To change a diagram, edit its text.

### Quality check

The quality panel on the PRD page has two kinds of checks. **Run quality check** runs both; afterwards the
rule checks keep themselves up to date, and the panel tells you when the PRD has changed since the last AI review
(press **Run full check again** to refresh it).

**Rule checks** are instant, free, and re-run automatically on every new version:

| Rule | What it catches |
|---|---|
| `missing-section` | One of the 12 sections is missing |
| `duplicate-id` | The same requirement ID is used twice |
| `uncovered-requirement` | A requirement no feature covers |
| `unknown-reference` | A reference to an ID that does not exist |
| `no-features` | Section 5 lists no features |
| `map-mismatch` | Section 5 has drifted from the feature map |
| `weak-acceptance` | A feature has fewer than 3 "Done when" criteria |
| `vague-wording` | Words like "fast", "easy" or "intuitive" without a number |
| `missing-diagram` | The sequence or ER diagram is missing |

**AI review** uses a model to check traceability, testability, consistency, completeness,
the data model, scope and unstated assumptions.

For every finding you can:

- **Fix with AI**: rewrites only the affected section(s) and saves a new version.
- **Dismiss**: hides the finding. You can undo this.

**Tip:** fix errors before generating tasks. Tasks are built from the PRD, so its gaps become the tasks' gaps.

## 5. Tasks

The board lives on the **Tasks** step.

### Generating

Tasks are generated **one feature at a time, in build order**. Each feature sees the tasks already planned for earlier
features, so shared groundwork (for example, creating the users table) is planned once and reused instead of being
duplicated.

Each task has:

- a **code** such as `F2-T3` (feature 2, task 3);
- a **layer**: `db`, `backend`, `frontend` or `test` (every feature gets at least one test task);
- a **priority** and the **sub-feature** it delivers;
- a short **description** and checkable **acceptance criteria**;
- **dependencies**, which can only point to an earlier task in the same feature or to a task in an earlier feature.
  This guarantees the order never loops.

### The board

- Four columns: **To do**, **In progress**, **Done**, **Failed**.
- *To do* lists ready tasks first. Blocked tasks show which tasks they are waiting for.
- Filter by feature or by layer. The progress bar counts done tasks.
- The board warns about any sub-feature that no task delivers.

Click a task to change its status, edit it, delete it, or jump to its dependencies. You can also **add a task** by
hand, or **regenerate** one feature's tasks. Regenerating warns you if tasks in later features depend on the tasks
being replaced.

Tracking progress here is optional. Many people let the agent tick the checkboxes in the exported `AGENTS.md`
instead. Tasks you mark *Done* are exported as already ticked.

## 6. Export for agents

Press **Export for agents** on the tasks page. The *Export for coding agents* dialog previews the files and offers two ways to deliver them:

- **Download ZIP**.
- **Write files** into a folder on your machine, for example your new project's repository. Give a full path to an
  existing folder (e.g. `D:\Projects\budget-app`) and an optional subfolder. The choice is remembered for this plan.
  Specwright will not write into a non-empty folder it did not create, and on a re-export it only removes its own
  outdated files.

The dialog also shows a **kick-off prompt** to paste into your coding agent. See [Export format](export-format.md)
for the full file layout.

## Revise with AI (chat)

**Revise with AI** opens a chat drawer on the feature map, PRD and tasks pages. Use it for questions and for changes
that span several places.

- **Questions** ("Which requirement covers password reset?") get an answer that cites IDs, with no changes made.
- **Change requests** ("Add an export-to-CSV feature in phase 2 with tasks") return **proposals**, each shown as a
  diff:
  - rewrite a PRD section;
  - add, update or remove a feature;
  - add, rename or remove a sub-feature;
  - add, update or remove a task.

Accept or reject each proposal on its own, or use **Accept all**. Nothing changes until you accept. Accepted PRD edits
from one reply are saved as a single new PRD version, and the rule checks re-run afterwards. A PRD proposal is refused
if that section was changed after the proposal was made; ask again to get a fresh one.

## Tips for good plans

- Write the idea for a specific person with a specific problem. Generic ideas produce generic PRDs.
- Use a strong model for the PRD, quality and feature steps, and a cheaper one for questions and tasks (see
  [Configuration](configuration.md#per-step-models)).
- Keep phase 1 small. A coding agent does best when the first phase is a thin, working slice.
- Read *Risks & Assumptions* and *Open Questions* before exporting. They are where the model tells you what it guessed.
- After exporting, have the agent work one task per session or commit, and check the acceptance criteria yourself.
