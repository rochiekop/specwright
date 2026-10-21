# Troubleshooting

## "… is not configured: set XXX_API_KEY in .env.local and restart."

The step's model uses a provider without a key. Either add the key to `.env.local` and restart `npm run dev`, or
change the model for that step on the **Models** page. For Ollama or a custom endpoint, set `OLLAMA_BASE_URL` or
`CUSTOM_BASE_URL` instead.

## "Model "…" must look like provider:model"

Model names need a provider prefix, for example `anthropic:claude-opus-5-5` or `ollama:llama3.1:8b`. See
[Configuration](configuration.md#model-names).

## Changes to `.env.local` have no effect

Environment variables are read when the server starts. Stop and restart `npm run dev`.

## A step fails with a JSON or validation error

Structured steps (questions, features, tasks, quality, chat) need the model to return JSON that matches a schema.
Smaller or local models sometimes don't. Options:

- Retry the step; failures are often one-off.
- Use a stronger model for that step only (Models page → per-step model).
- Inspect the raw response in the `generation_runs` table to see what the model returned.

## The PRD stops part-way

The model hit its output limit or the request was cancelled. Check the latest row in `generation_runs` for an error,
then generate again. If it keeps happening with one model, pick one with a larger output limit for the PRD step.

## A Mermaid diagram does not render

The diagram text has a syntax error. Edit the PRD, fix the code block (or delete it and ask the chat to redraw the
diagram), and save. The `missing-diagram` rule will flag it if the diagram is gone.

## Writing the export to a folder fails

- *"Use a full path"*: the folder must be an absolute path such as `D:\Projects\budget-app`.
- *"Folder not found"*: the folder must already exist.
- *"… is not empty and was not created by Specwright"*: the target has files but no `.specwright-export.json` from an
  earlier export of this plan.
- *"The subfolder may only use …"*: remove `..` or special characters from the subfolder.

Choose an empty folder, or a folder you previously exported this plan to. Specwright does this on purpose so it never
overwrites your files.

## A chat proposal fails to apply

The PRD section changed after the proposal was made, or the target feature or task no longer exists. Ask the chat
again to get a proposal against the current plan.

## Ollama works in the terminal but not in Specwright

- Use the OpenAI-compatible path: `OLLAMA_BASE_URL=http://localhost:11434/v1` (note the `/v1`).
- The model name must match `ollama list` exactly, e.g. `ollama:llama3.1:8b`.

## Database errors after editing the schema

Generate a migration with `npx drizzle-kit generate` and restart. Migrations only apply what is in `drizzle/`; editing
`schema.ts` alone does not change the database.

## Starting over

Stop the app, move the `data/` folder somewhere safe (or delete it), and start again. A fresh database is created and
migrated automatically.
