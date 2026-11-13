export type Role = "proprietario" | "admin" | "operacional" | "financeiro" | "motorista" | "cliente";

export const ROLE_LABEL: Record<Role, string> = {
  proprietario: "Proprietário",
  admin: "Administrador",
  operacional: "Gestor operacional",
  financeiro: "Financeiro",
  motorista: "Motorista",
  cliente: "Cliente",
};

/** Espelha as funções app_is_staff / app_is_admin / app_is_reader do banco. A segurança real é a RLS; isto só organiza a tela. */
export const isAdmin = (r: Role | null) => r === "proprietario" || r === "admin";
export const isStaff = (r: Role | null) => isAdmin(r) || r === "operacional";
export const isReader = (r: Role | null) => isStaff(r) || r === "financeiro";

export type NavItem = { href: string; label: string; feature?: string; group?: string };

/** Recursos de cada plano (espelha public.plans.features). Só organiza o menu; limites de uso são aplicados no banco. */
export function hasFeature(features: string[] | null | undefined, f?: string) {
  if (!f) return true;
  if (!features) return true; // plano ainda não carregado
  return features.includes(f);
}

export function navFor(role: Role | null, opts: { features?: string[] | null; superadmin?: boolean } = {}): NavItem[] {
  let base: NavItem[];
  if (role === "motorista") base = [{ href: "/motorista", label: "Minhas viagens" }];
  else if (role === "cliente")
    base = [
      { href: "/portal", label: "Minhas entregas" },
      { href: "/portal/cotacao", label: "Solicitar cotação" },
      { href: "/portal/propostas", label: "Propostas" },
      { href: "/portal/avisos", label: "Avisos" },
    ];
  else {
    base = [
      { href: "/", label: "Dashboard", group: "Operação" },
      { href: "/cotacoes", label: "Cotações", group: "Operação" },
      { href: "/pedidos", label: "Pedidos", group: "Operação" },
      { href: "/viagens", label: "Viagens e recebimentos", group: "Operação" },
      { href: "/clientes", label: "Clientes", group: "Operação" },
      { href: "/alertas", label: "Central de alertas", group: "Operação" },
      { href: "/frota", label: "Painel da frota", feature: "frota", group: "Frota" },
      { href: "/veiculos", label: "Veículos", feature: "frota", group: "Frota" },
      { href: "/manutencao", label: "Manutenção", feature: "manutencao", group: "Frota" },
      { href: "/abastecimento", label: "Abastecimento", feature: "frota", group: "Frota" },
      { href: "/pneus", label: "Pneus", feature: "frota", group: "Frota" },
      { href: "/fiscal", label: "Central Fiscal", feature: "documentos", group: "Fiscal" },
      { href: "/ciot", label: "Controle de CIOT", feature: "documentos", group: "Fiscal" },
      { href: "/seguros", label: "Seguros", feature: "documentos", group: "Fiscal" },
      { href: "/pedagios", label: "Pedágios", feature: "documentos", group: "Fiscal" },
      { href: "/conformidade", label: "Conformidade operacional", feature: "documentos", group: "Fiscal" },
      { href: "/inteligencia", label: "Inteligência de negócios", feature: "relatorios", group: "Gestão" },
      { href: "/assistente", label: "Fretebase AI", feature: "assistente", group: "Gestão" },
      { href: "/comunicacao", label: "Comunicação", feature: "automacoes", group: "Gestão" },
      { href: "/suporte", label: "Suporte", group: "Conta" },
    ];
    if (isAdmin(role)) {
      base.push({ href: "/link-cotacao", label: "Link de cotação", group: "Operação" });
      base.push({ href: "/equipe", label: "Equipe e motoristas", group: "Conta" });
      base.push({ href: "/assinatura", label: "Assinatura e plano", group: "Conta" });
      base.push({ href: "/configuracoes", label: "Configurações", group: "Conta" });
      base.push({ href: "/privacidade", label: "Privacidade (LGPD)", group: "Conta" });
    }
  }
  if (role !== "motorista") base.push({ href: "/conta", label: "Minha conta e segurança", group: "Conta" });
  if (opts.superadmin) base.push({ href: "/master", label: "Painel NicoTech", group: "NicoTech" });
  return base.filter((n) => hasFeature(opts.features, n.feature));
}

/** Telas que cada papel pode abrir (o resto redireciona). */
export function canOpen(role: Role | null, path: string, superadmin = false) {
  if (path.startsWith("/master")) return superadmin;
  if (role === "motorista") return path.startsWith("/motorista");
  if (role === "cliente") return path.startsWith("/portal") || path.startsWith("/conta");
  if (path.startsWith("/portal")) return false;
  if (["/equipe", "/link-cotacao", "/configuracoes", "/privacidade", "/assinatura"].some((p) => path.startsWith(p))) return isAdmin(role);
  if (path.startsWith("/motorista")) return false;
  return isReader(role);
}

export const homeFor = (role: Role | null) => (role === "motorista" ? "/motorista" : role === "cliente" ? "/portal" : "/");
