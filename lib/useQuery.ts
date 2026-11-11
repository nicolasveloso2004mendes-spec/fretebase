"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/** Carrega dados de uma função assíncrona com estado de carregando/erro. */
export function useQuery<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef(fn);
  ref.current = fn;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await ref.current());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível carregar.");
    }
    setLoading(false);
  }, deps);
  useEffect(() => {
    load();
  }, [load]);
  return { data, loading, error, reload: load };
}
