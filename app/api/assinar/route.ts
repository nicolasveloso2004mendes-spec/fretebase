import { NextResponse } from "next/server";
import { rateLimiter } from "@/lib/webhook";
import { buildReference, isPlanCode } from "@/lib/mercadopago";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const allow = rateLimiter(10, 60_000);

/**
 * Cria a assinatura recorrente no Mercado Pago para a empresa do usuário logado e devolve o link de pagamento.
 * Só proprietário/admin. O preço vem sempre do banco (nunca do navegador).
 */
export async function POST(req: Request) {
  const token = process.env.MP_ACCESS_TOKEN;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !anon) return NextResponse.json({ error: "Cobrança ainda não configurada." }, { status: 503 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!allow(ip)) return NextResponse.json({ error: "Muitas tentativas. Aguarde um minuto." }, { status: 429 });

  const jwt = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!jwt) return NextResponse.json({ error: "Sessão necessária." }, { status: 401 });
  let plan: unknown;
  try { plan = ((await req.json()) as { plan?: unknown }).plan; } catch { return NextResponse.json({ error: "Pedido inválido." }, { status: 400 }); }
  if (!isPlanCode(plan)) return NextResponse.json({ error: "Plano inválido." }, { status: 400 });

  const h = { apikey: anon, Authorization: `Bearer ${jwt}` };
  const u = await fetch(`${url}/auth/v1/user`, { headers: h });
  if (!u.ok) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  const user = (await u.json()) as { id: string; email: string };

  const m = await fetch(`${url}/rest/v1/members?select=org_id,role&user_id=eq.${user.id}`, { headers: h });
  const member = ((await m.json()) as { org_id: string; role: string }[])?.[0];
  if (!member || !["proprietario", "admin"].includes(member.role)) return NextResponse.json({ error: "Somente o proprietário ou administrador pode assinar." }, { status: 403 });

  const p = await fetch(`${url}/rest/v1/plans?select=code,name,price_month&code=eq.${plan}&active=eq.true`, { headers: h });
  const pl = ((await p.json()) as { code: string; name: string; price_month: number | null }[])?.[0];
  if (!pl || !pl.price_month || pl.price_month <= 0) return NextResponse.json({ error: "Este plano ainda não tem preço definido." }, { status: 400 });

  const base = process.env.APP_URL ?? "https://fretebase-nicotech.vercel.app";
  const r = await fetch("https://api.mercadopago.com/preapproval", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      reason: `Fretebase — plano ${pl.name}`,
      external_reference: buildReference(member.org_id, pl.code),
      payer_email: user.email,
      back_url: `${base}/`,
      status: "pending",
      auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: Number(pl.price_month), currency_id: "BRL" },
    }),
  });
  const d = (await r.json().catch(() => ({}))) as { init_point?: string };
  if (!r.ok || !d.init_point) return NextResponse.json({ error: "O Mercado Pago não criou a assinatura. Tente de novo." }, { status: 502 });
  return NextResponse.json({ url: d.init_point });
}
