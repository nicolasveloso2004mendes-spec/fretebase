import { XMLParser, XMLValidator } from "fast-xml-parser";

export const XML_MAX_BYTES = 2 * 1024 * 1024;

export type FiscalXml = {
  kind: "cte" | "nfe" | "mdfe";
  number: string | null;
  series: string | null;
  accessKey: string | null;
  issuedOn: string | null;
  issuerName: string | null;
  issuerDoc: string | null;
  recipientName: string | null;
  recipientDoc: string | null;
  serviceValue: number | null;
  cargoValue: number | null;
  origin: string | null;
  destination: string | null;
  plate: string | null;
  taxInfo: Record<string, string>;
  /** O XML traz protocolo da SEFAZ? Isso NÃO é consulta oficial: a situação continua "não verificada". */
  protocol: { present: boolean; cStat: string | null };
};

export type XmlResult = { ok: true; doc: FiscalXml } | { ok: false; error: string };

type Node = Record<string, unknown>;
const obj = (v: unknown): Node => (v && typeof v === "object" && !Array.isArray(v) ? (v as Node) : {});
const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === "object") return str((v as Node)["#text"]);
  const s = String(v).trim();
  return s ? s.slice(0, 300) : null;
};
const num = (v: unknown): number | null => {
  const s = str(v);
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const day = (v: unknown) => {
  const s = str(v);
  return s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
};
const key = (id: unknown, prefix: string, fallback: unknown) => {
  const fromId = (str(id) ?? "").replace(prefix, "");
  const k = /^\d{44}$/.test(fromId) ? fromId : (str(fallback) ?? "");
  return /^\d{44}$/.test(k) ? k : null;
};
const place = (city: unknown, uf: unknown) => [str(city), str(uf)].filter(Boolean).join("/") || null;
const docOf = (n: Node) => str(n.CNPJ) ?? str(n.CPF);

/**
 * Lê um XML de CT-e, NF-e ou MDF-e e extrai os dados principais.
 * Segurança: recusa DOCTYPE/ENTITY (XXE e "billion laughs"), não expande entidades e limita o tamanho.
 * Nada do conteúdo é executado ou interpretado como instrução.
 */
export function parseFiscalXml(text: string): XmlResult {
  if (typeof text !== "string" || !text.trim()) return { ok: false, error: "Arquivo vazio." };
  if (text.length > XML_MAX_BYTES) return { ok: false, error: "O XML passa de 2 MB." };
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) return { ok: false, error: "XML recusado: contém DOCTYPE/ENTITY, que não existe em documento fiscal." };
  if (XMLValidator.validate(text) !== true) return { ok: false, error: "O arquivo não é um XML bem formado." };

  let root: Node;
  try {
    root = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", processEntities: false, parseTagValue: false, removeNSPrefix: true }).parse(text) as Node;
  } catch {
    return { ok: false, error: "Não foi possível ler o XML." };
  }

  const cte = obj(obj(obj(root.cteProc).CTe).infCte ?? obj(root.CTe).infCte);
  const nfe = obj(obj(obj(root.nfeProc).NFe).infNFe ?? obj(root.NFe).infNFe);
  const mdfe = obj(obj(obj(root.mdfeProc).MDFe).infMDFe ?? obj(root.MDFe).infMDFe);

  if (Object.keys(cte).length) {
    const ide = obj(cte.ide), emit = obj(cte.emit), dest = obj(cte.dest), prot = obj(obj(obj(root.cteProc).protCTe).infProt);
    const icms = obj(obj(cte.imp).ICMS);
    const g = obj(Object.values(icms)[0]);
    const taxInfo: Record<string, string> = {};
    for (const [k, label] of [["CST", "CST"], ["vBC", "Base de cálculo"], ["pICMS", "Alíquota ICMS (%)"], ["vICMS", "Valor ICMS"]] as const) {
      const v = str(g[k]);
      if (v) taxInfo[label] = v;
    }
    for (const [k, label] of [["CFOP", "CFOP"], ["natOp", "Natureza da operação"]] as const) {
      const v = str(ide[k]);
      if (v) taxInfo[label] = v;
    }
    return {
      ok: true,
      doc: {
        kind: "cte", number: str(ide.nCT), series: str(ide.serie), accessKey: key(cte["@_Id"], "CTe", prot.chCTe), issuedOn: day(ide.dhEmi),
        issuerName: str(emit.xNome), issuerDoc: docOf(emit), recipientName: str(dest.xNome), recipientDoc: docOf(dest),
        serviceValue: num(obj(cte.vPrest).vTPrest), cargoValue: num(obj(obj(cte.infCTeNorm).infCarga).vCarga),
        origin: place(ide.xMunIni, ide.UFIni), destination: place(ide.xMunFim, ide.UFFim), plate: null, taxInfo,
        protocol: { present: Object.keys(prot).length > 0, cStat: str(prot.cStat) },
      },
    };
  }
  if (Object.keys(nfe).length) {
    const ide = obj(nfe.ide), emit = obj(nfe.emit), dest = obj(nfe.dest), prot = obj(obj(obj(root.nfeProc).protNFe).infProt);
    const en = obj(emit.enderEmit), dn = obj(dest.enderDest);
    return {
      ok: true,
      doc: {
        kind: "nfe", number: str(ide.nNF), series: str(ide.serie), accessKey: key(nfe["@_Id"], "NFe", prot.chNFe), issuedOn: day(ide.dhEmi),
        issuerName: str(emit.xNome), issuerDoc: docOf(emit), recipientName: str(dest.xNome), recipientDoc: docOf(dest),
        serviceValue: null, cargoValue: num(obj(obj(nfe.total).ICMSTot).vNF),
        origin: place(en.xMun, en.UF), destination: place(dn.xMun, dn.UF), plate: null, taxInfo: {},
        protocol: { present: Object.keys(prot).length > 0, cStat: str(prot.cStat) },
      },
    };
  }
  if (Object.keys(mdfe).length) {
    const ide = obj(mdfe.ide), emit = obj(mdfe.emit), prot = obj(obj(obj(root.mdfeProc).protMDFe).infProt);
    const veic = obj(obj(obj(obj(mdfe.infModal).rodo).veicTracao));
    return {
      ok: true,
      doc: {
        kind: "mdfe", number: str(ide.nMDF), series: str(ide.serie), accessKey: key(mdfe["@_Id"], "MDFe", prot.chMDFe), issuedOn: day(ide.dhEmi),
        issuerName: str(emit.xNome), issuerDoc: docOf(emit), recipientName: null, recipientDoc: null,
        serviceValue: null, cargoValue: num(obj(mdfe.tot).vCarga),
        origin: str(ide.UFIni), destination: str(ide.UFFim), plate: str(veic.placa), taxInfo: {},
        protocol: { present: Object.keys(prot).length > 0, cStat: str(prot.cStat) },
      },
    };
  }
  return { ok: false, error: "XML válido, mas não é CT-e, NF-e nem MDF-e." };
}

/** Sugere viagens para vincular: mesma rota (cidade ou UF) e data de coleta próxima da emissão. */
export function suggestTrips<T extends { id: string; origin: string; destination: string; pickup_date: string | null }>(doc: FiscalXml, trips: T[]): T[] {
  const norm = (s: string | null) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split("/")[0].trim();
  const o = norm(doc.origin), d = norm(doc.destination);
  const near = (a: string | null) => {
    if (!a || !doc.issuedOn) return false;
    return Math.abs(new Date(a).getTime() - new Date(doc.issuedOn).getTime()) <= 5 * 86400000;
  };
  return trips
    .map((t) => {
      const to = norm(t.origin), td = norm(t.destination);
      let score = 0;
      if (o && to.includes(o)) score += 2;
      if (d && td.includes(d)) score += 2;
      if (near(t.pickup_date)) score += 1;
      return { t, score };
    })
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((x) => x.t);
}
