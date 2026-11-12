/** Descrição, em português simples, de cada recurso de plano (espelha public.plans.features). */
export const FEATURE_INFO: Record<string, { label: string; desc: string }> = {
  clientes: { label: "Clientes", desc: "Cadastro e histórico de clientes" },
  viagens: { label: "Viagens", desc: "Cotações, pedidos e controle de viagens" },
  recebimentos: { label: "Recebimentos", desc: "Contas a receber e cobranças" },
  dashboard: { label: "Dashboard", desc: "Visão geral da operação" },
  simulador: { label: "Simulador de frete", desc: "Calcula custo e margem do frete" },
  frota: { label: "Frota", desc: "Veículos, abastecimento e pneus" },
  motorista: { label: "Área do motorista", desc: "Acesso do motorista às suas viagens" },
  manutencao: { label: "Manutenção", desc: "Revisões e custos dos veículos" },
  documentos: { label: "Fiscal e documentos", desc: "CIOT, seguros, pedágios e conformidade" },
  relatorios: { label: "Relatórios", desc: "Inteligência de negócios e indicadores" },
  automacoes: { label: "Comunicação e alertas", desc: "Avisos e mensagens automáticas" },
  portal_cliente: { label: "Portal do cliente", desc: "Seu cliente acompanha entregas e pede cotações" },
  integracoes: { label: "Integrações", desc: "Conexão com outros sistemas" },
  bi: { label: "Análises avançadas (BI)", desc: "Painéis avançados de resultado" },
  assistente: { label: "Fretebase AI", desc: "Perguntas sobre a sua operação. A versão com inteligência artificial está em lançamento (em breve)." },
};
