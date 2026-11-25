// HTTP API for the live demo. The tenant (which prospect's kit) comes from the API key, never from the body.
// A message is decided once: retries with the same messageId get the stored result back.

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { decideTurn, newConversation, type ConversationState, type TurnResult } from "../core/agent/turn.ts";
import { PassageIndex } from "../core/grounding/retrieve.ts";
import { sentences } from "../core/grounding/text.ts";
import type { Kit, PlatformConfig } from "../core/kit.ts";
import type { Reader } from "../core/model/types.ts";
import { gateAnswer } from "../core/questionnaire/gate.ts";
import { RoundRobin, routeLead } from "../core/routing/router.ts";
import { activeRule, importAssignmentRules } from "../core/salesforce/metadata.ts";
import type { CmpState } from "../core/consent/gate.ts";
import { writebackPayload, type WritebackPayload } from "./salesforce.ts";

export interface AppDeps {
  cfg: PlatformConfig;
  kits: Record<string, Kit>;
  /** API key -> prospect */
  keys: Record<string, string>;
  reader: Reader;
  eventLog?: string;
  onWriteback?: (tenant: string, payload: WritebackPayload) => Promise<void>;
}

interface Conversation {
  tenant: string;
  state: ConversationState;
  transcript: string[];
  decided: Map<string, unknown>;
}

const MAX_MESSAGE = 2000;

export function parseKeys(raw: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of (raw ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
    const [tenant, key] = pair.split(":");
    if (tenant && key) out[key] = tenant;
  }
  return out;
}

export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({ logger: false, bodyLimit: 256 * 1024 });
  const conversations = new Map<string, Conversation>();
  const indexes = new Map(Object.entries(deps.kits).map(([k, kit]) => [k, new PassageIndex(kit.passages, deps.cfg.retrieval.k1, deps.cfg.retrieval.b)]));
  const robins = new Map(Object.entries(deps.kits).map(([k, kit]) => [k, new RoundRobin(kit.org.queues)]));
  let seq = 0;

  const log = (event: Record<string, unknown>): void => {
    if (!deps.eventLog) return;
    mkdirSync(dirname(deps.eventLog), { recursive: true });
    appendFileSync(deps.eventLog, JSON.stringify({ at: new Date().toISOString(), ...event }) + "\n");
  };

  const tenantOf = (req: FastifyRequest): string | null => {
    const h = req.headers.authorization ?? "";
    const key = h.startsWith("Bearer ") ? h.slice(7) : (req.headers["x-api-key"] as string | undefined) ?? "";
    return deps.keys[key] ?? null;
  };

  app.addHook("onRequest", async (req, reply) => {
    if (req.url === "/health") return;
    const tenant = tenantOf(req);
    if (!tenant || !deps.kits[tenant]) return reply.code(401).send({ error: "unknown API key" });
    (req as FastifyRequest & { tenant: string }).tenant = tenant;
  });
  const tenant = (req: FastifyRequest): string => (req as FastifyRequest & { tenant: string }).tenant;
  const kitOf = (req: FastifyRequest): Kit => deps.kits[tenant(req)] as Kit;

  app.get("/health", async () => ({ ok: true, kits: Object.keys(deps.kits) }));

  app.post<{ Body: { country?: string; cmp?: CmpState; companyDomain?: string } }>("/v1/conversations", async (req, reply) => {
    const b = req.body ?? {};
    const cmp: CmpState = b.cmp === "granted" || b.cmp === "denied" ? b.cmp : "unset";
    const id = `c${++seq}`;
    const state = newConversation(id, cmp, b.companyDomain ?? null);
    if (b.country) state.facts.country = b.country;
    conversations.set(id, { tenant: tenant(req), state, transcript: [], decided: new Map() });
    log({ type: "conversation_started", tenant: tenant(req), id, cmp });
    return reply.code(201).send({ id });
  });

  app.post<{ Params: { id: string }; Body: { messageId?: string; text?: string } }>("/v1/conversations/:id/messages", async (req, reply) => {
    const conv = conversations.get(req.params.id);
    if (!conv || conv.tenant !== tenant(req)) return reply.code(404).send({ error: "conversation not found" });
    const { messageId, text } = req.body ?? {};
    if (!messageId || typeof text !== "string" || text.trim() === "") return reply.code(400).send({ error: "messageId and text are required" });
    if (text.length > MAX_MESSAGE) return reply.code(413).send({ error: `message longer than ${MAX_MESSAGE} characters` });
    const seen = conv.decided.get(messageId);
    if (seen) return reply.send({ ...(seen as object), replayed: true });

    const kit = kitOf(req);
    const passages = (indexes.get(conv.tenant) as PassageIndex).search(text, deps.cfg.retrieval.topK).map((h) => h.passage);
    const read = await deps.reader.read({ message: text, company: kit.playbook.company, passages, known: conv.state.facts });
    const t: TurnResult = decideTurn(conv.state, text, read, kit, deps.cfg, robins.get(conv.tenant) as RoundRobin);
    const wasBooked = conv.state.booked !== null;
    conv.state = t.state;
    conv.transcript.push(`Visitor: ${text}`, `Agent: ${t.reply}`);
    const body = {
      reply: t.reply,
      next: t.next,
      reader: read.source,
      shown: t.answer.shown.map((v) => ({ text: v.text, citation: v.citation })),
      removed: t.answer.removed.map((v) => ({ text: v.text, reason: v.reason })),
      decision: { action: t.decision.action, reasons: t.decision.reasons },
      consent: { mayCollectPersonalData: t.consent.mayCollectPersonalData, reason: t.consent.reason },
      routing: t.routing ? { owner: t.routing.owner, via: t.routing.via, assignee: t.assignee, explanation: t.routing.explanation } : null,
    };
    conv.decided.set(messageId, body);
    log({ type: "turn_decided", tenant: conv.tenant, id: conv.state.id, messageId, next: t.next, removed: body.removed.length, routing: body.routing?.via ?? null });
    if (t.routing && t.assignee && !wasBooked && deps.onWriteback) {
      await deps.onWriteback(conv.tenant, writebackPayload(conv.state.id, conv.state.facts, t.routing, t.assignee, t.consent.basis, conv.transcript));
    }
    return reply.send(body);
  });

  app.post<{ Body: { xml?: string } }>("/v1/routing/import", async (req, reply) => {
    const xml = req.body?.xml;
    if (typeof xml !== "string" || xml.length === 0) return reply.code(400).send({ error: "xml is required" });
    try {
      const r = importAssignmentRules(xml);
      return reply.send({ rules: r.rules.map((x) => ({ name: x.name, active: x.active, entries: x.entries.length })), refused: r.refused, partial: r.partial, warnings: r.warnings });
    } catch (err) {
      return reply.code(422).send({ error: (err as Error).message });
    }
  });

  app.post<{ Body: { leads?: Record<string, string | number | boolean | null>[]; xml?: string; rule?: string } }>("/v1/routing/replay", async (req, reply) => {
    const kit = kitOf(req);
    const leads = req.body?.leads;
    if (!Array.isArray(leads) || leads.length === 0 || leads.length > 5000) return reply.code(400).send({ error: "send 1 to 5000 leads" });
    let rule = kit.rule;
    if (req.body?.xml) {
      try { rule = activeRule(importAssignmentRules(req.body.xml), req.body.rule); } catch (err) { return reply.code(422).send({ error: (err as Error).message }); }
    }
    const decisions = leads.map((lead) => {
      const d = routeLead(lead, typeof lead.Email === "string" ? lead.Email : null, {
        rule, accounts: kit.accounts, defaultOwner: kit.org.defaultLeadOwner, reviewQueue: deps.cfg.routing.reviewQueue,
        routeToAccountOwnerWhen: kit.playbook.rulesOfEngagement.routeToAccountOwnerWhen,
      });
      return { owner: d.owner, via: d.via, entry: d.entryOrder ?? null, explanation: d.explanation };
    });
    return reply.send({ rule: rule.name, decisions });
  });

  app.post<{ Body: { questions?: { id: string; text: string }[] } }>("/v1/questionnaires", async (req, reply) => {
    const kit = kitOf(req);
    const qs = req.body?.questions;
    if (!Array.isArray(qs) || qs.length === 0 || qs.length > 500) return reply.code(400).send({ error: "send 1 to 500 questions" });
    const evIndex = new PassageIndex(kit.evidence.map((e) => ({ id: e.id, topic: e.title, text: e.text })), deps.cfg.retrieval.k1, deps.cfg.retrieval.b);
    const answers = qs.map((q) => {
      const top = evIndex.search(String(q.text).slice(0, MAX_MESSAGE), 1)[0];
      const draft = top && top.score > 2
        ? { questionId: q.id, answer: sentences(top.passage.text)[0] ?? null, evidenceIds: [top.passage.id] }
        : { questionId: q.id, answer: null, evidenceIds: [] };
      return gateAnswer(draft, kit.evidence, deps.cfg.questionnaire.today, deps.cfg.claims, `security@${kit.playbook.domain}`, kit.playbook.brandTerms);
    });
    log({ type: "questionnaire_answered", tenant: tenant(req), questions: qs.length, auto: answers.filter((a) => a.status === "auto").length });
    return reply.send({ answers });
  });

  return app;
}
