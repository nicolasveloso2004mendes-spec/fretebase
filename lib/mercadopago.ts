import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Valida o x-signature do webhook do Mercado Pago (HMAC-SHA256 em hex).
 * Manifest: "id:<data.id em minúsculas>;request-id:<x-request-id>;ts:<ts>;" — pares ausentes são omitidos.
 */
export function verifyMpSignature(a: { xSignature: string | null | undefined; xRequestId: string | null | undefined; dataId: string | null | undefined; secret: string | null | undefined }) {
  if (!a.secret || !a.xSignature) return false;
  // Aceita vários segredos separados por vírgula (modo de teste e de produção do Mercado Pago).
  const secrets = a.secret.split(",").map((x) => x.trim()).filter((x) => x.length >= 8);
  if (!secrets.length) return false;
  let ts = "", v1 = "";
  for (const part of a.xSignature.split(",")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim(), v = part.slice(i + 1).trim();
    if (k === "ts") ts = v;
    if (k === "v1") v1 = v.toLowerCase();
  }
  if (!ts || !/^[0-9a-f]{64}$/.test(v1)) return false;
  let manifest = "";
  if (a.dataId) manifest += `id:${a.dataId.toLowerCase()};`;
  if (a.xRequestId) manifest += `request-id:${a.xRequestId};`;
  manifest += `ts:${ts};`;
  const given = Buffer.from(v1, "hex");
  return secrets.some((sec) => {
    const expected = createHmac("sha256", sec).update(manifest, "utf8").digest();
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

export type Status = "pendente" | "confirmado" | "falhou" | "estornado";

/** Situação do pagamento no Mercado Pago -> situação interna. Só "approved" confirma. */
export function mapPaymentStatus(s: unknown): Status {
  switch (s) {
    case "approved": return "confirmado";
    case "refunded": case "charged_back": return "estornado";
    case "rejected": case "cancelled": return "falhou";
    default: return "pendente";
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE = /^[a-z0-9_]{2,30}$/;

/** external_reference que nós mesmos criamos: "<org_id>:<codigo_do_plano>". */
export function buildReference(orgId: string, planCode: string) { return `${orgId}:${planCode}`; }
export function parseReference(ref: unknown): { orgId: string; plan: string | null } | null {
  if (typeof ref !== "string") return null;
  const [org, plan] = ref.split(":");
  if (!org || !UUID.test(org)) return null;
  return { orgId: org, plan: plan && CODE.test(plan) ? plan : null };
}
export const isPlanCode = (c: unknown): c is string => typeof c === "string" && CODE.test(c);
