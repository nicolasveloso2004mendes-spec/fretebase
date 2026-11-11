import { getSupabase } from "./supabase";

export const BUCKET = "comprovantes";
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const ALLOWED_DOC = [...ALLOWED, "text/xml", "application/xml"];

export function validateFile(f: { type: string; size: number }, allowXml = false) {
  if (!(allowXml ? ALLOWED_DOC : ALLOWED).includes(f.type)) return allowXml ? "Envie PDF, foto ou XML." : "Envie uma foto (JPG, PNG, WebP) ou PDF.";
  if (f.size > MAX_BYTES) return "O arquivo passa de 5 MB. Tire a foto em resolução menor.";
  return null;
}

function ext(type: string) {
  return type.includes("xml") ? "xml" : type === "application/pdf" ? "pdf" : type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
}

/** Envia para <org>/<pasta>/<uuid>.ext no bucket privado. A RLS do storage exige o prefixo da própria empresa. */
export async function uploadFile(orgId: string, folder: string, file: Blob & { type: string; size: number }, allowXml = false) {
  const bad = validateFile(file, allowXml);
  if (bad) throw new Error(bad);
  const path = `${orgId}/${folder}/${crypto.randomUUID()}.${ext(file.type)}`;
  const { error } = await getSupabase()!.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error("Não foi possível enviar o arquivo. Tente de novo.");
  return path;
}

export async function signedUrl(path: string) {
  const { data } = await getSupabase()!.storage.from(BUCKET).createSignedUrl(path, 600);
  return data?.signedUrl ?? null;
}
