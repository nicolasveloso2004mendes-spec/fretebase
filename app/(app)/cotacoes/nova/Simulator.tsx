"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTable } from "@/lib/useTable";
import { getSupabase } from "@/lib/supabase";
import { computeTrip, suggestedFreight } from "@/lib/calc";
import { km, money, pct, toNumber } from "@/lib/format";
import type { Client, Order, Vehicle } from "@/lib/types";
import { Button, Card, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";

type F = {
  clientId: string;
  vehicleId: string;
  origin: string;
  destination: string;
  distance: string;
  cargo: string;
  roundTrip: boolean;
  consumption: string;
  diesel: string;
  maintenance: string;
  tire: string;
  tolls: string;
  driver: string;
  other: string;
  tax: string;
  freight: string;
  margin: string;
  terms: string;
};

const blank: F = {
  clientId: "",
  vehicleId: "",
  origin: "",
  destination: "",
  distance: "",
  cargo: "",
  roundTrip: true,
  consumption: "",
  diesel: "",
  maintenance: "",
  tire: "",
  tolls: "",
  driver: "",
  other: "",
  tax: "",
  freight: "",
  margin: "20",
  terms: "",
};

export function Simulator() {
  const router = useRouter();
  const params = useSearchParams();
  const orderId = params.get("pedido");
  const clients = useTable<Client>("clients", { order: "name" });
  const vehicles = useTable<Vehicle>("vehicles", { order: "name" });
  const [f, setF] = useState<F>(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Preenche a partir de um pedido, quando vier de "Pedidos".
  useEffect(() => {
    if (!orderId) return;
    getSupabase()
      ?.from("orders")
      .select("*")
      .eq("id", orderId)
      .single()
      .then(({ data }) => {
        const o = data as Order | null;
        if (o)
          setF((p) => ({ ...p, clientId: o.client_id ?? "", origin: o.origin, destination: o.destination, cargo: o.cargo ?? "" }));
      });
  }, [orderId]);

  const set = (k: keyof F) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  function pickVehicle(id: string) {
    const v = vehicles.rows.find((x) => x.id === id);
    setF((p) => ({
      ...p,
      vehicleId: id,
      ...(v
        ? {
            consumption: String(v.consumption_km_l || ""),
            maintenance: String(v.maintenance_per_km || ""),
            tire: String(v.tire_per_km || ""),
          }
        : {}),
    }));
  }

  const r = useMemo(
    () =>
      computeTrip({
        distanceKm: toNumber(f.distance),
        roundTrip: f.roundTrip,
        consumptionKmL: toNumber(f.consumption),
        dieselPrice: toNumber(f.diesel),
        maintenancePerKm: toNumber(f.maintenance),
        tirePerKm: toNumber(f.tire),
        tolls: toNumber(f.tolls),
        driver: toNumber(f.driver),
        other: toNumber(f.other),
        taxPct: toNumber(f.tax),
        freight: toNumber(f.freight),
      }),
    [f],
  );

  const suggestion = suggestedFreight(r.cost, toNumber(f.tax), toNumber(f.margin));
  const hasFreight = toNumber(f.freight) > 0;
  const ready = f.origin.trim() && f.destination.trim() && toNumber(f.distance) > 0 && hasFreight;

  async function save() {
    setBusy(true);
    setError(null);
    const sb = getSupabase()!;
    const { data, error: err } = await sb
      .from("quotes")
      .insert({
        client_id: f.clientId || null,
        order_id: orderId || null,
        vehicle_id: f.vehicleId || null,
        origin: f.origin.trim(),
        destination: f.destination.trim(),
        distance_km: toNumber(f.distance),
        round_trip: f.roundTrip,
        cargo: f.cargo.trim() || null,
        consumption_km_l: toNumber(f.consumption),
        diesel_price: toNumber(f.diesel),
        maintenance_per_km: toNumber(f.maintenance),
        tire_per_km: toNumber(f.tire),
        tolls: toNumber(f.tolls),
        driver_cost: toNumber(f.driver),
        other_cost: toNumber(f.other),
        tax_pct: toNumber(f.tax),
        freight_value: toNumber(f.freight),
        cost_total: r.cost + r.tax,
        profit: r.profit,
        terms: f.terms.trim() || null,
      })
      .select("id")
      .single();
    if (err || !data) {
      setError("Não foi possível salvar a cotação. Tente de novo.");
      setBusy(false);
      return;
    }
    if (orderId) await sb.from("orders").update({ status: "cotado" }).eq("id", orderId);
    router.push(`/cotacoes/${data.id}`);
  }

  const profitTone = r.profit < 0 ? "text-danger" : "text-pine-950";

  return (
    <>
      <PageHeader crumb="Cotações" title="Nova cotação" subtitle="Calcule o custo da viagem, veja quanto sobra e prepare a proposta." />

      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <form onSubmit={(e) => e.preventDefault()} className="space-y-6">
          <Card>
            <h2 className="mb-4 text-lg font-extrabold text-pine-950">Rota da viagem</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Origem">
                <Input value={f.origin} onChange={set("origin")} placeholder="Cidade, UF" />
              </Field>
              <Field label="Destino">
                <Input value={f.destination} onChange={set("destination")} placeholder="Cidade, UF" />
              </Field>
              <Field label="Distância de ida (km)">
                <Input inputMode="decimal" value={f.distance} onChange={set("distance")} />
              </Field>
              <Field label="Carga">
                <Input value={f.cargo} onChange={set("cargo")} placeholder="Ex.: 12 paletes de bebidas" />
              </Field>
            </div>
            <label className="mt-4 flex min-h-11 items-center gap-3 text-sm font-semibold text-pine-900">
              <input
                type="checkbox"
                checked={f.roundTrip}
                onChange={(e) => setF((p) => ({ ...p, roundTrip: e.target.checked }))}
                className="h-5 w-5 accent-pine-800"
              />
              Incluir retorno vazio pela mesma distância
            </label>
          </Card>

          <Card>
            <h2 className="mb-4 text-lg font-extrabold text-pine-950">Veículo e custos</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="Veículo" hint={vehicles.rows.length ? "Escolher um veículo preenche consumo, manutenção e pneus." : "Cadastre veículos em Veículos para preencher isso sozinho."}>
                  <Select value={f.vehicleId} onChange={(e) => pickVehicle(e.target.value)}>
                    <option value="">Preencher manualmente</option>
                    {vehicles.rows.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} {v.plate ? `(${v.plate})` : ""}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Field label="Consumo (km/l)">
                <Input inputMode="decimal" value={f.consumption} onChange={set("consumption")} />
              </Field>
              <Field label="Diesel (R$/l)">
                <Input inputMode="decimal" value={f.diesel} onChange={set("diesel")} />
              </Field>
              <Field label="Manutenção (R$/km)">
                <Input inputMode="decimal" value={f.maintenance} onChange={set("maintenance")} />
              </Field>
              <Field label="Pneus (R$/km)">
                <Input inputMode="decimal" value={f.tire} onChange={set("tire")} />
              </Field>
              <Field label="Pedágios da viagem (R$)">
                <Input inputMode="decimal" value={f.tolls} onChange={set("tolls")} />
              </Field>
              <Field label="Motorista (R$)" hint="Diária, comissão ou salário rateado da viagem.">
                <Input inputMode="decimal" value={f.driver} onChange={set("driver")} />
              </Field>
              <Field label="Outras despesas (R$)">
                <Input inputMode="decimal" value={f.other} onChange={set("other")} />
              </Field>
              <Field label="Impostos sobre o frete (%)" hint="Confirme a alíquota com seu contador.">
                <Input inputMode="decimal" value={f.tax} onChange={set("tax")} />
              </Field>
            </div>
          </Card>

          <Card>
            <h2 className="mb-4 text-lg font-extrabold text-pine-950">Dados da proposta</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Cliente">
                <Select value={f.clientId} onChange={set("clientId")}>
                  <option value="">Sem cliente cadastrado</option>
                  {clients.rows.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Valor do frete (R$)">
                <Input inputMode="decimal" value={f.freight} onChange={set("freight")} />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Prazo e condições">
                  <Textarea value={f.terms} onChange={set("terms")} placeholder="Ex.: entrega em até 2 dias úteis; pagamento em 28 dias." />
                </Field>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap items-end gap-4 rounded-xl bg-paper p-4">
              <div className="w-40">
                <Field label="Margem desejada (%)">
                  <Input inputMode="decimal" value={f.margin} onChange={set("margin")} />
                </Field>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-muted">Frete sugerido para essa margem</p>
                <p className="tnum text-xl font-extrabold text-pine-950">{suggestion > 0 ? money(suggestion) : "—"}</p>
              </div>
              <Button
                variant="ghost"
                disabled={suggestion <= 0}
                onClick={() => setF((p) => ({ ...p, freight: String(Math.ceil(suggestion)) }))}
              >
                Usar este valor
              </Button>
            </div>
          </Card>
        </form>

        <aside className="xl:sticky xl:top-8 xl:self-start">
          <Card>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">Sobra estimada</p>
            <p aria-live="polite" className={`tnum mt-1 text-4xl font-extrabold ${profitTone}`}>
              {money(r.profit)}
            </p>
            <p className="mt-1 text-sm text-muted">
              {hasFreight ? `Margem de ${pct(r.marginPct)} depois dos custos e impostos informados.` : "Informe o valor do frete para ver a sobra."}
            </p>
            {hasFreight && r.profit < 0 && (
              <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm font-semibold text-danger">
                Esse frete não cobre o custo da viagem.
              </p>
            )}
            <dl className="tnum mt-5 space-y-2.5 border-t border-line pt-5 text-sm">
              {[
                ["Distância total", km(r.totalKm)],
                ["Diesel", money(r.diesel)],
                ["Manutenção", money(r.maintenance)],
                ["Pneus", money(r.tires)],
                ["Pedágios", money(r.tolls)],
                ["Motorista", money(r.driver)],
                ["Outras despesas", money(r.other)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-muted">{k}</dt>
                  <dd className="font-semibold">{v}</dd>
                </div>
              ))}
              <div className="flex justify-between gap-3 border-t border-line pt-2.5">
                <dt className="font-bold">Custo da viagem</dt>
                <dd className="font-extrabold">{money(r.cost)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Impostos</dt>
                <dd className="font-semibold">{money(r.tax)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Valor do frete</dt>
                <dd className="font-semibold">{money(toNumber(f.freight))}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Custo por km</dt>
                <dd className="font-semibold">{money(r.costPerKm)}</dd>
              </div>
            </dl>
            {error && <p role="alert" className="mt-4 text-sm font-semibold text-danger">{error}</p>}
            <Button className="mt-5 w-full" disabled={!ready || busy} onClick={save}>
              {busy ? "Salvando…" : "Salvar e revisar proposta →"}
            </Button>
            {!ready && <p className="mt-2 text-xs text-muted">Preencha origem, destino, distância e valor do frete.</p>}
          </Card>
        </aside>
      </div>
    </>
  );
}
