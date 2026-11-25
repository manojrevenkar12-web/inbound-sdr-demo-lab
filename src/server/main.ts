// Starts the demo service. Uses Claude when ANTHROPIC_API_KEY is set, the keyword reader otherwise.
// SF_INSTANCE_URL and SF_ACCESS_TOKEN turn on write-back to a Salesforce org with the Apex classes deployed.

import { readdirSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { loadKit, loadPlatformConfig, ROOT } from "../core/kit.ts";
import { ClaudeReader } from "../core/model/claude.ts";
import { KeywordReader } from "../core/model/keyword.ts";
import type { Reader } from "../core/model/types.ts";
import { buildApp, parseKeys } from "./app.ts";
import { sendWriteback } from "./salesforce.ts";

const cfg = loadPlatformConfig();
const kits = Object.fromEntries(readdirSync(join(ROOT, "config/demo")).map((p) => [p, loadKit(p)]));
const keys = parseKeys(process.env[cfg.service.apiKeys] ?? "northwind:nw-demo-key,kestrel:ks-demo-key");

let reader: Reader = new KeywordReader();
if (process.env.ANTHROPIC_API_KEY) {
  const client = new Anthropic({ timeout: cfg.model.timeoutMs, maxRetries: 1 });
  reader = new ClaudeReader(client as unknown as ConstructorParameters<typeof ClaudeReader>[0], cfg.model.model, cfg.model.maxTokens);
}

const sf = process.env.SF_INSTANCE_URL && process.env.SF_ACCESS_TOKEN
  ? { instanceUrl: process.env.SF_INSTANCE_URL, accessToken: process.env.SF_ACCESS_TOKEN }
  : null;

const app = buildApp({
  cfg,
  kits,
  keys,
  reader,
  eventLog: join(ROOT, cfg.service.eventLog),
  onWriteback: sf
    ? async (_tenant, payload) => {
        const r = await sendWriteback(sf, payload, fetch as never);
        if (!r.ok) console.error(`write-back failed: ${r.status} ${r.body.slice(0, 200)}`);
      }
    : undefined,
});

const port = Number(process.env.PORT ?? cfg.service.port);
await app.listen({ port, host: "0.0.0.0" });
console.log(`inbound-sdr-demo-lab on :${port} with ${reader instanceof ClaudeReader ? "Claude" : "the keyword reader"}; kits: ${Object.keys(kits).join(", ")}`);
