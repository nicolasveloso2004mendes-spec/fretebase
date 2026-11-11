import { getSupabase } from "./supabase";
import { fetchAll } from "./db";
import { buildAlerts, type AlertInput, type AlertSettings } from "./compliance";
import type { Maint } from "./fleet";
import { today } from "./format";

/** Lê os dados da empresa (a RLS filtra) e devolve o conjunto atual de alertas. */
export async function computeAlerts(settings?: Partial<AlertSettings>) {
  const [trips, expenses, fiscal, ciot, policies, vdocs, drivers, maint, vehicles, proofs] = await Promise.all([
    fetchAll<AlertInput["trips"][number]>("trips"),
    fetchAll<AlertInput["expenses"][number]>("trip_expenses", "trip_id, kind, amount"),
    fetchAll<AlertInput["fiscal"][number]>("fiscal_documents", "id, kind, trip_id, status, expires_on, closed_on, number"),
    fetchAll<AlertInput["ciot"][number]>("ciot_records", "id, trip_id, status"),
    fetchAll<AlertInput["policies"][number]>("insurance_policies", "id, number, valid_to"),
    fetchAll<AlertInput["vehicleDocs"][number]>("vehicle_documents", "id, vehicle_id, kind, expires_on"),
    fetchAll<AlertInput["drivers"][number]>("drivers", "id, name, cnh_expiry, active"),
    fetchAll<Maint>("maintenance_records"),
    fetchAll<{ id: string; odometer_km: number }>("vehicles", "id, odometer_km"),
    fetchAll<{ trip_id: string }>("delivery_proofs", "trip_id"),
  ]);
  return buildAlerts({
    today: today(), settings, trips, expenses, fiscal, ciot, policies, vehicleDocs: vdocs, drivers, maintenance: maint,
    odometers: Object.fromEntries(vehicles.map((v) => [v.id, Number(v.odometer_km)])), proofTripIds: proofs.map((p) => p.trip_id),
  });
}

/** Automação E: roda ao abrir o sistema (não há agendador em segundo plano). Cria alertas novos sem duplicar e encerra os que deixaram de valer. */
export async function syncAlerts(settings?: Partial<AlertSettings>) {
  const sb = getSupabase()!;
  const drafts = await computeAlerts(settings);
  if (drafts.length) {
    await sb.from("alerts").upsert(
      drafts.map((d) => ({ kind: d.kind, title: d.title, description: d.description, priority: d.priority, ref_path: d.ref_path, action: d.action, data: d.data, dedupe_key: d.dedupe_key })),
      { onConflict: "org_id,dedupe_key", ignoreDuplicates: true },
    );
  }
  const keys = new Set(drafts.map((d) => d.dedupe_key));
  const { data: open } = await sb.from("alerts").select("id, dedupe_key").eq("status", "aberto");
  const stale = (open ?? []).filter((a) => !keys.has(a.dedupe_key)).map((a) => a.id);
  if (stale.length) {
    await sb.from("alerts").update({ status: "resolvido", resolved_at: new Date().toISOString(), resolution_note: "Condição deixou de existir (verificação automática)." }).in("id", stale);
  }
  return { created: drafts.length, closed: stale.length };
}
