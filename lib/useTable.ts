"use client";
import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "./supabase";

type Opts = { select?: string; order?: string };

/** Carrega uma tabela do Supabase com estado de carregando/erro e ações básicas. */
export function useTable<T extends { id: string }>(table: string, { select = "*", order = "created_at" }: Opts = {}) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) return;
    setLoading(true);
    setError(null);
    const { data, error } = await sb.from(table).select(select).order(order, { ascending: false });
    if (error) setError("Não foi possível carregar os registros. Verifique sua conexão e tente de novo.");
    else setRows((data ?? []) as unknown as T[]);
    setLoading(false);
  }, [table, select, order]);

  useEffect(() => {
    load();
  }, [load]);

  const insert = async (values: Record<string, unknown>) => {
    const { data, error } = await getSupabase()!.from(table).insert(values).select(select).single();
    if (error) throw new Error(error.message);
    await load();
    return data as unknown as T;
  };
  const update = async (id: string, values: Record<string, unknown>) => {
    const { error } = await getSupabase()!.from(table).update(values).eq("id", id);
    if (error) throw new Error(error.message);
    await load();
  };
  const remove = async (id: string) => {
    const { error } = await getSupabase()!.from(table).delete().eq("id", id);
    if (error) throw new Error(error.message);
    await load();
  };

  return { rows, loading, error, reload: load, insert, update, remove };
}
