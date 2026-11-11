"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase, supabaseConfigured } from "@/lib/supabase";
import { Logo } from "@/components/Logo";
import { SetupNotice } from "@/components/SetupNotice";
import { Button, Field, Input } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"entrar" | "criar" | "empresa" | "recuperar">("entrar");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [co, setCo] = useState({ company: "", cnpj: "", contact: "", phone: "" });
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
    if (mode === "empresa") {
      const { error } = await sb.rpc("request_org_signup", { p_company: co.company, p_cnpj: co.cnpj, p_contact: co.contact, p_email: email, p_phone: co.phone });
      if (error) setMsg({ type: "error", text: "Não foi possível enviar o pedido. Confira os dados e tente de novo mais tarde." });
      else setMsg({ type: "ok", text: "Pedido enviado. A NicoTech vai analisar e entrar em contato pelo e-mail informado." });
    } else if (mode === "recuperar") {
      await sb.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/redefinir-senha` });
      setMsg({ type: "ok", text: "Se o e-mail estiver cadastrado, enviamos um link para criar uma nova senha." });
    } else if (mode === "entrar") {
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
          <h1 className="text-2xl font-extrabold text-pine-950">{mode === "entrar" ? "Entre no painel" : mode === "criar" ? "Criar conta (com convite)" : mode === "recuperar" ? "Recuperar senha" : "Cadastrar minha transportadora"}</h1>
          <Field label="E-mail">
            <Input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          {mode === "empresa" && (
            <>
              <Field label="Nome da transportadora"><Input required maxLength={150} value={co.company} onChange={(e) => setCo({ ...co, company: e.target.value })} /></Field>
              <Field label="CNPJ"><Input inputMode="numeric" maxLength={18} value={co.cnpj} onChange={(e) => setCo({ ...co, cnpj: e.target.value })} /></Field>
              <Field label="Seu nome"><Input required maxLength={120} value={co.contact} onChange={(e) => setCo({ ...co, contact: e.target.value })} /></Field>
              <Field label="Telefone / WhatsApp"><Input type="tel" maxLength={25} value={co.phone} onChange={(e) => setCo({ ...co, phone: e.target.value })} /></Field>
            </>
          )}
          {mode !== "empresa" && mode !== "recuperar" && <Field label="Senha">
            <Input
              type="password"
              required
              minLength={mode === "criar" ? 8 : undefined}
              autoComplete={mode === "entrar" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>}
          {msg && (
            <p role="alert" className={`text-sm font-semibold ${msg.type === "error" ? "text-danger" : "text-green-800"}`}>
              {msg.text}
            </p>
          )}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Aguarde…" : mode === "entrar" ? "Entrar" : mode === "criar" ? "Criar conta" : mode === "recuperar" ? "Enviar link" : "Enviar pedido"}
          </Button>
          <button
            type="button"
            onClick={() => {
              setMode(mode === "entrar" ? "criar" : "entrar");
              setMsg(null);
            }}
            className="min-h-11 w-full text-sm font-semibold text-pine-700 underline-offset-4 hover:underline"
          >
            {mode === "entrar" ? "Recebi um convite? Criar conta" : "Já tenho conta"}
          </button>
          {mode === "entrar" && (
            <button type="button" onClick={() => { setMode("recuperar"); setMsg(null); }} className="min-h-11 w-full text-sm font-semibold text-pine-700 underline-offset-4 hover:underline">Esqueci a senha</button>
          )}
          {mode === "entrar" && (
            <button type="button" onClick={() => { setMode("empresa"); setMsg(null); }} className="min-h-11 w-full text-sm font-semibold text-pine-700 underline-offset-4 hover:underline">Quero cadastrar minha transportadora</button>
          )}
        </form>
      </section>
    </main>
  );
}
