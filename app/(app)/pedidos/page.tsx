"use client";
import Link from "next/link";
import { useState } from "react";
import { useTable } from "@/lib/useTable";
import { dateBR, toNumber } from "@/lib/format";
import type { Client, Order, OrderStatus } from "@/lib/types";
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Loading, PageHeader, Select, Textarea, linkBtn } from "@/components/ui";

const blank = { clientId: "", origin: "", destination: "", cargo: "", weight: "", date: "", notes: "" };
const tone: Record<OrderStatus, "info" | "good" | "bad"> = { novo: "info", cotado: "good", cancelado: "bad" };
const label: Record<OrderStatus, string> = { novo: "Novo", cotado: "Cotado", cancelado: "Cancelado" };

export default function PedidosPage() {
  const orders = useTable<Order>("orders", { select: "*, clients(name)" });
  const clients = useTable<Client>("clients", { order: "name" });
  const [form, setForm] = useState(blank);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      await orders.insert({
        client_id: form.clientId || null,
        origin: form.origin.trim(),
        destination: form.destination.trim(),
        cargo: form.cargo.trim() || null,
        weight_kg: form.weight ? toNumber(form.weight) : null,
        desired_date: form.date || null,
        notes: form.notes.trim() || null,
      });
      setForm(blank);
      setOpen(false);
    } catch {
      setFormError("Não foi possível salvar. Tente de novo.");
    }
    setBusy(false);
  }

  return (
    <>
      <PageHeader
        crumb="Pedidos"
        title="Pedidos de frete"
        subtitle="Receba as solicitações dos clientes e prepare uma cotação."
        action={!open && <Button onClick={() => setOpen(true)}>Novo pedido</Button>}
      />

      {open && (
        <Card className="mb-6">
          <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
            <h2 className="text-lg font-extrabold text-pine-950 sm:col-span-2">Novo pedido</h2>
            <Field label="Cliente">
              <Select value={form.clientId} onChange={set("clientId")}>
                <option value="">Sem cliente cadastrado</option>
                {clients.rows.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Data desejada">
              <Input type="date" value={form.date} onChange={set("date")} />
            </Field>
            <Field label="Origem">
              <Input required value={form.origin} onChange={set("origin")} placeholder="Cidade, UF" />
            </Field>
            <Field label="Destino">
              <Input required value={form.destination} onChange={set("destination")} placeholder="Cidade, UF" />
            </Field>
            <Field label="Carga">
              <Input value={form.cargo} onChange={set("cargo")} />
            </Field>
            <Field label="Peso (kg)">
              <Input inputMode="decimal" value={form.weight} onChange={set("weight")} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Observações">
                <Textarea value={form.notes} onChange={set("notes")} />
              </Field>
            </div>
            {formError && <p role="alert" className="text-sm font-semibold text-danger sm:col-span-2">{formError}</p>}
            <div className="flex gap-3 sm:col-span-2">
              <Button type="submit" disabled={busy}>{busy ? "Salvando…" : "Salvar pedido"}</Button>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            </div>
          </form>
        </Card>
      )}

      {orders.loading ? (
        <Loading />
      ) : orders.error ? (
        <ErrorBox message={orders.error} onRetry={orders.reload} />
      ) : orders.rows.length === 0 ? (
        <Empty title="Nenhum pedido ainda" text="Registre aqui o que o cliente pediu e transforme em cotação com um clique." />
      ) : (
        <ul className="space-y-3">
          {orders.rows.map((o) => (
            <li key={o.id} className="grid gap-3 rounded-2xl border border-line bg-white p-5 sm:grid-cols-[1fr_auto] sm:items-center">
              <div className="min-w-0">
                <p className="truncate text-lg font-bold text-pine-950">{o.origin} → {o.destination}</p>
                <p className="mt-1 text-sm text-muted">
                  {o.clients?.name ?? "Sem cliente"}
                  {o.cargo && ` · ${o.cargo}`}
                  {o.weight_kg ? ` · ${o.weight_kg} kg` : ""}
                  {o.desired_date && ` · para ${dateBR(o.desired_date)}`}
                </p>
                {o.notes && <p className="mt-1 text-sm text-muted">{o.notes}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={tone[o.status]}>{label[o.status]}</Badge>
                {o.status === "novo" && (
                  <>
                    <Link href={`/cotacoes/nova?pedido=${o.id}`} className={linkBtn}>Cotar</Link>
                    <Button variant="ghost" onClick={() => orders.update(o.id, { status: "cancelado" })}>Cancelar</Button>
                  </>
                )}
                <Button
                  variant="danger"
                  onClick={async () => {
                    if (confirm("Excluir este pedido?")) await orders.remove(o.id);
                  }}
                >
                  Excluir
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
