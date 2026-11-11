"use client";
import { useEffect, useState } from "react";
import { useAppSession } from "@/lib/session";
import { ROLE_LABEL, type Role } from "@/lib/permissions";
import { getSupabase } from "@/lib/supabase";
import { dateBR, today } from "@/lib/format";
import { expiryState } from "@/lib/fleet";
import type { Client, Driver } from "@/lib/types";
import { Badge, Button, Card, ErrorBox, Field, Input, Loading, PageHeader, Select } from "@/components/ui";

type MemberRow = { user_id: string; role: Role; full_name: string | null; client_id: string | null };
type Invite = { id: string; email: string; role: Role; driver_id: string | null; client_id: string | null; created_at: string; used_at: string | null };
const INVITE_ROLES: Role[] = ["admin", "operacional", "financeiro", "motorista", "cliente"];
const blankDriver = { name: "", phone: "", cnh_category: "E", cnh_expiry: "" };

export default function EquipePage() {
  const { session, member } = useAppSession();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [driverForm, setDriverForm] = useState(blankDriver);
  const [editingDriver, setEditingDriver] = useState<string | null>(null);
  const [inv, setInv] = useState({ email: "", role: "operacional" as Role, driver_id: "", client_id: "" });

  async function load() {
    const sb = getSupabase()!;
    const [d, m, i, c] = await Promise.all([
      sb.from("drivers").select("*").order("name"),
      sb.from("members").select("user_id, role, full_name, client_id").order("created_at"),
      sb.from("invites").select("*").order("created_at", { ascending: false }),
      sb.from("clients").select("id, name").order("name"),
    ]);
    if (d.error || m.error || i.error) setError("Não foi possível carregar a equipe.");
    else { setDrivers((d.data ?? []) as Driver[]); setMembers((m.data ?? []) as MemberRow[]); setInvites((i.data ?? []) as Invite[]); setClients((c.data ?? []) as Client[]); }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function saveDriver(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const values = { name: driverForm.name.trim(), phone: driverForm.phone.trim() || null, cnh_category: driverForm.cnh_category || null, cnh_expiry: driverForm.cnh_expiry || null };
    const sb = getSupabase()!;
    const { error } = editingDriver ? await sb.from("drivers").update(values).eq("id", editingDriver) : await sb.from("drivers").insert({ ...values, org_id: member!.orgId });
    if (error) return setMsg("Não foi possível salvar o motorista.");
    setDriverForm(blankDriver); setEditingDriver(null); load();
  }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (inv.role === "motorista" && !inv.driver_id) return setMsg("Escolha o motorista que usará este acesso.");
    if (inv.role === "cliente" && !inv.client_id) return setMsg("Escolha o cliente deste acesso.");
    const { error } = await getSupabase()!.from("invites").insert({
      org_id: member!.orgId, email: inv.email.trim().toLowerCase(), role: inv.role,
      driver_id: inv.role === "motorista" ? inv.driver_id : null, client_id: inv.role === "cliente" ? inv.client_id : null,
    });
    if (error) return setMsg("Não foi possível criar o convite.");
    setInv({ email: "", role: "operacional", driver_id: "", client_id: "" });
    setMsg("Convite criado. Avise a pessoa para abrir o sistema, tocar em “Criar conta” com este mesmo e-mail e confirmar o e-mail recebido.");
    load();
  }

  async function changeRole(userId: string, role: Role) {
    const { error } = await getSupabase()!.from("members").update({ role }).eq("user_id", userId);
    if (error) setMsg("Não foi possível alterar o papel."); else load();
  }

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={load} />;

  return (
    <>
      <PageHeader crumb="Equipe" title="Equipe e motoristas" subtitle="Cadastre motoristas e convide a equipe. Cada pessoa só vê o que o papel dela permite." />
      {msg && <p role="status" className="mb-4 rounded-xl border border-line bg-white p-3 text-sm font-semibold text-pine-900">{msg}</p>}

      <Card className="mb-6">
        <h2 className="text-lg font-extrabold text-pine-950">Motoristas</h2>
        <ul className="mt-3 divide-y divide-line">
          {drivers.length === 0 && <li className="py-3 text-sm text-muted">Nenhum motorista cadastrado.</li>}
          {drivers.map((d) => {
            const ex = expiryState(d.cnh_expiry, today());
            return (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <p className="font-bold text-pine-950">{d.name} {!d.active && <Badge>Inativo</Badge>}</p>
                  <p className="text-sm text-muted">{d.phone ?? "sem telefone"} · CNH {d.cnh_category ?? "—"} · vence {dateBR(d.cnh_expiry)} · {d.user_id ? "tem acesso ao app" : "sem acesso ao app"}</p>
                </div>
                <div className="flex items-center gap-2">
                  {ex === "vencido" && <Badge tone="bad">CNH vencida</Badge>}{ex === "vencendo" && <Badge tone="warn">CNH vence em breve</Badge>}
                  <Button variant="ghost" onClick={() => { setEditingDriver(d.id); setDriverForm({ name: d.name, phone: d.phone ?? "", cnh_category: d.cnh_category ?? "E", cnh_expiry: d.cnh_expiry ?? "" }); }}>Editar</Button>
                  <Button variant="ghost" onClick={async () => { await getSupabase()!.from("drivers").update({ active: !d.active }).eq("id", d.id); load(); }}>{d.active ? "Desativar" : "Reativar"}</Button>
                </div>
              </li>
            );
          })}
        </ul>
        <form onSubmit={saveDriver} className="mt-5 grid gap-3 border-t border-line pt-4 sm:grid-cols-4">
          <Field label="Nome"><Input required maxLength={160} value={driverForm.name} onChange={(e) => setDriverForm({ ...driverForm, name: e.target.value })} /></Field>
          <Field label="Telefone"><Input inputMode="tel" value={driverForm.phone} onChange={(e) => setDriverForm({ ...driverForm, phone: e.target.value })} /></Field>
          <Field label="CNH (categoria)"><Select value={driverForm.cnh_category} onChange={(e) => setDriverForm({ ...driverForm, cnh_category: e.target.value })}>{["B", "C", "D", "E"].map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <Field label="Validade da CNH"><Input type="date" value={driverForm.cnh_expiry} onChange={(e) => setDriverForm({ ...driverForm, cnh_expiry: e.target.value })} /></Field>
          <div className="flex gap-2 sm:col-span-4"><Button type="submit">{editingDriver ? "Salvar motorista" : "Adicionar motorista"}</Button>{editingDriver && <Button variant="ghost" onClick={() => { setEditingDriver(null); setDriverForm(blankDriver); }}>Cancelar</Button>}</div>
        </form>
      </Card>

      <Card className="mb-6">
        <h2 className="text-lg font-extrabold text-pine-950">Pessoas com acesso</h2>
        <ul className="mt-3 divide-y divide-line">
          {members.map((m) => {
            const self = m.user_id === session.user.id;
            return (
              <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <p className="font-bold text-pine-950">{m.full_name ?? "Sem nome"} {self && <span className="text-sm font-normal text-muted">(você)</span>}</p>
                {self || m.role === "proprietario" ? <Badge tone="info">{ROLE_LABEL[m.role]}</Badge> : (
                  <Select aria-label={`Papel de ${m.full_name}`} className="!mt-0 max-w-48" value={m.role} onChange={(e) => changeRole(m.user_id, e.target.value as Role)}>
                    {INVITE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </Select>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <h2 className="text-lg font-extrabold text-pine-950">Convidar pessoa</h2>
        <form onSubmit={sendInvite} className="mt-3 grid gap-3 sm:grid-cols-4">
          <Field label="E-mail"><Input type="email" required value={inv.email} onChange={(e) => setInv({ ...inv, email: e.target.value })} /></Field>
          <Field label="Papel"><Select value={inv.role} onChange={(e) => setInv({ ...inv, role: e.target.value as Role })}>{INVITE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</Select></Field>
          {inv.role === "motorista" && <Field label="Motorista"><Select value={inv.driver_id} onChange={(e) => setInv({ ...inv, driver_id: e.target.value })}><option value="">Escolha</option>{drivers.filter((d) => !d.user_id).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>}
          {inv.role === "cliente" && <Field label="Cliente"><Select value={inv.client_id} onChange={(e) => setInv({ ...inv, client_id: e.target.value })}><option value="">Escolha</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>}
          <div className="self-end"><Button type="submit">Criar convite</Button></div>
        </form>
        <ul className="mt-4 space-y-1 text-sm">
          {invites.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{i.email}</span> <Badge>{ROLE_LABEL[i.role]}</Badge> {i.used_at ? <Badge tone="good">Aceito</Badge> : <Badge tone="warn">Pendente</Badge>}
              {!i.used_at && <button type="button" className="text-danger underline" onClick={async () => { await getSupabase()!.from("invites").delete().eq("id", i.id); load(); }}>cancelar</button>}
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
