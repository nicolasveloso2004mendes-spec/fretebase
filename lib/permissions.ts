export type Role = "proprietario" | "admin" | "operacional" | "financeiro" | "motorista" | "cliente";

export const ROLE_LABEL: Record<Role, string> = {
  proprietario: "Proprietário",
  admin: "Administrador",
  operacional: "Operacional",
  financeiro: "Financeiro",
  motorista: "Motorista",
  cliente: "Cliente",
};

/** Espelha as funções app_is_staff / app_is_admin / app_is_reader do banco. A segurança real é a RLS; isto só organiza a tela. */
export const isAdmin = (r: Role | null) => r === "proprietario" || r === "admin";
export const isStaff = (r: Role | null) => isAdmin(r) || r === "operacional";
export const isReader = (r: Role | null) => isStaff(r) || r === "financeiro";

export type NavItem = { href: string; label: string };

export function navFor(role: Role | null): NavItem[] {
  if (role === "motorista") return [{ href: "/motorista", label: "Minhas viagens" }];
  if (role === "cliente") return [{ href: "/", label: "Início" }];
  const base: NavItem[] = [
    { href: "/", label: "Dashboard" },
    { href: "/cotacoes", label: "Cotações" },
    { href: "/pedidos", label: "Pedidos" },
    { href: "/viagens", label: "Viagens e recebimentos" },
    { href: "/clientes", label: "Clientes" },
    { href: "/frota", label: "Painel da frota" },
    { href: "/veiculos", label: "Veículos" },
    { href: "/manutencao", label: "Manutenção" },
    { href: "/abastecimento", label: "Abastecimento" },
    { href: "/pneus", label: "Pneus" },
  ];
  if (isAdmin(role)) base.push({ href: "/equipe", label: "Equipe e motoristas" });
  return base;
}

/** Telas que cada papel pode abrir (o resto redireciona). */
export function canOpen(role: Role | null, path: string) {
  if (role === "motorista") return path.startsWith("/motorista");
  if (role === "cliente") return path === "/";
  if (path.startsWith("/equipe")) return isAdmin(role);
  if (path.startsWith("/motorista")) return false;
  return isReader(role);
}

export const homeFor = (role: Role | null) => (role === "motorista" ? "/motorista" : "/");
