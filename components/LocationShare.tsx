"use client";
import { useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { Badge, Button, Card } from "@/components/ui";

const MIN_INTERVAL_MS = 30_000;

/** Compartilhamento de localização do motorista: só com consentimento explícito, só durante a viagem e só com o app aberto. */
export function LocationShare({ tripId }: { tripId: string }) {
  const key = `fb-loc-${tripId}`;
  const [on, setOn] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [last, setLast] = useState<Date | null>(null);
  const watch = useRef<number | null>(null);
  const lastSent = useRef(0);

  const supported = typeof navigator !== "undefined" && "geolocation" in navigator;

  function begin() {
    if (!supported) return;
    watch.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const now = Date.now();
        if (now - lastSent.current < MIN_INTERVAL_MS) return;
        lastSent.current = now;
        const { error } = await getSupabase()!.rpc("driver_share_location", { p_trip: tripId, p_lat: pos.coords.latitude, p_lng: pos.coords.longitude, p_accuracy: pos.coords.accuracy });
        if (error) setMsg("Não foi possível enviar a posição agora."); else { setLast(new Date()); setMsg(null); }
      },
      (e) => setMsg(e.code === e.PERMISSION_DENIED ? "Permissão de localização negada no aparelho." : "Não foi possível obter a localização."),
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 },
    );
  }
  function end() {
    if (watch.current != null) navigator.geolocation.clearWatch(watch.current);
    watch.current = null;
  }

  useEffect(() => {
    try { if (localStorage.getItem(key) === "1") { setOn(true); begin(); } } catch { /* ignora */ }
    return end;
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  async function start() {
    setMsg(null);
    const { error } = await getSupabase()!.rpc("driver_set_location_sharing", { p_trip: tripId, p_on: true });
    if (error) return setMsg("Não foi possível ativar o compartilhamento.");
    try { localStorage.setItem(key, "1"); } catch { /* ignora */ }
    setOn(true); begin();
  }
  async function stop() {
    end();
    await getSupabase()!.rpc("driver_set_location_sharing", { p_trip: tripId, p_on: false });
    try { localStorage.removeItem(key); } catch { /* ignora */ }
    setOn(false); setLast(null);
  }

  return (
    <Card className="mb-6">
      <h2 className="text-lg font-extrabold text-pine-950">Compartilhar localização com o cliente</h2>
      <p className="mt-1 text-sm text-muted">Opcional. Sua posição é enviada a cada ~30 s só enquanto esta tela estiver aberta e a viagem em andamento. Você pode parar quando quiser. A posição fica visível à transportadora e ao cliente desta viagem.</p>
      <p className="mt-3"><Badge tone={on ? "good" : "info"}>{on ? "Compartilhando" : "Desligado"}</Badge>{last && <span className="ml-2 text-xs text-muted">último envio {last.toLocaleTimeString("pt-BR")}</span>}</p>
      {!supported && <p className="mt-2 text-sm text-warn">Este aparelho não oferece localização no navegador.</p>}
      {msg && <p role="alert" className="mt-2 text-sm font-semibold text-danger">{msg}</p>}
      <div className="mt-3">{on ? <Button variant="danger" onClick={stop}>Parar de compartilhar</Button> : <Button disabled={!supported} onClick={start}>Aceito compartilhar minha localização</Button>}</div>
    </Card>
  );
}
