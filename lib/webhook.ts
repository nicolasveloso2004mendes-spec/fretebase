import { createHmac, timingSafeEqual } from "node:crypto";

/** Confere a assinatura HMAC-SHA256 (hex) do corpo bruto do webhook. Comparação em tempo constante. */
export function verifySignature(rawBody: string, signature: string | null | undefined, secret: string | null | undefined) {
  if (!secret || secret.length < 16 || !signature) return false;
  const sig = signature.trim().toLowerCase().replace(/^sha256=/, "");
  if (!/^[0-9a-f]{64}$/.test(sig)) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest();
  const given = Buffer.from(sig, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export type PaymentEvent = { eventId: string; orgId: string | null; kind: string; status: string; amount: number | null; occurredAt: string | null };

/** Formato neutro, adaptado ao provedor quando ele for escolhido. Recusa o que não estiver completo. */
export function parsePaymentEvent(body: unknown): PaymentEvent | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const s = (v: unknown, max = 120) => (typeof v === "string" && v.length > 0 && v.length <= max ? v : null);
  const eventId = s(b.id), kind = s(b.type, 60), status = s(b.status, 40);
  if (!eventId || !kind || !status) return null;
  const org = s(b.org_id, 36);
  const amount = typeof b.amount === "number" && Number.isFinite(b.amount) && b.amount >= 0 ? b.amount : null;
  const at = s(b.occurred_at, 40);
  return {
    eventId, kind, status, amount,
    orgId: org && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(org) ? org : null,
    occurredAt: at && !Number.isNaN(Date.parse(at)) ? new Date(at).toISOString() : null,
  };
}

/** Limitador simples em memória (por instância). Em produção com várias instâncias, usar o firewall da Vercel. */
export function rateLimiter(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return (key: string, now = Date.now()) => {
    const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (list.length >= max) { hits.set(key, list); return false; }
    list.push(now);
    hits.set(key, list);
    return true;
  };
}
