"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase, supabaseConfigured } from "@/lib/supabase";
import { Logo } from "@/components/Logo";
import { SetupNotice } from "@/components/SetupNotice";
import { Button, Field, Input } from "@/components/ui";

export default function RedefinirSenhaPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [checked, setChecked] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "error" | "ok"; text: string } | null>(null);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setReady(true);
    });
    sb.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
      setChecked(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!supabaseConfigured) return <SetupNotice />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (password.length < 8) return setMsg({ type: "error", text: "Use uma senha com pelo menos 8 caracteres." });
    if (password !== confirm) return setMsg({ type: "error", text: "As senhas não são iguais." });
    setBusy(true);
    const { error } = await getSupabase()!.auth.updateUser({ password });
    setBusy(false);
    if (error) return setMsg({ type: "error", text: "Não foi possível salvar a nova senha. Peça um novo link e tente de novo." });
    setMsg({ type: "ok", text: "Senha alterada. Entrando…" });
    setTimeout(() => router.replace("/"), 1000);
  }

  return (
    <main className="grid min-h-screen place-items-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4">
        <Logo dark />
        <h1 className="text-2xl font-extrabold text-pine-950">Criar nova senha</h1>
        {checked && !ready ? (
          <>
            <p role="alert" className="text-sm font-semibold text-danger">Link inválido ou vencido. Peça um novo na tela de login, em &quot;Esqueci a senha&quot;.</p>
            <Button type="button" className="w-full" onClick={() => router.replace("/login")}>Ir para o login</Button>
          </>
        ) : (
          <>
            <Field label="Nova senha"><Input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
            <Field label="Repita a nova senha"><Input type="password" required minLength={8} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
            {msg && <p role="alert" className={`text-sm font-semibold ${msg.type === "error" ? "text-danger" : "text-green-800"}`}>{msg.text}</p>}
            <Button type="submit" disabled={busy || !ready} className="w-full">{busy ? "Aguarde…" : "Salvar nova senha"}</Button>
          </>
        )}
      </form>
    </main>
  );
}
