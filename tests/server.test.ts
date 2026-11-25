import { readFileSync, rmSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { loadKit, loadPlatformConfig, ROOT } from "../src/core/kit.ts";
import { KeywordReader } from "../src/core/model/keyword.ts";
import { buildApp, parseKeys } from "../src/server/app.ts";
import { sendWriteback, type WritebackPayload } from "../src/server/salesforce.ts";

const log = `${ROOT}var/test-events.jsonl`;
const writebacks: WritebackPayload[] = [];
const app = buildApp({
  cfg: loadPlatformConfig(),
  kits: { northwind: loadKit("northwind"), kestrel: loadKit("kestrel") },
  keys: parseKeys("northwind:nw,kestrel:ks"),
  reader: new KeywordReader(),
  eventLog: log,
  onWriteback: async (_t, p) => { writebacks.push(p); },
});
const auth = (key = "nw") => ({ authorization: `Bearer ${key}` });
afterAll(() => rmSync(log, { force: true }));

async function start(body: object, key = "nw"): Promise<string> {
  const r = await app.inject({ method: "POST", url: "/v1/conversations", headers: auth(key), payload: body });
  return (r.json() as { id: string }).id;
}
const say = (id: string, messageId: string, text: string, key = "nw") =>
  app.inject({ method: "POST", url: `/v1/conversations/${id}/messages`, headers: auth(key), payload: { messageId, text } });

describe("service", () => {
  it("rejects unknown keys and keeps tenants apart", async () => {
    expect((await app.inject({ method: "POST", url: "/v1/conversations", payload: {} })).statusCode).toBe(401);
    const id = await start({ country: "Germany" }, "nw");
    expect((await say(id, "m1", "hello", "ks")).statusCode).toBe(404);
  });

  it("runs a conversation to a booking and writes back once", async () => {
    const id = await start({ country: "Germany", cmp: "unset" });
    const a = (await say(id, "m1", "I'm the CFO, 640 employees, we are evaluating and want a demo. Do you support XRechnung?")).json() as { next: string; shown: unknown[] };
    expect(a.next).toBe("ask_consent");
    expect(a.shown.length).toBeGreaterThan(0);
    expect(((await say(id, "m2", "Yes")).json() as { next: string }).next).toBe("ask_email");
    const c = (await say(id, "m3", "anna@alpenblick.example")).json() as { next: string; routing: { via: string } };
    expect(c).toMatchObject({ next: "booked", routing: { via: "rule_entry" } });
    expect(writebacks).toHaveLength(1);
    expect(writebacks[0]).toMatchObject({ conversationId: id, email: "anna@alpenblick.example", consentBasis: "in_chat_consent", ownerType: "Queue" });
  });

  it("decides a message once: a retry returns the stored result", async () => {
    const id = await start({ country: "Germany" });
    const first = (await say(id, "same", "Do you have an API?")).json() as object;
    const again = (await say(id, "same", "something else entirely")).json() as { replayed: boolean };
    expect(again).toMatchObject({ ...first, replayed: true });
    const events = readFileSync(log, "utf8").trim().split("\n").map((l) => JSON.parse(l) as { messageId?: string; id?: string });
    expect(events.filter((e) => e.messageId === "same" && e.id === id)).toHaveLength(1);
  });

  it("validates input", async () => {
    const id = await start({});
    expect((await say(id, "", "x")).statusCode).toBe(400);
    expect((await say(id, "big", "x".repeat(2001))).statusCode).toBe(413);
  });

  it("imports and replays routing rules", async () => {
    const xml = readFileSync(`${ROOT}config/demo/northwind/salesforce/Lead.assignmentRules`, "utf8");
    const imp = (await app.inject({ method: "POST", url: "/v1/routing/import", headers: auth(), payload: { xml } })).json() as { partial: unknown[] };
    expect(imp.partial).toHaveLength(1);
    const bad = await app.inject({ method: "POST", url: "/v1/routing/import", headers: auth(), payload: { xml: "<x/>" } });
    expect(bad.statusCode).toBe(422);
    const rep = (await app.inject({ method: "POST", url: "/v1/routing/replay", headers: auth(), payload: { leads: [{ Country: "Sweden", NumberOfEmployees: 300, LeadSource: "Web Chat" }] } })).json() as { decisions: { owner: { id: string } }[] };
    expect(rep.decisions[0]?.owner.id).toBe("Nordics");
  });

  it("answers a questionnaire only from in-date evidence", async () => {
    const r = (await app.inject({ method: "POST", url: "/v1/questionnaires", headers: auth(), payload: { questions: [
      { id: "a", text: "Is customer data used to train AI models?" },
      { id: "b", text: "When was the last independent penetration test?" },
    ] } })).json() as { answers: { status: string }[] };
    expect(r.answers.map((a) => a.status)).toEqual(["auto", "owner"]);
  });
});

describe("salesforce write-back", () => {
  it("posts to the Apex REST resource with a bearer token", async () => {
    const calls: { url: string; init: { headers: Record<string, string>; body: string } }[] = [];
    const r = await sendWriteback({ instanceUrl: "https://acme.my.salesforce.com/", accessToken: "t" }, { conversationId: "c1" } as WritebackPayload,
      async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200, text: async () => "{}" }; });
    expect(r.ok).toBe(true);
    expect(calls[0]?.url).toBe("https://acme.my.salesforce.com/services/apexrest/sdr/v1/conversation");
    expect(calls[0]?.init.headers.Authorization).toBe("Bearer t");
  });
});
