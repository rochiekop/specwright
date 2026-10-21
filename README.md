# Specwright

**Turn an app idea into a reviewed PRD, a feature map and ordered coding tasks that an AI coding agent can build from.**

You describe an app in a few sentences. Specwright asks clarifying questions, proposes the features, writes a short,
checkable product requirements document (PRD), breaks the work into small tasks with acceptance criteria, and exports
everything as Markdown files that Claude Code, Codex, Cursor or any other coding agent can work through one task at a
time.

It runs locally for one person: no login, no cloud account. API keys stay on the local server, and all data is in
one SQLite file.

## How to use

### Setup

Requires Node.js 20+ and an API key for at least one provider (or a local Ollama).

```bash
cd specwright
npm install
cp .env.example .env.local   # add at least one API key
npm run dev                  # open http://localhost:3000
```

Open **Models** and press **Test** on the default model to check your key.

### Making a plan

1. **Idea.** Create a project, then a plan. Write the idea, choose the output language and a tech stack (presets:
   Next.js + PostgreSQL, React + Node, Laravel + MySQL, Expo + Supabase).
2. **Questions.** Answer 3–6 generated questions (text or choices, each skippable). If answers are vague, up to 3
   follow-ups are asked. Skipped answers become explicit assumptions in the PRD.
3. **Feature map.** Review the proposed features (menus/modules) and sub-features (screens/actions) with phases and
   priorities. Edit, add, remove or reorder them. This is the cheapest place to change scope.
4. **PRD.** Generate the PRD (streamed, 12 fixed sections with diagrams). Edit it freely; every change is a new
   version you can compare and restore. Run the **quality check** and use **Fix with AI** on the findings.
5. **Tasks.** Generate tasks feature by feature. Each has a layer (db / backend / frontend / test), acceptance
   criteria and dependencies. Track progress on the 4-column board.
6. **Export.** Press **Export for coding agents**, download the ZIP or write it into your repository, and paste the
   kick-off prompt into your agent.

At any step, **Revise with AI** opens a chat that answers questions about the plan or proposes changes as diffs you
accept or reject.

## How it works

```
Idea → Questions → Feature map → PRD → Quality check → Tasks → Export
         (+ follow-ups)              (versioned)                (AGENTS.md, PRD.md,
                                                                 features/, tasks/)
```

- **Features before prose.** The map is agreed first, and the PRD must list exactly those features, so it stays
  focused (about 2,400 words). A rule check flags any drift between the two.
- **A PRD that can be checked.** Sections: Overview, Goals & Success Metrics, Non-goals, Requirements (`FR-n`,
  `NFR-n`), Core Features, User Flows, Architecture (sequence diagram), Data Model (ER diagram), Tech Stack, Risks &
  Assumptions, Open Questions, Glossary. Nine instant rule checks (missing sections, uncovered requirements, vague
  wording, weak acceptance criteria, …) re-run on every version; an AI review checks testability, consistency and
  scope.
- **Nothing is overwritten.** PRD versions are append-only. Chat proposals only apply when accepted, and are refused
  if the target changed in the meantime.
- **Tasks in a valid order.** Tasks are generated in build order; each feature sees earlier tasks so shared work is
  reused. Dependencies can only point backwards, so the graph never loops and the exported numbering is a valid run
  order.
- **Any model, per step.** Claude through the Anthropic SDK; OpenAI, Gemini, DeepSeek, OpenRouter, Moonshot, Groq,
  Ollama or any OpenAI-compatible endpoint through the OpenAI SDK. Use a strong model for the PRD and a cheap one for
  questions. Every AI call is logged in the `generation_runs` table.
- **Safe export.** Writing to a folder never touches files Specwright didn't create; a manifest lets re-exports
  clean up only their own old files.

**Stack:** Next.js 16 (App Router, server actions), React 19, TypeScript, Tailwind 4, SQLite + Drizzle ORM,
React Flow, Mermaid, Zod.

**Data:** stored in `data/app.db` (ignored by git). To back up, stop the app and copy the `data/` folder. Migrations
run automatically on startup.

> Specwright has no authentication. Run it on `localhost` only.

## Future improvements

Near term:
- **Plan export / import (.json)** for backup, moving between machines and forking a plan.
- **Protect hand edits** when the feature map or tasks are regenerated.
- **Regenerate one PRD section** with a short instruction.
- **Traceability grid**: requirements × features × tasks, with gaps highlighted.
- **Automated tests** for the quality rules, PRD parsing, task ordering, chat changes and the folder writer.

Later:
- Stack preset editor, drag and drop on the board and map, token and cost tracking per plan.
- Sync task progress back from the exported `AGENTS.md` checkboxes.
- Indonesian UI, reference attachments on the idea step, codebase-aware planning.
- A hosted multi-user version on Postgres with sign-in and share links.

## Documentation

- [User guide](docs/user-guide.md): each step in detail, with tips
- [Configuration](docs/configuration.md): providers, models, environment variables, backups
- [Export format](docs/export-format.md): the files written for coding agents
- [Architecture](docs/architecture.md): code map, data model, extending the app
- [Roadmap](docs/roadmap.md): what is built, limitations, next steps
- [Troubleshooting](docs/troubleshooting.md): common errors and fixes
