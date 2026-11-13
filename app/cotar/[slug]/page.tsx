"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getSupabase } from "@/lib/supabase";

const input = "w-full rounded-lg border border-line bg-white px-3 py-2.5 text-base text-ink outline-none focus:border-pine-700";

export default function CotarPublico() {
  const { slug } = useParams<{ slug: string }>();
  const [empresa, setEmpresa] = useState<string | null | undefined>(undefined);
  const [f, setF] = useState({ name: "", phone: "", email: "", origin: "", destination: "", cargo: "", weight: "", notes: "", website: "" });
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) { setEmpresa(null); return; }
    sb.rpc("public_quote_info", { p_slug: slug }).then(({ data }) => {
      setEmpresa((data as { name?: string } | null)?.name ?? null);
    });
  }, [slug]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const sb = getSupabase();
    if (!sb) return;
    setBusy(true); setErro(null);
    const w = f.weight.trim() ? Number(f.weight.replace(",", ".")) : null;
    const { error } = await sb.rpc("public_quote_submit", {
      p_slug: slug, p_name: f.name, p_phone: f.phone, p_email: f.email || null, p_origin: f.origin, p_destination: f.destination,
      p_cargo: f.cargo || null, p_weight: w && w > 0 ? w : null, p_notes: f.notes || null, p_website: f.website || null,
    });
    setBusy(false);
    if (error) setErro(error.message); else setOk(true);
  }

  return (
    <main className="mx-auto min-h-screen max-w-lg px-4 py-8">
      {empresa === undefined && <p className="text-ink/60">Carregando…</p>}
      {empresa === null && (
        <div className="rounded-xl border border-line bg-white p-6">
          <h1 className="text-xl font-semibold text-ink">Link indisponível</h1>
          <p className="mt-2 text-ink/70">Este link de cotação não está ativo. Fale diretamente com a transportadora.</p>
        </div>
      )}
      {empresa && ok && (
        <div className="rounded-xl border border-line bg-white p-6">
          <h1 className="text-xl font-semibold text-ink">Pedido enviado</h1>
          <p className="mt-2 text-ink/70">A {empresa} recebeu sua solicitação e entrará em contato pelo telefone informado.</p>
        </div>
      )}
      {empresa && !ok && (
        <form onSubmit={enviar} className="space-y-4 rounded-xl border border-line bg-white p-6">
          <div>
            <h1 className="text-xl font-semibold text-ink">Pedir cotação de frete</h1>
            <p className="mt-1 text-sm text-ink/70">{empresa}</p>
          </div>
          <label className="block text-sm font-medium text-ink">Seu nome
            <input className={input} required maxLength={120} value={f.name} onChange={set("name")} autoComplete="name" />
          </label>
          <label className="block text-sm font-medium text-ink">WhatsApp / telefone (com DDD)
            <input className={input} required inputMode="tel" maxLength={20} value={f.phone} onChange={set("phone")} autoComplete="tel" />
          </label>
          <label className="block text-sm font-medium text-ink">E-mail (opcional)
            <input className={input} type="email" maxLength={160} value={f.email} onChange={set("email")} autoComplete="email" />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-ink">Origem (cidade/UF)
              <input className={input} required maxLength={120} value={f.origin} onChange={set("origin")} />
            </label>
            <label className="block text-sm font-medium text-ink">Destino (cidade/UF)
              <input className={input} required maxLength={120} value={f.destination} onChange={set("destination")} />
            </label>
          </div>
          <label className="block text-sm font-medium text-ink">O que será transportado (opcional)
            <input className={input} maxLength={200} value={f.cargo} onChange={set("cargo")} />
          </label>
          <label className="block text-sm font-medium text-ink">Peso aproximado em kg (opcional)
            <input className={input} inputMode="decimal" maxLength={12} value={f.weight} onChange={set("weight")} />
          </label>
          <label className="block text-sm font-medium text-ink">Observações (opcional)
            <textarea className={input} rows={3} maxLength={1000} value={f.notes} onChange={set("notes")} />
          </label>
          <div aria-hidden="true" style={{ position: "absolute", left: "-9999px" }}>
            <label>Não preencha<input tabIndex={-1} autoComplete="off" value={f.website} onChange={set("website")} /></label>
          </div>
          {erro && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{erro}</p>}
          <button disabled={busy} className="w-full rounded-lg bg-pine-900 px-4 py-3 font-semibold text-white hover:bg-pine-800 disabled:opacity-60">
            {busy ? "Enviando…" : "Enviar pedido"}
          </button>
          <p className="text-xs text-ink/60">Seus dados são usados apenas para a {empresa} responder ao pedido e ficam guardados por até 180 dias. Plataforma Fretebase (NicoTech).</p>
        </form>
      )}
    </main>
  );
}
