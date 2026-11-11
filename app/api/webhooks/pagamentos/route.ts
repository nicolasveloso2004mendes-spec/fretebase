import { NextResponse } from "next/server";
import { parsePaymentEvent, rateLimiter, verifySignature } from "@/lib/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 64 * 1024;
const allow = rateLimiter(60, 60_000);

/**
 * Webhook de pagamentos. Só processa com assinatura HMAC válida.
 * Sem PAYMENT_WEBHOOK_SECRET / SUPABASE_SERVICE_ROLE_KEY configurados responde 503 e não faz nada.
 * Idempotente: o mesmo evento (provedor + id) é gravado uma única vez.
 */
export async function POST(req: Request) {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || !url || !service) return NextResponse.json({ error: "webhook não configurado" }, { status: 503 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!allow(ip)) return NextResponse.json({ error: "limite excedido" }, { status: 429 });

  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES) return NextResponse.json({ error: "corpo grande demais" }, { status: 413 });
  const raw = await req.text();
  if (raw.length > MAX_BYTES) return NextResponse.json({ error: "corpo grande demais" }, { status: 413 });

  if (!verifySignature(raw, req.headers.get("x-signature"), secret)) return NextResponse.json({ error: "assinatura inválida" }, { status: 401 });

  let body: unknown;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }
  const ev = parsePaymentEvent(body);
  if (!ev) return NextResponse.json({ error: "evento inválido" }, { status: 400 });

  const provider = (req.headers.get("x-provider") ?? "generico").slice(0, 40);
  const headers = { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" };

  const ins = await fetch(`${url}/rest/v1/subscription_payments?on_conflict=provider,event_id`, {
    method: "POST",
    headers: { ...headers, Prefer: "resolution=ignore-duplicates,return=representation" },
    body: JSON.stringify({ provider, event_id: ev.eventId, org_id: ev.orgId, kind: ev.kind, status: ev.status, amount: ev.amount, occurred_at: ev.occurredAt }),
  });
  if (!ins.ok) return NextResponse.json({ error: "falha ao registrar" }, { status: 500 });
  const created = (await ins.json()) as unknown[];
  if (created.length === 0) return NextResponse.json({ ok: true, duplicate: true });

  // Ativa a empresa somente em pagamento confirmado e verificado.
  if (ev.orgId && ev.status === "confirmado") {
    await fetch(`${url}/rest/v1/orgs?id=eq.${ev.orgId}`, { method: "PATCH", headers, body: JSON.stringify({ status: "ativa" }) });
  }
  return NextResponse.json({ ok: true });
}
