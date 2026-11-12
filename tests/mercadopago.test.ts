import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mapPaymentStatus, parseReference, verifyMpSignature } from "@/lib/mercadopago";

const SECRET = "segredo-de-teste-mp";
const ORG = "11111111-2222-3333-4444-555555555555";
const sign = (dataId: string, reqId: string, ts: string) =>
  `ts=${ts},v1=${createHmac("sha256", SECRET).update(`id:${dataId.toLowerCase()};request-id:${reqId};ts:${ts};`).digest("hex")}`;

describe("assinatura do Mercado Pago", () => {
  it("aceita assinatura correta (data.id em minúsculas no manifest)", () => {
    expect(verifyMpSignature({ xSignature: sign("ABC123", "req-1", "1704908010"), xRequestId: "req-1", dataId: "ABC123", secret: SECRET })).toBe(true);
  });
  it("recusa id, request-id ou segredo diferentes, e cabeçalho malformado", () => {
    const s = sign("123", "req-1", "1704908010");
    expect(verifyMpSignature({ xSignature: s, xRequestId: "req-1", dataId: "124", secret: SECRET })).toBe(false);
    expect(verifyMpSignature({ xSignature: s, xRequestId: "req-2", dataId: "123", secret: SECRET })).toBe(false);
    expect(verifyMpSignature({ xSignature: s, xRequestId: "req-1", dataId: "123", secret: "outro-segredo" })).toBe(false);
    expect(verifyMpSignature({ xSignature: "lixo", xRequestId: "req-1", dataId: "123", secret: SECRET })).toBe(false);
    expect(verifyMpSignature({ xSignature: sign("ABC123", "req-1", "1704908010"), xRequestId: "req-1", dataId: "ABC123", secret: `outro-segredo-1,${SECRET}` })).toBe(true);
    expect(verifyMpSignature({ xSignature: sign("ABC123", "req-1", "1704908010"), xRequestId: "req-1", dataId: "ABC123", secret: "errado-um-1,errado-dois-2" })).toBe(false);
    expect(verifyMpSignature({ xSignature: null, xRequestId: "req-1", dataId: "123", secret: SECRET })).toBe(false);
    expect(verifyMpSignature({ xSignature: s, xRequestId: "req-1", dataId: "123", secret: undefined })).toBe(false);
  });
  it("só 'approved' confirma", () => {
    expect(mapPaymentStatus("approved")).toBe("confirmado");
    for (const s of ["pending", "in_process", "authorized", undefined]) expect(mapPaymentStatus(s)).toBe("pendente");
    expect(mapPaymentStatus("rejected")).toBe("falhou");
    expect(mapPaymentStatus("refunded")).toBe("estornado");
  });
  it("interpreta a referência org:plano e recusa lixo", () => {
    expect(parseReference(`${ORG}:premium`)).toEqual({ orgId: ORG, plan: "premium" });
    expect(parseReference(ORG)).toEqual({ orgId: ORG, plan: null });
    expect(parseReference("nao-e-uuid:premium")).toBeNull();
    expect(parseReference(undefined)).toBeNull();
  });
});

describe("rota /api/webhooks/mercadopago", () => {
  const env = { ...process.env };
  beforeEach(() => {
    Object.assign(process.env, { MP_WEBHOOK_SECRET: SECRET, MP_ACCESS_TOKEN: "TEST-token", PAYMENT_WEBHOOK_SECRET: "x".repeat(40), NEXT_PUBLIC_SUPABASE_URL: "https://db.test", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" });
  });
  afterEach(() => { process.env = { ...env }; vi.restoreAllMocks(); vi.resetModules(); });

  const call = async (opts: { dataId?: string; sig?: string; type?: string } = {}) => {
    const { POST } = await import("@/app/api/webhooks/mercadopago/route");
    const dataId = opts.dataId ?? "999";
    return POST(new Request(`https://x.test/api/webhooks/mercadopago?type=${opts.type ?? "payment"}&data.id=${dataId}`, {
      method: "POST", headers: { "x-signature": opts.sig ?? sign(dataId, "r1", "1700000000"), "x-request-id": "r1", "content-type": "application/json" }, body: JSON.stringify({ data: { id: dataId } }),
    }));
  };

  it("503 sem configuração", async () => {
    delete process.env.MP_ACCESS_TOKEN;
    expect((await call()).status).toBe(503);
  });
  it("401 com assinatura inválida, sem consultar ninguém", async () => {
    const f = vi.spyOn(globalThis, "fetch");
    expect((await call({ sig: "ts=1,v1=" + "0".repeat(64) })).status).toBe(401);
    expect(f).not.toHaveBeenCalled();
  });
  it("pagamento aprovado: consulta o MP e grava pelo banco com o plano da referência", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockImplementation(async (u) => {
      const url = String(u);
      if (url.startsWith("https://api.mercadopago.com/v1/payments/999")) return new Response(JSON.stringify({ id: 999, status: "approved", currency_id: "BRL", transaction_amount: 199.9, date_approved: "2026-11-11T10:00:00.000-03:00", external_reference: `${ORG}:premium` }));
      return new Response(JSON.stringify("ok"));
    });
    const r = await call();
    expect(r.status).toBe(200);
    const rpc = f.mock.calls.find((c) => String(c[0]).includes("/rpc/ingest_payment_event"))!;
    const b = JSON.parse(String((rpc[1] as RequestInit).body));
    expect(b).toMatchObject({ p_provider: "mercadopago", p_org: ORG, p_status: "confirmado", p_amount: 199.9, p_kind: "pagamento" });
    expect(b.p_raw.fb_plan).toBe("premium");
    expect(JSON.stringify(b)).not.toContain("service_role");
  });
  it("pagamento pendente não confirma; assinatura cancelada vira 'falhou'", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockImplementation(async (u) => {
      const url = String(u);
      if (url.includes("/v1/payments/")) return new Response(JSON.stringify({ id: 1, status: "pending", external_reference: `${ORG}:premium` }));
      if (url.includes("/preapproval/")) return new Response(JSON.stringify({ id: "p1", status: "cancelled", external_reference: `${ORG}:premium` }));
      return new Response(JSON.stringify("ok"));
    });
    await call({ dataId: "1" });
    await call({ dataId: "p1", type: "subscription_preapproval", sig: sign("p1", "r1", "1700000000") });
    const bodies = f.mock.calls.filter((c) => String(c[0]).includes("/rpc/")).map((c) => JSON.parse(String((c[1] as RequestInit).body)));
    expect(bodies[0]).toMatchObject({ p_status: "pendente", p_kind: "pagamento" });
    expect(bodies[1]).toMatchObject({ p_status: "falhou", p_kind: "assinatura_cancelada" });
  });
  it("assinatura criada a partir de plano: acha a empresa pelo plano", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockImplementation(async (u) => {
      const url = String(u);
      if (url.includes("/preapproval_plan/")) return new Response(JSON.stringify({ id: "pl1", external_reference: `${ORG}:essencial` }));
      if (url.includes("/preapproval/")) return new Response(JSON.stringify({ id: "p2", status: "cancelled", preapproval_plan_id: "pl1", external_reference: "" }));
      return new Response(JSON.stringify("ok"));
    });
    await call({ dataId: "p2", type: "subscription_preapproval", sig: sign("p2", "r1", "1700000000") });
    const rpc = f.mock.calls.find((c) => String(c[0]).includes("/rpc/"))!;
    expect(JSON.parse(String((rpc[1] as RequestInit).body))).toMatchObject({ p_org: ORG, p_kind: "assinatura_cancelada" });
  });
  it("cobrança recorrente aprovada (subscription_authorized_payment) confirma e acha a empresa pela assinatura/plano", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockImplementation(async (u) => {
      const url = String(u);
      if (url.includes("/authorized_payments/")) return new Response(JSON.stringify({ id: 77, preapproval_id: "p9", status: "processed", transaction_amount: 5, currency_id: "BRL", payment: { id: 5551, status: "approved" } }));
      if (url.includes("/preapproval_plan/")) return new Response(JSON.stringify({ external_reference: `${ORG}:essencial` }));
      if (url.includes("/preapproval/")) return new Response(JSON.stringify({ id: "p9", status: "authorized", preapproval_plan_id: "pl9", external_reference: "" }));
      return new Response(JSON.stringify("ok"));
    });
    await call({ dataId: "77", type: "subscription_authorized_payment", sig: sign("77", "r1", "1700000000") });
    const rpc = f.mock.calls.find((c) => String(c[0]).includes("/rpc/"))!;
    const b = JSON.parse(String((rpc[1] as RequestInit).body));
    expect(b).toMatchObject({ p_org: ORG, p_status: "confirmado", p_kind: "pagamento", p_amount: 5 });
    expect(b.p_raw.fb_plan).toBe("essencial");
  });
  it("502 se o Mercado Pago não responde (ele tenta de novo)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 500 }));
    expect((await call()).status).toBe(502);
  });
  it("ignora outros tópicos", async () => {
    const f = vi.spyOn(globalThis, "fetch");
    const r = await call({ type: "plan" });
    expect((await r.json()).ignored).toBe(true);
    expect(f).not.toHaveBeenCalled();
  });
});

describe("rota /api/assinar", () => {
  const env = { ...process.env };
  beforeEach(() => { Object.assign(process.env, { MP_ACCESS_TOKEN: "TEST-token", NEXT_PUBLIC_SUPABASE_URL: "https://db.test", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" }); });
  afterEach(() => { process.env = { ...env }; vi.restoreAllMocks(); vi.resetModules(); });
  const post = async (plan: unknown, jwt: string | null = "tok") => {
    const { POST } = await import("@/app/api/assinar/route");
    return POST(new Request("https://x.test/api/assinar", { method: "POST", headers: { "content-type": "application/json", ...(jwt ? { authorization: `Bearer ${jwt}` } : {}) }, body: JSON.stringify({ plan }) }));
  };
  const mock = (role: string, price: number | null) => vi.spyOn(globalThis, "fetch").mockImplementation(async (u) => {
    const url = String(u);
    if (url.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "u1", email: "a@b.com" }));
    if (url.includes("/rest/v1/members")) return new Response(JSON.stringify([{ org_id: ORG, role }]));
    if (url.includes("/rest/v1/plans")) return new Response(JSON.stringify([{ code: "premium", name: "Premium", price_month: price }]));
    if (url.includes("/preapproval")) return new Response(JSON.stringify({ init_point: "https://mp.test/pay" }));
    return new Response("{}", { status: 404 });
  });
  it("sem sessão 401; plano inválido 400", async () => {
    expect((await post("premium", null)).status).toBe(401);
    expect((await post("DROP TABLE")).status).toBe(400);
  });
  it("só proprietário/admin assina", async () => {
    mock("operacional", 100);
    expect((await post("premium")).status).toBe(403);
  });
  it("plano sem preço não cria cobrança", async () => {
    const f = mock("proprietario", null);
    expect((await post("premium")).status).toBe(400);
    expect(f.mock.calls.some((c) => String(c[0]).includes("api.mercadopago.com"))).toBe(false);
  });
  it("cria a assinatura com preço do banco e referência org:plano", async () => {
    const f = mock("proprietario", 149.9);
    const r = await post("premium");
    expect((await r.json()).url).toBe("https://mp.test/pay");
    const mp = f.mock.calls.find((c) => String(c[0]).includes("api.mercadopago.com/preapproval"))!;
    expect(String(mp[0])).toBe("https://api.mercadopago.com/preapproval_plan");
    const b = JSON.parse(String((mp[1] as RequestInit).body));
    expect(b.payer_email).toBeUndefined();
    expect(b.external_reference).toBe(`${ORG}:premium`);
    expect(b.auto_recurring.transaction_amount).toBe(149.9);
    expect(b.auto_recurring.currency_id).toBe("BRL");
  });
});

describe("rota /api/assinatura/mudar-plano", () => {
  const env = { ...process.env };
  beforeEach(() => { Object.assign(process.env, { MP_ACCESS_TOKEN: "TEST-token", PAYMENT_WEBHOOK_SECRET: "x".repeat(40), NEXT_PUBLIC_SUPABASE_URL: "https://db.test", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" }); });
  afterEach(() => { process.env = { ...env }; vi.restoreAllMocks(); vi.resetModules(); });
  const post = async (plan: unknown) => {
    const { POST } = await import("@/app/api/assinatura/mudar-plano/route");
    return POST(new Request("https://x.test/api/assinatura/mudar-plano", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer tok" }, body: JSON.stringify({ plan }) }));
  };
  const mock = (o: { role?: string; org?: object; mpOk?: boolean } = {}) => vi.spyOn(globalThis, "fetch").mockImplementation(async (u) => {
    const url = String(u);
    if (url.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "u1" }));
    if (url.includes("/rest/v1/members")) return new Response(JSON.stringify([{ org_id: ORG, role: o.role ?? "proprietario" }]));
    if (url.includes("/rest/v1/orgs")) return new Response(JSON.stringify([o.org ?? { status: "ativa", mp_preapproval_id: "abc123", plan: { code: "essencial" } }]));
    if (url.includes("/rest/v1/plans")) return new Response(JSON.stringify([{ code: "premium", name: "Premium", price_month: 15 }]));
    if (url.includes("/rpc/set_pending_plan")) return new Response('"ok"');
    if (url.includes("api.mercadopago.com/preapproval/")) return new Response("{}", { status: o.mpOk === false ? 400 : 200 });
    return new Response("{}", { status: 404 });
  });
  const rpcBodies = (f: ReturnType<typeof mock>) => f.mock.calls.filter((c) => String(c[0]).includes("set_pending_plan")).map((c) => JSON.parse(String((c[1] as RequestInit).body)));
  it("só proprietário/admin troca; precisa de assinatura ativa; não troca para o mesmo plano", async () => {
    mock({ role: "operacional" }); expect((await post("premium")).status).toBe(403);
    vi.restoreAllMocks(); mock({ org: { status: "ativa", mp_preapproval_id: null, plan: { code: "essencial" } } }); expect((await post("premium")).status).toBe(409);
    vi.restoreAllMocks(); mock({ org: { status: "ativa", mp_preapproval_id: "abc123", plan: { code: "premium" } } }); expect((await post("premium")).status).toBe(400);
  });
  it("marca o plano pendente e altera o valor da assinatura existente (preço do banco)", async () => {
    const f = mock();
    const r = await post("premium");
    expect(r.status).toBe(200);
    expect(rpcBodies(f)).toEqual([{ p_secret: "x".repeat(40), p_org: ORG, p_plan: "premium" }]);
    const mp = f.mock.calls.find((c) => String(c[0]).includes("api.mercadopago.com/preapproval/abc123"))!;
    expect((mp[1] as RequestInit).method).toBe("PUT");
    expect(JSON.parse(String((mp[1] as RequestInit).body)).auto_recurring).toEqual({ transaction_amount: 15, currency_id: "BRL" });
  });
  it("se o Mercado Pago recusa, o plano pendente é desfeito", async () => {
    const f = mock({ mpOk: false });
    expect((await post("premium")).status).toBe(502);
    expect(rpcBodies(f).map((b) => b.p_plan)).toEqual(["premium", null]);
  });
});
