import "server-only";
import OpenAI from "openai";
import { z } from "zod";
import type { GenerateArgs, LlmAdapter, Usage } from "./types";

function messages(args: GenerateArgs, extraSystem?: string): OpenAI.Chat.ChatCompletionMessageParam[] {
  const system = [args.system, extraSystem].filter(Boolean).join("\n\n");
  return [...(system ? [{ role: "system" as const, content: system }] : []), { role: "user", content: args.prompt }];
}

function usageOf(u: OpenAI.CompletionUsage | undefined | null): Usage {
  return { inputTokens: u?.prompt_tokens, outputTokens: u?.completion_tokens };
}

/**
 * Parses model JSON. Plain JSON is tried first: valid output can itself contain ``` fences inside strings
 * (e.g. a PRD section with a Mermaid diagram), so fence-stripping must only be a fallback for models that wrap
 * the whole answer in a fence, or add prose around the object.
 */
function parseJson(text: string): unknown {
  const t = text.trim();
  try {
    return JSON.parse(t);
  } catch {
    const whole = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/.exec(t);
    if (whole) return JSON.parse(whole[1]);
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(t.slice(start, end + 1));
    throw new Error("The reply contained no JSON object.");
  }
}

export function openAiCompatibleAdapter(baseURL: string, apiKey: string | undefined): LlmAdapter {
  // Local servers (Ollama) ignore the key, but the SDK requires a non-empty one.
  const client = new OpenAI({ baseURL, apiKey: apiKey || "not-needed" });

  return {
    async generateText(model, args) {
      const res = await client.chat.completions.create({ model, messages: messages(args) });
      return { text: res.choices[0]?.message?.content ?? "", usage: usageOf(res.usage) };
    },

    async *streamText(model, args, onUsage) {
      const stream = await client.chat.completions.create(
        { model, messages: messages(args), stream: true, stream_options: { include_usage: true } },
        { signal: args.signal },
      );
      let usage: Usage = {};
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) yield delta;
        if (chunk.usage) usage = usageOf(chunk.usage);
      }
      onUsage(usage);
    },

    // JSON mode is the most widely supported structured-output option across providers;
    // the schema goes in the prompt and the result is validated here, with one repair retry.
    async generateObject<T>(model: string, schema: z.ZodType<T>, args: GenerateArgs) {
      const jsonSchema = JSON.stringify(z.toJSONSchema(schema));
      const instruction = `Respond with a single JSON object only, no prose, that validates against this JSON Schema:\n${jsonSchema}`;
      let prompt = args.prompt;
      let lastError = "";
      const total: Usage = { inputTokens: 0, outputTokens: 0 };

      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await client.chat.completions.create({
          model,
          messages: messages({ ...args, prompt }, instruction),
          response_format: { type: "json_object" },
        });
        const u = usageOf(res.usage);
        total.inputTokens! += u.inputTokens ?? 0;
        total.outputTokens! += u.outputTokens ?? 0;
        const raw = res.choices[0]?.message?.content ?? "";
        try {
          const parsed = schema.safeParse(parseJson(raw));
          if (parsed.success) return { object: parsed.data, raw, usage: total };
          lastError = z.prettifyError(parsed.error);
        } catch (e) {
          lastError = e instanceof Error ? e.message : String(e);
        }
        prompt = `${args.prompt}\n\nYour previous answer was invalid:\n${lastError}\nReturn a corrected JSON object.`;
      }
      throw new Error(`Model output did not match the schema after a retry: ${lastError}`);
    },

    async listModels() {
      const ids: string[] = [];
      for await (const m of client.models.list()) ids.push(m.id);
      return ids.sort();
    },
  };
}
