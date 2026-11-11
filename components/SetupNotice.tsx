import { Logo } from "./Logo";

export function SetupNotice() {
  return (
    <main className="mx-auto grid min-h-screen max-w-xl place-items-center p-6">
      <div className="rounded-2xl border border-line bg-white p-8">
        <Logo dark />
        <h1 className="mt-6 text-2xl font-extrabold text-pine-950">Falta conectar o banco de dados</h1>
        <p className="mt-2 text-muted">
          Cadastre as variáveis <code className="rounded bg-paper px-1.5">NEXT_PUBLIC_SUPABASE_URL</code> e{" "}
          <code className="rounded bg-paper px-1.5">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> (no arquivo <code>.env.local</code> ou no painel da
          Vercel) e publique de novo. O passo a passo está no README.
        </p>
      </div>
    </main>
  );
}
