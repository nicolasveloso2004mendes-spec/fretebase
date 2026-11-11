import { getSupabase } from "./supabase";

/** Lê uma tabela inteira (RLS filtra por empresa e papel). Lança erro com mensagem amigável. */
export async function fetchAll<T = Record<string, unknown>>(table: string, select = "*", order?: string): Promise<T[]> {
  let q = getSupabase()!.from(table).select(select);
  if (order) q = q.order(order, { ascending: false });
  const { data, error } = await q.limit(5000);
  if (error) throw new Error("Não foi possível carregar os dados. Verifique sua conexão e tente de novo.");
  return (data ?? []) as unknown as T[];
}

export async function rpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await getSupabase()!.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export function logEvent(action: string, detail?: string) {
  getSupabase()?.rpc("log_event", { p_action: action, p_detail: detail ?? null }).then(() => undefined, () => undefined);
}

export function download(filename: string, content: string, mime = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
