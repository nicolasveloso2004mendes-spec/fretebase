"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase, supabaseConfigured } from "@/lib/supabase";
import { Logo } from "./Logo";
import { SetupNotice } from "./SetupNotice";
import { Loading } from "./ui";
import { SessionCtx, type Member, type OrgInfo } from "@/lib/session";
import { MfaChallenge } from "./MfaChallenge";
import { syncAlerts } from "@/lib/autoAlerts";
import { logEvent } from "@/lib/db";
import { isReader } from "@/lib/permissions";
import { dateBR, today } from "@/lib/format";
import { ROLE_LABEL, canOpen, homeFor, navFor, type Role } from "@/lib/permissions";

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [member, setMember] = useState<Member | null>(null);
  const [memberReady, setMemberReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [org, setOrg] = useState<OrgInfo | null>(null);
  const [orgTick, setOrgTick] = useState(0);

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
    Promise.all([
      sb.from("members").select("org_id, role, full_name, client_id").eq("user_id", session.user.id).maybeSingle(),
      sb.rpc("my_org"),
    ]).then(([{ data }, { data: o }]) => {
      if (!alive) return;
      setMember(data ? { orgId: data.org_id, role: data.role as Role, fullName: data.full_name, clientId: data.client_id } : null);
      setOrg((o as OrgInfo | null) ?? null);
      setMemberReady(true);
    });
    return () => {
      alive = false;
    };
  }, [session, orgTick]);

  useEffect(() => {
    if (session) logEvent("login");
  }, [session?.user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const role = member?.role ?? null;
  useEffect(() => {
    if (memberReady && member && !canOpen(role, pathname, org?.superadmin)) router.replace(homeFor(role));
  }, [memberReady, member, role, pathname, router, org?.superadmin]);

  const blocked = org && (org.status === "suspensa" || org.status === "cancelada");
  const mfaPending = org?.mfa_required;
  const ready2 = memberReady && member && !blocked && !mfaPending;
  useEffect(() => {
    if (!ready2 || !isReader(role)) return;
    const k = `fb-alerts-${today()}-${member!.orgId}`;
    if (sessionStorage.getItem(k)) return;
    sessionStorage.setItem(k, "1");
    syncAlerts((org?.settings as { alerts?: object } | undefined)?.alerts).catch(() => sessionStorage.removeItem(k));
  }, [ready2, role]); // eslint-disable-line react-hooks/exhaustive-deps

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
  if (mfaPending) return <MfaChallenge onDone={() => setOrgTick((n) => n + 1)} />;
  if (blocked)
    return (
      <main className="grid min-h-screen place-items-center p-6">
        <div className="max-w-md rounded-2xl border border-line bg-white p-8 text-center">
          <h1 className="text-xl font-extrabold text-pine-950">Acesso {org!.status === "suspensa" ? "suspenso" : "encerrado"}</h1>
          <p className="mt-2 text-muted">A assinatura desta empresa está {org!.status === "suspensa" ? "suspensa" : "cancelada"}. Os dados continuam guardados e não foram apagados. Fale com a NicoTech para regularizar.</p>
          <button type="button" onClick={() => getSupabase()?.auth.signOut()} className="mt-5 min-h-11 rounded-xl border border-line px-5 font-bold">Sair</button>
        </div>
      </main>
    );
  if (!canOpen(role, pathname, org?.superadmin)) return <Loading text="Redirecionando…" />;
  const NAV = navFor(role, { features: org?.plan?.features, superadmin: org?.superadmin });
  const trialLeft = org?.status === "teste" && org.trial_ends_at ? Math.ceil((new Date(org.trial_ends_at).getTime() - Date.now()) / 86400000) : null;

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
          {NAV.map((n, i) => (
            <div key={n.href}>
              {n.group && n.group !== NAV[i - 1]?.group && role !== "motorista" && role !== "cliente" && (
                <p className="mb-1 mt-4 px-4 text-[11px] font-bold uppercase tracking-wider text-white/40">{n.group}</p>
              )}
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
            </div>
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
        <SessionCtx.Provider value={{ session, member, org, reloadOrg: () => setOrgTick((n) => n + 1) }}>
          {trialLeft !== null && (
            <p role="status" className="no-print mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-warn">
              {trialLeft >= 0 ? `Período de teste até ${dateBR(org!.trial_ends_at)} (${trialLeft} dia(s)).` : `O período de teste terminou em ${dateBR(org!.trial_ends_at)}. Fale com a NicoTech para contratar um plano.`}
            </p>
          )}
          {children}
        </SessionCtx.Provider>
      </main>
    </div>
  );
}
