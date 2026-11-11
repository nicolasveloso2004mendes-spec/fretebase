"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { dateBR, km, money, today } from "@/lib/format";
import { plannedCostWithoutTax } from "@/lib/fleet";
import type { Quote, QuoteStatus } from "@/lib/types";
import { Badge, Button, Card, ErrorBox, Field, Input, Loading, PageHeader, linkBtnGhost } from "@/components/ui";

type Q = Quote & { clients?: { name: string; phone: string | null } | null };

const tone = { rascunho: "neutral", enviada: "info", aprovada: "good", recusada: "bad" } as const;
const label = { rascunho: "Rascunho", enviada: "Enviada", aprovada: "Aprovada", recusada: "Recusada" } as const;
const company = process.env.NEXT_PUBLIC_COMPANY_NAME || "";

export default function CotacaoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [q, setQ] = useState<Q | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [follow, setFollow] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await getSupabase()!.from("quotes").select("*, clients(name, phone)").eq("id", id).single();
    if (error || !data) setError("Não encontramos essa cotação.");
    else {
      setQ(data as Q);
      setFollow((data as Q).follow_up_date ?? "");
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function setStatus(status: QuoteStatus) {
    if (!q) return;
    setBusy(true);
    const sb = getSupabase()!;
    const { error } = await sb.from("quotes").update({ status }).eq("id", q.id);
    if (!error && status === "aprovada") {
      const { data: existing } = await sb.from("trips").select("id").eq("quote_id", q.id).limit(1);
      if (!existing?.length) {
        const taxValue = Math.round(q.freight_value * (q.tax_pct / 100) * 100) / 100;
        await sb.from("trips").insert({
          quote_id: q.id,
          client_id: q.client_id,
          vehicle_id: q.vehicle_id,
          origin: q.origin,
          destination: q.destination,
          freight_value: q.freight_value,
          cost_total: q.cost_total,
          cargo: q.cargo,
          distance_km: q.distance_km,
          planned_cost: plannedCostWithoutTax(q.cost_total, taxValue), // o imposto fica só em tax_value (senão é descontado duas vezes)
          tax_value: taxValue,
        });
      }
    }
    if (error) setError("Não foi possível atualizar a cotação.");
    await load();
    setBusy(false);
    if (!error && status === "aprovada") router.push("/viagens");
  }

  async function saveFollow() {
    if (!q) return;
    await getSupabase()!.from("quotes").update({ follow_up_date: follow || null }).eq("id", q.id);
    await load();
  }

  async function del() {
    if (!q || !confirm("Excluir esta cotação?")) return;
    await getSupabase()!.from("quotes").delete().eq("id", q.id);
    router.push("/cotacoes");
  }

  if (error && !q) return <ErrorBox message={error} />;
  if (!q) return <Loading />;

  const text =
    `Olá${q.clients?.name ? `, ${q.clients.name}` : ""}! Segue a proposta de frete${company ? ` da ${company}` : ""}:\n` +
    `Rota: ${q.origin} → ${q.destination}${q.cargo ? `\nCarga: ${q.cargo}` : ""}\n` +
    `Valor: ${money(q.freight_value)}${q.terms ? `\nCondições: ${q.terms}` : ""}`;
  const phone = (q.clients?.phone ?? "").replace(/\D/g, "");
  const wa = `https://wa.me/${phone ? (phone.length <= 11 ? "55" + phone : phone) : ""}?text=${encodeURIComponent(text)}`;

  return (
    <>
      <PageHeader
        crumb="Cotações"
        title={`${q.origin} → ${q.destination}`}
        subtitle={`${q.clients?.name ?? "Sem cliente"} · criada em ${dateBR(q.created_at)}`}
        action={<Badge tone={tone[q.status]}>{label[q.status]}</Badge>}
      />
      {error && <div className="mb-4"><ErrorBox message={error} /></div>}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <article className="rounded-2xl border border-line bg-white p-6 sm:p-8" aria-label="Proposta para o cliente">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Proposta de frete</p>
          {company && <p className="mt-1 text-xl font-extrabold text-pine-950">{company}</p>}
          <dl className="mt-6 space-y-4">
            <div>
              <dt className="text-sm text-muted">Cliente</dt>
              <dd className="font-semibold">{q.clients?.name ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Rota</dt>
              <dd className="font-semibold">
                {q.origin} → {q.destination} ({km(q.distance_km)})
              </dd>
            </div>
            {q.cargo && (
              <div>
                <dt className="text-sm text-muted">Carga</dt>
                <dd className="font-semibold">{q.cargo}</dd>
              </div>
            )}
            <div>
              <dt className="text-sm text-muted">Valor do frete</dt>
              <dd className="tnum text-3xl font-extrabold text-pine-950">{money(q.freight_value)}</dd>
            </div>
            {q.terms && (
              <div>
                <dt className="text-sm text-muted">Prazo e condições</dt>
                <dd className="whitespace-pre-line font-semibold">{q.terms}</dd>
              </div>
            )}
          </dl>
          <p className="mt-8 text-xs text-muted">Emitida em {dateBR(today())}. Valores sujeitos a confirmação de coleta e entrega.</p>
        </article>

        <div className="no-print space-y-4">
          <Card>
            <h2 className="font-extrabold text-pine-950">Análise interna</h2>
            <dl className="tnum mt-3 space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Custo + impostos</dt><dd className="font-semibold">{money(q.cost_total)}</dd></div>
              <div className="flex justify-between">
                <dt className="text-muted">Sobra</dt>
                <dd className={`font-extrabold ${q.profit < 0 ? "text-danger" : "text-pine-950"}`}>{money(q.profit)}</dd>
              </div>
            </dl>
          </Card>

          <Card className="space-y-3">
            <a href={wa} target="_blank" rel="noopener noreferrer" className={`${linkBtnGhost} w-full`}>
              Enviar pelo WhatsApp
            </a>
            <Button variant="ghost" className="w-full" onClick={() => window.print()}>
              Imprimir ou salvar em PDF
            </Button>
            {q.status === "rascunho" && <Button className="w-full" disabled={busy} onClick={() => setStatus("enviada")}>Marcar como enviada</Button>}
            {(q.status === "rascunho" || q.status === "enviada") && (
              <>
                <Button className="w-full" disabled={busy} onClick={() => setStatus("aprovada")}>Cliente aprovou: criar viagem</Button>
                <Button variant="danger" className="w-full" disabled={busy} onClick={() => setStatus("recusada")}>Cliente recusou</Button>
              </>
            )}
            {q.status === "aprovada" && <Link href="/viagens" className={`${linkBtnGhost} w-full`}>Ver viagem</Link>}
          </Card>

          <Card>
            <Field label="Data para retornar ao cliente">
              <Input type="date" value={follow} onChange={(e) => setFollow(e.target.value)} />
            </Field>
            <Button variant="ghost" className="mt-3 w-full" onClick={saveFollow}>Salvar data</Button>
          </Card>

          <Button variant="danger" className="w-full" onClick={del}>Excluir cotação</Button>
        </div>
      </div>
    </>
  );
}
