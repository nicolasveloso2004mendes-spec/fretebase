"use client";
import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { Button, Field, Input } from "./ui";

/** Segundo fator (TOTP) exigido: sem ele o banco devolve zero dados (a sessão fica em aal1). */
export function MfaChallenge({ onDone }: { onDone: () => void }) {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getSupabase()!.auth.mfa.listFactors().then(({ data }) => setFactorId(data?.totp?.find((f) => f.status === "verified")?.id ?? null));
  }, []);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setBusy(true);
    setMsg(null);
    const sb = getSupabase()!;
    const { data: ch, error: e1 } = await sb.auth.mfa.challenge({ factorId });
    const { error: e2 } = e1 || !ch ? { error: e1 } : await sb.auth.mfa.verify({ factorId, challengeId: ch.id, code: code.trim() });
    if (e2) setMsg("Código inválido ou expirado. Tente o próximo código do aplicativo.");
    else {
      await sb.auth.refreshSession();
      onDone();
    }
    setBusy(false);
  }

  return (
    <main className="grid min-h-screen place-items-center p-6">
      <form onSubmit={verify} className="w-full max-w-sm space-y-4 rounded-2xl border border-line bg-white p-8">
        <h1 className="text-xl font-extrabold text-pine-950">Confirme sua identidade</h1>
        <p className="text-sm text-muted">Digite o código de 6 dígitos do seu aplicativo autenticador.</p>
        <Field label="Código">
          <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
        </Field>
        {msg && <p role="alert" className="text-sm font-semibold text-danger">{msg}</p>}
        <Button type="submit" className="w-full" disabled={busy || code.length !== 6 || !factorId}>{busy ? "Verificando…" : "Confirmar"}</Button>
        <button type="button" onClick={() => getSupabase()?.auth.signOut()} className="min-h-11 w-full text-sm font-semibold text-pine-700">Sair</button>
      </form>
    </main>
  );
}
