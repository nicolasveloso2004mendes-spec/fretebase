import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/webhooks/pagamentos/route";

const SECRET = "x".repeat(40);
const body = JSON.stringify({ id: "evt_1", type: "assinatura", status: "confirmado", amount: 99, org_id: "11111111-1111-4111-8111-111111111111" });
const sign = (b: string, s = SECRET) => createHmac("sha256", s).update(b).digest("hex");
const req = (b: string, sig?: string, ip = "9.9.9.9") => new Request("http://x/api/webhooks/pagamentos", { method: "POST", body: b, headers: { "x-signature": sig ?? "", "x-forwarded-for": ip } });

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const env = () => { vi.stubEnv("PAYMENT_WEBHOOK_SECRET", SECRET); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon"); };

describe("webhook de pagamentos", () => {
  it("503 sem configuração", async () => { expect((await POST(req(body, sign(body)))).status).toBe(503); });
  it("401 com assinatura inválida e não chama o banco", async () => {
    env(); const f = vi.fn(); vi.stubGlobal("fetch", f);
    expect((await POST(req(body, sign(body, "outro-segredo-outro-segredo-1234")))).status).toBe(401);
    expect(f).not.toHaveBeenCalled();
  });
  it("400 para JSON inválido assinado", async () => {
    env(); vi.stubGlobal("fetch", vi.fn());
    const b = "{nao-json"; expect((await POST(req(b, sign(b)))).status).toBe(400);
  });
  it("400 para evento incompleto", async () => {
    env(); vi.stubGlobal("fetch", vi.fn());
    const b = JSON.stringify({ id: "a" }); expect((await POST(req(b, sign(b)))).status).toBe(400);
  });
  it("grava evento válido pela função do banco, sem service_role", async () => {
    env(); const f = vi.fn().mockResolvedValue(new Response(JSON.stringify("ok"), { status: 200 })); vi.stubGlobal("fetch", f);
    const r = await POST(req(body, sign(body)));
    expect(r.status).toBe(200); expect(await r.json()).toEqual({ ok: true, duplicate: false });
    expect(f.mock.calls[0][0]).toContain("/rpc/ingest_payment_event");
    expect(JSON.stringify(f.mock.calls[0][1])).not.toContain("service_role");
  });
  it("evento repetido vira duplicate", async () => {
    env(); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify("duplicate"), { status: 200 })));
    const r = await POST(req(body, sign(body), "8.8.8.8")); expect((await r.json()).duplicate).toBe(true);
  });
  it("413 para corpo grande", async () => {
    env(); vi.stubGlobal("fetch", vi.fn());
    const b = JSON.stringify({ id: "a", pad: "x".repeat(70000) }); expect((await POST(req(b, sign(b), "7.7.7.7"))).status).toBe(413);
  });
  it("429 após exceder o limite por IP", async () => {
    env(); vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(JSON.stringify("ok"))));
    let last = 0; for (let i = 0; i < 70; i++) last = (await POST(req(body, sign(body), "6.6.6.6"))).status;
    expect(last).toBe(429);
  });
});
