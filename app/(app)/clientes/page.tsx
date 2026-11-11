"use client";
import { useState } from "react";
import { useTable } from "@/lib/useTable";
import type { Client } from "@/lib/types";
import { Button, Card, Empty, ErrorBox, Field, Input, Loading, PageHeader, Textarea } from "@/components/ui";

const blank = { name: "", contact: "", phone: "", email: "", payment_terms: "", notes: "" };

export default function ClientesPage() {
  const { rows, loading, error, reload, insert, update, remove } = useTable<Client>("clients", { order: "name" });
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      const values = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim() || null]));
      if (editing) await update(editing, values);
      else await insert(values);
      setForm(blank);
      setEditing(null);
      setOpen(false);
    } catch {
      setFormError("Não foi possível salvar. Tente de novo.");
    }
    setBusy(false);
  }

  function edit(c: Client) {
    setForm({
      name: c.name,
      contact: c.contact ?? "",
      phone: c.phone ?? "",
      email: c.email ?? "",
      payment_terms: c.payment_terms ?? "",
      notes: c.notes ?? "",
    });
    setEditing(c.id);
    setOpen(true);
  }

  async function del(c: Client) {
    if (!confirm(`Excluir o cliente "${c.name}"? As cotações e viagens dele continuam, sem o vínculo.`)) return;
    try {
      await remove(c.id);
    } catch {
      alert("Não foi possível excluir.");
    }
  }

  return (
    <>
      <PageHeader
        crumb="Clientes"
        title="Clientes"
        subtitle="Contatos, condições comerciais e histórico de fretes."
        action={
          !open && (
            <Button
              onClick={() => {
                setForm(blank);
                setEditing(null);
                setOpen(true);
              }}
            >
              Novo cliente
            </Button>
          )
        }
      />

      {open && (
        <Card className="mb-6">
          <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
            <h2 className="text-lg font-extrabold text-pine-950 sm:col-span-2">{editing ? "Editar cliente" : "Novo cliente"}</h2>
            <Field label="Nome ou empresa">
              <Input required maxLength={160} value={form.name} onChange={set("name")} />
            </Field>
            <Field label="Pessoa de contato">
              <Input value={form.contact} onChange={set("contact")} />
            </Field>
            <Field label="WhatsApp / telefone">
              <Input inputMode="tel" value={form.phone} onChange={set("phone")} />
            </Field>
            <Field label="E-mail">
              <Input type="email" value={form.email} onChange={set("email")} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Condições de pagamento" hint="Ex.: 50% na coleta e 50% na entrega, ou 28 dias.">
                <Input value={form.payment_terms} onChange={set("payment_terms")} />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Observações">
                <Textarea value={form.notes} onChange={set("notes")} />
              </Field>
            </div>
            {formError && <p role="alert" className="text-sm font-semibold text-danger sm:col-span-2">{formError}</p>}
            <div className="flex gap-3 sm:col-span-2">
              <Button type="submit" disabled={busy}>{busy ? "Salvando…" : "Salvar cliente"}</Button>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            </div>
          </form>
        </Card>
      )}

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : rows.length === 0 ? (
        <Empty title="Nenhum cliente ainda" text="Cadastre seu primeiro cliente para vincular cotações e viagens." />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {rows.map((c) => (
            <li key={c.id} className="rounded-2xl border border-line bg-white p-5">
              <p className="text-lg font-bold text-pine-950">{c.name}</p>
              <p className="mt-1 text-sm text-muted">
                {[c.contact, c.phone, c.email].filter(Boolean).join(" · ") || "Sem contato cadastrado"}
              </p>
              {c.payment_terms && <p className="mt-2 text-sm">Pagamento: {c.payment_terms}</p>}
              {c.notes && <p className="mt-1 text-sm text-muted">{c.notes}</p>}
              <div className="mt-4 flex gap-2">
                <Button variant="ghost" onClick={() => edit(c)}>Editar</Button>
                <Button variant="danger" onClick={() => del(c)}>Excluir</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
