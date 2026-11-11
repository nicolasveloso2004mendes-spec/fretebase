"use client";
import { useState } from "react";
import { signedUrl, uploadFile, validateFile } from "@/lib/storage";
import { Button } from "./ui";

/** Escolhe/fotografa um arquivo e envia para o storage privado. Devolve o caminho via onChange. */
export function FileField({
  label, orgId, folder, value, onChange, camera = false, allowXml = false,
}: { label: string; orgId: string; folder: string; value: string | null; onChange: (path: string | null) => void; camera?: boolean; allowXml?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const bad = validateFile(f, allowXml);
    if (bad) return setErr(bad);
    setBusy(true);
    setErr(null);
    try {
      onChange(await uploadFile(orgId, folder, f, allowXml));
    } catch (x) {
      setErr((x as Error).message);
    }
    setBusy(false);
  }

  return (
    <div className="text-sm font-semibold text-pine-900">
      <span>{label}</span>
      <div className="mt-1.5 flex flex-wrap items-center gap-3">
        <label className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-line bg-white px-4 font-bold text-ink hover:bg-paper">
          {busy ? "Enviando…" : value ? "Trocar arquivo" : camera ? "Tirar foto / escolher" : "Escolher arquivo"}
          <input type="file" accept={allowXml ? "image/*,application/pdf,.xml,text/xml" : "image/*,application/pdf"} capture={camera ? "environment" : undefined} className="sr-only" onChange={pick} disabled={busy} />
        </label>
        {value && (
          <>
            <span className="text-xs font-semibold text-green-800">Arquivo anexado</span>
            <Button variant="ghost" onClick={() => onChange(null)}>Remover</Button>
          </>
        )}
      </div>
      {err && <p role="alert" className="mt-1 text-xs font-semibold text-danger">{err}</p>}
    </div>
  );
}

/** Link que abre um arquivo privado por URL assinada (10 min). */
export function FileLink({ path, children = "Ver arquivo" }: { path: string | null | undefined; children?: React.ReactNode }) {
  const [busy, setBusy] = useState(false);
  if (!path) return null;
  return (
    <button
      type="button"
      className="font-semibold text-pine-700 underline underline-offset-4"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const url = await signedUrl(path);
        setBusy(false);
        if (url) window.open(url, "_blank", "noopener,noreferrer");
        else alert("Não foi possível abrir o arquivo.");
      }}
    >
      {busy ? "Abrindo…" : children}
    </button>
  );
}
