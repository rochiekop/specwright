# Configuration

All configuration lives in `.env.local` (secrets and defaults) and on the **Models** page (model choices, stored in
the database). Restart `npm run dev` after changing `.env.local`.

## Environment variables

Copy `.env.example` to `.env.local` and set only what you use.

| Variable | Purpose |
|---|---|
| `MODEL_DEFAULT` | Default model for every step, as `provider:model`. Overridden by the default set on the Models page. Falls back to `anthropic:claude-opus-5-5`. |
| `ANTHROPIC_API_KEY` | Claude |
| `OPENAI_API_KEY` | OpenAI |
| `GEMINI_API_KEY` | Google Gemini |
| `DEEPSEEK_API_KEY` | DeepSeek |
| `OPENROUTER_API_KEY` | OpenRouter (access to many models with one key) |
| `MOONSHOT_API_KEY` | Moonshot (Kimi) |
| `GROQ_API_KEY` | Groq |
| `OLLAMA_BASE_URL` | Enables local Ollama, e.g. `http://localhost:11434/v1`. No key needed. |
| `CUSTOM_BASE_URL`, `CUSTOM_API_KEY` | Any other OpenAI-compatible server: LM Studio, vLLM, a company gateway, … |
| `<PROVIDER>_BASE_URL` | Overrides any provider's endpoint, e.g. `OPENAI_BASE_URL` for an Azure/OpenAI proxy. |
| `DATABASE_FILE` | SQLite file path, relative to the project folder. Default `data/app.db`. |

Keys are only read by the local Next.js server. They are never sent to the browser.

## Providers

| Provider id | Called through | Default endpoint |
|---|---|---|
| `anthropic` | Anthropic SDK | Anthropic API |
| `openai` | OpenAI SDK | `https://api.openai.com/v1` |
| `gemini` | OpenAI SDK | `https://generativelanguage.googleapis.com/v1beta/openai/` |
| `deepseek` | OpenAI SDK | `https://api.deepseek.com` |
| `openrouter` | OpenAI SDK | `https://openrouter.ai/api/v1` |
| `moonshot` | OpenAI SDK | `https://api.moonshot.ai/v1` |
| `groq` | OpenAI SDK | `https://api.groq.com/openai/v1` |
| `ollama` | OpenAI SDK | `http://localhost:11434/v1` (enabled only when `OLLAMA_BASE_URL` is set) |
| `custom` | OpenAI SDK | none: set `CUSTOM_BASE_URL` |

A provider shows as *configured* on the Models page when its key (or, for Ollama and custom, its base URL) is set.

## Model names

Models are written as `provider:model`. Everything after the first `:` is the model id, so ids that contain a colon
work:

```
anthropic:claude-opus-5-5
anthropic:claude-sonnet-5-5
openai:gpt-4.1
deepseek:deepseek-chat
openrouter:meta-llama/llama-3.3-70b-instruct
ollama:llama3.1:8b
```

## The Models page

- **Load models** fetches the provider's model list and offers it as suggestions.
- **Default model** is used by every step that has no override.
- **Per-step models** override the default for one step.
- **Test** sends a one-word prompt to check the key and model, and shows the response time.
- **Recent calls** lists the latest AI calls with step, model, status, tokens and duration.

### Per-step models

| Step | What it does | Suggested model |
|---|---|---|
| Clarifying questions | Short JSON output | Fast and cheap |
| Feature breakdown | Large JSON tree | Strong |
| PRD writing | Long, careful writing (streamed) | Your strongest |
| PRD quality check | Reviews and fixes the PRD | Strong |
| Task breakdown | Many small JSON items | Mid-tier is usually enough |
| Revision chat | Interactive edits | Balanced speed and quality |

Structured steps (questions, features, tasks, quality, chat) expect valid JSON that matches a schema. Small local
models sometimes fail these; if a step keeps failing, try a larger model for that step only.

## Data, logs and backups

- Database: `data/app.db` (SQLite in WAL mode, with `app.db-wal` and `app.db-shm` alongside). Migrations in
  `drizzle/` run automatically on startup.
- **Backup:** stop the app, then copy the whole `data/` folder. Copying only `app.db` while the app runs can miss
  recent writes held in the WAL file.
- **Restore:** stop the app and put the copied `data/` folder back.
- **AI log:** every call is stored in `generation_runs` (step, provider, model, full prompt, response, tokens,
  duration, error). Open the database with any SQLite browser to inspect prompts in detail. The table grows over
  time; delete old rows if it gets large.
- Four stack presets are seeded on first start into `stack_presets`. To add your own, insert a row into that table
  (there is no UI for presets yet).

## Security notes

- Specwright has no authentication. Run it on `localhost` only; do not expose port 3000 on a network.
- **Write to folder** writes files on your disk. It refuses paths that escape the chosen folder and will not write
  into a non-empty folder it did not create, but only point it at folders you intend to use.
- `data/` contains your ideas, answers and full prompts. Keep it out of public repositories.
