"use client";
import { createContext, useContext } from "react";
import type { Session } from "@supabase/supabase-js";
import type { Role } from "./permissions";

export type Member = { orgId: string; role: Role; fullName: string | null; clientId: string | null };
export type OrgInfo = {
  id: string; name: string; legal_name: string | null; trade_name: string | null; cnpj: string | null; phone: string | null; email: string | null;
  status: "teste" | "ativa" | "suspensa" | "cancelada"; trial_ends_at: string | null; settings: Record<string, unknown>;
  plan: { code: string; name: string; features: string[]; max_users: number | null; max_vehicles: number | null; ai_queries_month: number | null; price_month: number | null } | null;
  mfa_required: boolean; superadmin: boolean;
};
export type Ctx = { session: Session; member: Member | null; org: OrgInfo | null; reloadOrg: () => void };

export const SessionCtx = createContext<Ctx | null>(null);

export function useAppSession() {
  const c = useContext(SessionCtx);
  if (!c) throw new Error("useAppSession fora do AppShell");
  return c;
}
export const useRole = () => useAppSession().member?.role ?? null;
