import type { RawUsage } from "./types.js";

export interface ModelPricing {
  inputPerMTok: number;
  outputPerMTok: number;
  cacheWritePerMTok: number;
  cacheReadPerMTok: number;
}

const OPUS: ModelPricing = {
  inputPerMTok: 15,
  outputPerMTok: 75,
  cacheWritePerMTok: 18.75,
  cacheReadPerMTok: 1.5,
};

const SONNET: ModelPricing = {
  inputPerMTok: 3,
  outputPerMTok: 15,
  cacheWritePerMTok: 3.75,
  cacheReadPerMTok: 0.3,
};

const HAIKU: ModelPricing = {
  inputPerMTok: 1,
  outputPerMTok: 5,
  cacheWritePerMTok: 1.25,
  cacheReadPerMTok: 0.1,
};

export function pricingForModel(model: string | undefined): ModelPricing {
  const m = (model ?? "").toLowerCase();
  if (m.includes("opus")) return OPUS;
  if (m.includes("haiku")) return HAIKU;
  return SONNET;
}

export function costForUsage(usage: RawUsage | undefined, pricing: ModelPricing): number {
  if (!usage) return 0;
  const input = usage.input_tokens ?? 0;
  const cacheCreate = usage.cache_creation_input_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  return (
    (input * pricing.inputPerMTok +
      cacheCreate * pricing.cacheWritePerMTok +
      cacheRead * pricing.cacheReadPerMTok +
      output * pricing.outputPerMTok) /
    1_000_000
  );
}

export function costForTokens(tokens: number, kind: keyof ModelPricing, pricing: ModelPricing): number {
  return (tokens * pricing[kind]) / 1_000_000;
}

export function formatUsd(amount: number): string {
  if (amount >= 100) return `$${amount.toFixed(0)}`;
  if (amount >= 1) return `$${amount.toFixed(2)}`;
  if (amount >= 0.01) return `$${amount.toFixed(2)}`;
  if (amount > 0) return `<$0.01`;
  return "$0.00";
}
