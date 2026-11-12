import { NextResponse } from "next/server";
import { rateLimiter } from "@/lib/webhook";
import { isPlanCode } from "@/lib/mercadopago";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const allow = rateLimiter(10, 60_000);

/**
 * Troca o plano da empresa alterando o valor da assinatura que já existe no Mercado Pago.
 * O novo valor vale na PRÓXIMA cobrança; o plano só muda quando essa cobrança for aprovada (webhook).
 * Só proprietário/admin. O preço vem sempre do banco.
 */
export async function POST(req: Request) {
  const token = process.env.MP_ACCESS_TOKEN, dbSecret = process.env.PAYMENT_WEBHOOK_SECRET;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !dbSecret || !url || !anon) return NextResponse.json({ error: "Cobrança ainda não configurada." }, { status: 503 });

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
  const user = (await u.json()) as { id: string };

  const m = await fetch(`${url}/rest/v1/members?select=org_id,role&user_id=eq.${user.id}`, { headers: h });
  const member = ((await m.json()) as { org_id: string; role: string }[])?.[0];
  if (!member || !["proprietario", "admin"].includes(member.role)) return NextResponse.json({ error: "Somente o proprietário ou administrador pode mudar o plano." }, { status: 403 });

  const o = await fetch(`${url}/rest/v1/orgs?select=status,mp_preapproval_id,plan:plans(code)&id=eq.${member.org_id}`, { headers: h });
  const org = ((await o.json()) as { status: string; mp_preapproval_id: string | null; plan: { code: string } | null }[])?.[0];
  if (!org || org.status !== "ativa" || !org.mp_preapproval_id || !/^[A-Za-z0-9_-]{1,64}$/.test(org.mp_preapproval_id))
    return NextResponse.json({ error: "Sua empresa ainda não tem uma assinatura ativa para trocar. Assine um plano primeiro." }, { status: 409 });
  if (org.plan?.code === plan) return NextResponse.json({ error: "Este já é o seu plano." }, { status: 400 });

  const p = await fetch(`${url}/rest/v1/plans?select=code,name,price_month&code=eq.${plan}&active=eq.true`, { headers: h });
  const pl = ((await p.json()) as { code: string; name: string; price_month: number | null }[])?.[0];
  if (!pl || !pl.price_month || pl.price_month <= 0) return NextResponse.json({ error: "Este plano ainda não tem preço definido." }, { status: 400 });

  const rpc = (plan_: string | null) => fetch(`${url}/rest/v1/rpc/set_pending_plan`, {
    method: "POST", headers: { apikey: anon, Authorization: `Bearer ${anon}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_secret: dbSecret, p_org: member.org_id, p_plan: plan_ }),
  });

  // 1) marca o plano pendente; 2) altera o valor no Mercado Pago; se o Mercado Pago recusar, desfaz o pendente.
  const r1 = await rpc(pl.code);
  if (!r1.ok) { console.error("troca de plano: não marcou o plano pendente", r1.status); return NextResponse.json({ error: "Não foi possível registrar a troca. Tente de novo." }, { status: 500 }); }

  const r = await fetch(`https://api.mercadopago.com/preapproval/${org.mp_preapproval_id}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ auto_recurring: { transaction_amount: Number(pl.price_month), currency_id: "BRL" } }),
  });
  const d = (await r.json().catch(() => ({}))) as { message?: string; error?: string; cause?: unknown };
  if (!r.ok) {
    console.error("mercadopago troca de valor falhou", r.status, JSON.stringify({ message: d.message, error: d.error, cause: d.cause }).slice(0, 500));
    await rpc(null).catch(() => undefined);
    return NextResponse.json({ error: "O Mercado Pago não aceitou a troca de plano. Nada foi alterado." }, { status: 502 });
  }
  return NextResponse.json({ ok: true, plan: pl.code, message: `Troca para ${pl.name} registrada. O novo valor vale na próxima cobrança e o plano muda quando ela for aprovada.` });
}
