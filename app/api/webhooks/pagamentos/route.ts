import { NextResponse } from "next/server";
import { parsePaymentEvent, rateLimiter, verifySignature } from "@/lib/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 64 * 1024;
const allow = rateLimiter(60, 60_000);

/**
 * Webhook de pagamentos. Só processa com assinatura HMAC válida.
 * Sem PAYMENT_WEBHOOK_SECRET configurado responde 503 e não faz nada. Não usa service_role: grava pela função
 * ingest_payment_event do banco, que confere o segredo (hash) e é idempotente.
 * Idempotente: o mesmo evento (provedor + id) é gravado uma única vez.
 */
export async function POST(req: Request) {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!secret || !url || !anon) return NextResponse.json({ error: "webhook não configurado" }, { status: 503 });

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
  const r = await fetch(`${url}/rest/v1/rpc/ingest_payment_event`, {
    method: "POST",
    headers: { apikey: anon, Authorization: `Bearer ${anon}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_secret: secret, p_provider: provider, p_event_id: ev.eventId, p_org: ev.orgId, p_kind: ev.kind, p_status: ev.status, p_amount: ev.amount, p_at: ev.occurredAt, p_raw: body }),
  });
  if (!r.ok) return NextResponse.json({ error: "falha ao registrar" }, { status: r.status === 400 ? 400 : 500 });
  const result = await r.json();
  return NextResponse.json({ ok: true, duplicate: result === "duplicate" });
}
