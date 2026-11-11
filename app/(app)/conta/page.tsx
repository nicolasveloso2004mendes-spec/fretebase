"use client";
import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { logEvent } from "@/lib/db";
import { useAppSession } from "@/lib/session";
import { Notice } from "@/components/extra";
import { Badge, Button, Card, Field, Input, PageHeader } from "@/components/ui";

type Factor = { id: string; status: string; friendly_name?: string | null };

export default function ContaPage() {
  const { user } = useAppSession() as { user?: { email?: string | null } };
  const [factors, setFactors] = useState<Factor[]>([]);
  const [enroll, setEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const sb = getSupabase(); if (!sb) return;
    const { data } = await sb.auth.mfa.listFactors();
    setFactors((data?.totp ?? []) as Factor[]);
  }
  useEffect(() => { void load(); }, []);

  async function start() {
    setErr(null); setMsg(null);
    const sb = getSupabase()!;
    const { data, error } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: `app-${Date.now()}` });
    if (error || !data) return setErr("Não foi possível iniciar a ativação.");
    setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }
  async function confirm() {
    if (!enroll) return; setErr(null);
    const sb = getSupabase()!;
    const ch = await sb.auth.mfa.challenge({ factorId: enroll.id });
    if (ch.error) return setErr("Não foi possível validar. Tente de novo.");
    const v = await sb.auth.mfa.verify({ factorId: enroll.id, challengeId: ch.data.id, code: code.trim() });
    if (v.error) return setErr("Código incorreto.");
    setEnroll(null); setCode(""); setMsg("Verificação em duas etapas ativada."); logEvent("mfa_ativada"); void load();
  }
  async function remove(id: string) {
    if (!window.confirm("Desativar a verificação em duas etapas reduz a segurança da conta. Continuar?")) return;
    const { error } = await getSupabase()!.auth.mfa.unenroll({ factorId: id });
    if (error) return setErr("Não foi possível desativar (pode exigir confirmar o código novamente).");
    setMsg("Verificação desativada."); logEvent("mfa_desativada"); void load();
  }
  async function signOutAll() {
    if (!window.confirm("Encerrar a sessão em todos os dispositivos?")) return;
    logEvent("logout_global");
    await getSupabase()!.auth.signOut({ scope: "global" });
    window.location.href = "/login";
  }
  const verified = factors.filter((f) => f.status === "verified");
  return (
    <>
      <PageHeader crumb="Conta" title="Minha conta e segurança" subtitle={user?.email ?? undefined} />
      {msg && <p role="status" className="mb-4 text-sm font-semibold text-pine-800">{msg}</p>}
      {err && <p role="alert" className="mb-4 text-sm font-semibold text-danger">{err}</p>}
      <Card className="mb-6">
        <h2 className="font-extrabold text-pine-950">Verificação em duas etapas (app autenticador)</h2>
        <p className="mt-1 text-sm text-muted">Recomendada para proprietário e administradores. Depois de ativada, o acesso exige o código do app a cada sessão.</p>
        <p className="mt-3"><Badge tone={verified.length ? "good" : "warn"}>{verified.length ? "Ativada" : "Não ativada"}</Badge></p>
        {!enroll && verified.length === 0 && <Button className="mt-3" onClick={start}>Ativar</Button>}
        {verified.map((f) => <Button key={f.id} className="mt-3" variant="danger" onClick={() => remove(f.id)}>Desativar</Button>)}
        {enroll && (
          <div className="mt-4 space-y-3">
            <p className="text-sm">Escaneie o QR code no app autenticador e digite o código de 6 dígitos.</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={enroll.qr} alt="QR code para o app autenticador" className="size-44 rounded-xl border border-line bg-white p-2" />
            <p className="break-all text-xs text-muted">Chave manual: {enroll.secret}</p>
            <Field label="Código de 6 dígitos"><Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} /></Field>
            <div className="flex gap-3"><Button disabled={code.length !== 6} onClick={confirm}>Confirmar</Button><Button variant="ghost" onClick={() => setEnroll(null)}>Cancelar</Button></div>
          </div>
        )}
      </Card>
      <Card>
        <h2 className="font-extrabold text-pine-950">Sessões</h2>
        <p className="mt-1 text-sm text-muted">Se perdeu um aparelho, encerre todas as sessões.</p>
        <Button className="mt-3" variant="danger" onClick={signOutAll}>Sair de todos os dispositivos</Button>
      </Card>
      <div className="mt-6"><Notice>Para trocar a senha, use “Esqueci minha senha” na tela de login. Esta tela não guarda nem mostra senhas.</Notice></div>
    </>
  );
}
