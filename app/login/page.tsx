"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase, supabaseConfigured } from "@/lib/supabase";
import { Logo } from "@/components/Logo";
import { SetupNotice } from "@/components/SetupNotice";
import { Button, Field, Input } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"entrar" | "criar">("entrar");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "error" | "ok"; text: string } | null>(null);

  useEffect(() => {
    getSupabase()?.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/");
    });
  }, [router]);

  if (!supabaseConfigured) return <SetupNotice />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const sb = getSupabase()!;
    setBusy(true);
    setMsg(null);
    if (mode === "entrar") {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) setMsg({ type: "error", text: "E-mail ou senha incorretos." });
      else router.replace("/");
    } else {
      if (password.length < 8) {
        setMsg({ type: "error", text: "Use uma senha com pelo menos 8 caracteres." });
      } else {
        const { data, error } = await sb.auth.signUp({ email, password });
        if (error) setMsg({ type: "error", text: "Não foi possível criar a conta. Confira o e-mail e tente de novo." });
        else if (data.session) router.replace("/");
        else setMsg({ type: "ok", text: "Conta criada. Confirme o e-mail que enviamos e depois entre." });
      }
    }
    setBusy(false);
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-pine-900 p-12 text-white lg:flex">
        <Logo />
        <div>
          <h2 className="max-w-md text-4xl font-extrabold leading-tight">Saiba quanto sobra em cada frete antes de fechar.</h2>
          <p className="mt-4 max-w-md text-white/70">Cotação, pedidos, viagens e recebimentos da transportadora num só lugar.</p>
        </div>
        <p className="text-sm text-white/40">Fretebase · NicoTech</p>
      </section>
      <section className="grid place-items-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-4">
          <div className="lg:hidden">
            <Logo dark />
          </div>
          <h1 className="text-2xl font-extrabold text-pine-950">{mode === "entrar" ? "Entre no painel" : "Crie sua conta"}</h1>
          <Field label="E-mail">
            <Input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Senha">
            <Input
              type="password"
              required
              minLength={mode === "criar" ? 8 : undefined}
              autoComplete={mode === "entrar" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          {msg && (
            <p role="alert" className={`text-sm font-semibold ${msg.type === "error" ? "text-danger" : "text-green-800"}`}>
              {msg.text}
            </p>
          )}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Aguarde…" : mode === "entrar" ? "Entrar" : "Criar conta"}
          </Button>
          <button
            type="button"
            onClick={() => {
              setMode(mode === "entrar" ? "criar" : "entrar");
              setMsg(null);
            }}
            className="min-h-11 w-full text-sm font-semibold text-pine-700 underline-offset-4 hover:underline"
          >
            {mode === "entrar" ? "Primeiro acesso? Criar conta" : "Já tenho conta"}
          </button>
        </form>
      </section>
    </main>
  );
}
