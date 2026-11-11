"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase, supabaseConfigured } from "@/lib/supabase";
import { Logo } from "./Logo";
import { SetupNotice } from "./SetupNotice";
import { Loading } from "./ui";
import { SessionCtx, type Member } from "@/lib/session";
import { ROLE_LABEL, canOpen, homeFor, navFor, type Role } from "@/lib/permissions";

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [member, setMember] = useState<Member | null>(null);
  const [memberReady, setMemberReady] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
      if (!data.session) router.replace("/login");
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (!s) router.replace("/login");
    });
    return () => sub.subscription.unsubscribe();
  }, [router]);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !session) return;
    let alive = true;
    setMemberReady(false);
    sb.from("members")
      .select("org_id, role, full_name, client_id")
      .eq("user_id", session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive) return;
        setMember(data ? { orgId: data.org_id, role: data.role as Role, fullName: data.full_name, clientId: data.client_id } : null);
        setMemberReady(true);
      });
    return () => {
      alive = false;
    };
  }, [session]);

  const role = member?.role ?? null;
  useEffect(() => {
    if (memberReady && member && !canOpen(role, pathname)) router.replace(homeFor(role));
  }, [memberReady, member, role, pathname, router]);

  useEffect(() => setOpen(false), [pathname]);

  if (!supabaseConfigured) return <SetupNotice />;
  if (!ready || !session || !memberReady) return <Loading text="Abrindo o painel…" />;
  if (!member)
    return (
      <main className="grid min-h-screen place-items-center p-6">
        <div className="max-w-md rounded-2xl border border-line bg-white p-8 text-center">
          <h1 className="text-xl font-extrabold text-pine-950">Conta sem acesso</h1>
          <p className="mt-2 text-muted">Esta conta ainda não pertence a nenhuma transportadora. Peça ao administrador para enviar um convite para {session.user.email} e entre de novo.</p>
          <button type="button" onClick={() => getSupabase()?.auth.signOut()} className="mt-5 min-h-11 rounded-xl border border-line px-5 font-bold">Sair</button>
        </div>
      </main>
    );
  if (!canOpen(role, pathname) && !(role === "cliente")) return <Loading text="Redirecionando…" />;
  const NAV = navFor(role);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <div className="lg:grid lg:min-h-screen lg:grid-cols-[17rem_1fr]">
      <div className="no-print sticky top-0 z-30 flex items-center justify-between bg-pine-900 px-4 py-3 lg:hidden">
        <Logo />
        <button
          type="button"
          aria-expanded={open}
          aria-controls="menu"
          onClick={() => setOpen((o) => !o)}
          className="min-h-11 rounded-lg border border-white/25 px-4 text-sm font-bold text-white"
        >
          {open ? "Fechar" : "Menu"}
        </button>
      </div>

      <aside
        id="menu"
        className={`no-print bg-pine-900 p-5 text-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col ${open ? "block" : "hidden lg:flex"}`}
      >
        <div className="mb-8 hidden lg:block">
          <Logo />
        </div>
        <nav aria-label="Principal" className="flex flex-col gap-1">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={isActive(n.href) ? "page" : undefined}
              className={`flex min-h-11 items-center rounded-xl px-4 text-[15px] font-semibold transition-colors ${
                isActive(n.href) ? "bg-pine-700 text-lime-brand" : "text-white/80 hover:bg-pine-800 hover:text-white"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-6 border-t border-white/15 pt-4 text-sm lg:mt-auto">
          <p className="truncate text-white/60">{session.user.email}</p>
          <p className="text-xs font-semibold text-lime-brand/80">{ROLE_LABEL[member.role]}</p>
          <button
            type="button"
            onClick={() => getSupabase()?.auth.signOut()}
            className="mt-2 min-h-11 rounded-lg px-1 font-semibold text-lime-brand underline-offset-4 hover:underline"
          >
            Sair
          </button>
          <p className="mt-3 text-xs text-white/40">Fretebase · NicoTech</p>
        </div>
      </aside>

      <main className="min-w-0 px-4 py-8 sm:px-8 lg:px-12 lg:py-10">
        <SessionCtx.Provider value={{ session, member }}>
          {role === "cliente" ? (
            <div className="rounded-2xl border border-line bg-white p-8">
              <h1 className="text-2xl font-extrabold text-pine-950">Portal do cliente</h1>
              <p className="mt-2 max-w-md text-muted">Seu acesso foi criado. O acompanhamento de cargas por aqui será liberado em uma próxima etapa.</p>
            </div>
          ) : (
            children
          )}
        </SessionCtx.Provider>
      </main>
    </div>
  );
}
