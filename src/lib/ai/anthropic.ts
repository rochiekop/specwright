import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import type { GenerateArgs, LlmAdapter, Usage } from "./types";

// Models that accept the server-side refusal fallback ("default" routing picks the fallback model).
const FALLBACK_MODELS = new Set(["claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);

function fallbackParams(model: string) {
  return FALLBACK_MODELS.has(model)
    ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
    : {};
}

function baseParams(model: string, args: GenerateArgs, defaultMaxTokens: number) {
  return {
    model,
    max_tokens: args.maxTokens ?? defaultMaxTokens,
    ...(args.system ? { system: args.system } : {}),
    messages: [{ role: "user" as const, content: args.prompt }],
    ...fallbackParams(model),
  };
}

function usageOf(u: { input_tokens: number; output_tokens: number }): Usage {
  return { inputTokens: u.input_tokens, outputTokens: u.output_tokens };
}

function assertNotRefused(msg: Anthropic.Beta.BetaMessage) {
  if (msg.stop_reason === "refusal") {
    throw new Error(`Claude declined this request${msg.stop_details?.category ? ` (${msg.stop_details.category})` : ""}.`);
  }
}

function textOf(msg: Anthropic.Beta.BetaMessage) {
  return msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
}

export function anthropicAdapter(apiKey: string): LlmAdapter {
  const client = new Anthropic({ apiKey });

  return {
    async generateText(model, args) {
      // Streamed so long outputs never hit the HTTP timeout.
      const msg = await client.beta.messages
        .stream({ ...baseParams(model, args, 64000), output_config: { effort: args.effort ?? "high" } })
        .finalMessage();
      assertNotRefused(msg);
      return { text: textOf(msg), usage: usageOf(msg.usage) };
    },

    async *streamText(model, args, onUsage) {
      const stream = client.beta.messages.stream(
        { ...baseParams(model, args, 64000), output_config: { effort: args.effort ?? "high" } },
        { signal: args.signal },
      );
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") yield event.delta.text;
      }
      const msg = await stream.finalMessage();
      assertNotRefused(msg);
      onUsage(usageOf(msg.usage));
    },

    async generateObject<T>(model: string, schema: z.ZodType<T>, args: GenerateArgs) {
      const msg = await client.beta.messages.parse({
        ...baseParams(model, args, 16000),
        output_config: { effort: args.effort ?? "high", format: betaZodOutputFormat(schema) },
      });
      assertNotRefused(msg);
      if (msg.parsed_output == null) throw new Error("Claude returned output that did not match the schema.");
      return { object: msg.parsed_output as T, raw: textOf(msg), usage: usageOf(msg.usage) };
    },

    async listModels() {
      const ids: string[] = [];
      for await (const m of client.models.list()) ids.push(m.id);
      return ids;
    },
  };
}
