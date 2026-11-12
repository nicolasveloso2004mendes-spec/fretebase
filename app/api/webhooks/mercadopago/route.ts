import { NextResponse } from "next/server";
import { rateLimiter } from "@/lib/webhook";
import { mapPaymentStatus, parseReference, verifyMpSignature, type Status } from "@/lib/mercadopago";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allow = rateLimiter(120, 60_000);
const MP = "https://api.mercadopago.com";

async function mpGet(path: string, token: string) {
  const r = await fetch(`${MP}${path}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!r.ok) throw new Error(`mp ${r.status}`);
  return (await r.json()) as Record<string, unknown>;
}

/** external_reference da assinatura; se vazio (assinatura criada a partir de plano), vem do plano que nós criamos. */
async function subscriptionRef(s: Record<string, unknown>, token: string): Promise<unknown> {
  if (parseReference(s.external_reference)) return s.external_reference;
  const planId = typeof s.preapproval_plan_id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(s.preapproval_plan_id) ? s.preapproval_plan_id : null;
  if (!planId) return s.external_reference;
  const pl = await mpGet(`/preapproval_plan/${encodeURIComponent(planId)}`, token);
  return pl.external_reference;
}

/**
 * Webhook do Mercado Pago. Só age com assinatura válida (MP_WEBHOOK_SECRET). Nunca confia no corpo recebido:
 * busca o pagamento/assinatura na API do Mercado Pago (MP_ACCESS_TOKEN) e grava pelo banco (ingest_payment_event,
 * idempotente, sem service_role). Sem as variáveis configuradas responde 503 e não faz nada.
 */
export async function POST(req: Request) {
  const mpSecret = process.env.MP_WEBHOOK_SECRET, token = process.env.MP_ACCESS_TOKEN;
  const dbSecret = process.env.PAYMENT_WEBHOOK_SECRET;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!mpSecret || !token || !dbSecret || !url || !anon) return NextResponse.json({ error: "não configurado" }, { status: 503 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!allow(ip)) return NextResponse.json({ error: "limite excedido" }, { status: 429 });

  const q = new URL(req.url).searchParams;
  const raw = await req.text();
  if (raw.length > 64 * 1024) return NextResponse.json({ error: "corpo grande demais" }, { status: 413 });
  let body: Record<string, unknown> = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const bodyData = (body.data as { id?: unknown } | undefined)?.id;
  const dataId = q.get("data.id") ?? (bodyData != null ? String(bodyData) : null);
  if (!verifyMpSignature({ xSignature: req.headers.get("x-signature"), xRequestId: req.headers.get("x-request-id"), dataId, secret: mpSecret }))
    { console.warn("mp webhook: assinatura inválida", { dataId, hasSig: !!req.headers.get("x-signature"), hasReqId: !!req.headers.get("x-request-id") }); return NextResponse.json({ error: "assinatura inválida" }, { status: 401 }); }

  const topic = String(q.get("type") ?? q.get("topic") ?? body.type ?? "");
  console.info("mp webhook recebido", { topic, dataId });
  if (!dataId || !/^[A-Za-z0-9_-]{1,64}$/.test(dataId)) return NextResponse.json({ ok: true, ignored: true });

  let ev: { kind: string; status: Status; amount: number | null; at: string | null; ref: unknown; raw: Record<string, unknown> } | null = null;
  try {
    if (topic === "payment") {
      const p = await mpGet(`/v1/payments/${encodeURIComponent(dataId)}`, token);
      if (p.currency_id && p.currency_id !== "BRL") return NextResponse.json({ ok: true, ignored: true });
      let pref: unknown = p.external_reference;
      const pre = (p.metadata as { preapproval_id?: unknown } | undefined)?.preapproval_id;
      if (!parseReference(pref) && typeof pre === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(pre)) pref = await subscriptionRef(await mpGet(`/preapproval/${encodeURIComponent(pre)}`, token), token);
      ev = { kind: "pagamento", status: mapPaymentStatus(p.status), amount: typeof p.transaction_amount === "number" ? p.transaction_amount : null,
             at: (p.date_approved ?? p.date_created ?? null) as string | null, ref: pref, raw: { id: p.id, status: p.status, status_detail: p.status_detail, transaction_amount: p.transaction_amount, preapproval_id: typeof pre === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(pre) ? pre : null } };
    } else if (topic === "subscription_authorized_payment") {
      // Cobrança recorrente de uma assinatura: o pagamento dela está dentro de "payment"; a empresa vem da assinatura (preapproval_id).
      const a = await mpGet(`/authorized_payments/${encodeURIComponent(dataId)}`, token);
      if (a.currency_id && a.currency_id !== "BRL") return NextResponse.json({ ok: true, ignored: true });
      const pay = a.payment as { id?: unknown; status?: unknown } | undefined;
      const pst = String(pay?.status ?? a.status ?? "");
      const pre = typeof a.preapproval_id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(a.preapproval_id) ? a.preapproval_id : null;
      const aref = pre ? await subscriptionRef(await mpGet(`/preapproval/${encodeURIComponent(pre)}`, token), token) : null;
      const status: Status = a.status === "cancelled" ? "falhou" : mapPaymentStatus(pst);
      const when = (a.debit_date ?? a.date_created ?? null) as string | null;
      ev = { kind: "pagamento", status, amount: typeof a.transaction_amount === "number" ? a.transaction_amount : null, at: when, ref: aref,
             raw: { id: a.id, status: pst, preapproval_id: pre, payment_id: pay?.id ?? null } };
    } else if (topic === "subscription_preapproval") {
      const s = await mpGet(`/preapproval/${encodeURIComponent(dataId)}`, token);
      const st = String(s.status ?? "");
      const sref = await subscriptionRef(s, token);
      ev = st === "cancelled" ? { kind: "assinatura_cancelada", status: "falhou", amount: null, at: null, ref: sref, raw: { id: s.id, status: st } }
         : st === "paused" ? { kind: "assinatura_pausada", status: "falhou", amount: null, at: null, ref: sref, raw: { id: s.id, status: st } }
         : { kind: "assinatura", status: "pendente", amount: null, at: null, ref: sref, raw: { id: s.id, status: st } };
    } else {
      console.info("mp webhook: tópico ignorado", topic);
      return NextResponse.json({ ok: true, ignored: true });
    }
  } catch (e) {
    console.error("mp webhook: falha ao consultar o Mercado Pago", topic, dataId, e instanceof Error ? e.message : "");
    return NextResponse.json({ error: "falha ao consultar o Mercado Pago" }, { status: 502 }); // o MP tenta de novo
  }

  const ref = parseReference(ev.ref);
  const r = await fetch(`${url}/rest/v1/rpc/ingest_payment_event`, {
    method: "POST",
    headers: { apikey: anon, Authorization: `Bearer ${anon}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_secret: dbSecret, p_provider: "mercadopago", p_event_id: `${topic}:${dataId}:${String(ev.raw.status ?? ev.status)}`, p_org: ref?.orgId ?? null,
      p_kind: ev.kind, p_status: ev.status, p_amount: ev.amount, p_at: ev.at && !Number.isNaN(Date.parse(ev.at)) ? new Date(ev.at).toISOString() : null,
      p_raw: { ...ev.raw, fb_plan: ref?.plan ?? null } }),
  });
  if (!r.ok) return NextResponse.json({ error: "falha ao registrar" }, { status: 500 });
  const result = await r.json();
  return NextResponse.json({ ok: true, duplicate: result === "duplicate" });
}
