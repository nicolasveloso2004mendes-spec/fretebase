"use client";
import { createContext, useContext } from "react";
import type { Session } from "@supabase/supabase-js";
import type { Role } from "./permissions";

export type Member = { orgId: string; role: Role; fullName: string | null; clientId: string | null };
export type Ctx = { session: Session; member: Member | null };

export const SessionCtx = createContext<Ctx | null>(null);

export function useAppSession() {
  const c = useContext(SessionCtx);
  if (!c) throw new Error("useAppSession fora do AppShell");
  return c;
}
export const useRole = () => useAppSession().member?.role ?? null;
