# LGPD — documentos do Fretebase

> **Rascunhos para revisão de um advogado.** Não são aconselhamento jurídico e **não devem ser publicados** antes dessa revisão.
> Tudo entre `[COLCHETES]` precisa ser preenchido ou decidido.

| Arquivo | Para quê |
|---|---|
| `politica-de-privacidade.md` | Texto para usuários (motoristas, equipe, clientes finais). Publicar em página pública depois de revisado. |
| `termos-de-uso.md` | Condições de uso do sistema pela transportadora. |
| `contrato-operador.md` | Contrato de tratamento de dados entre a transportadora (controladora) e a NicoTech (operadora). |
| `plano-de-incidentes.md` | O que fazer se houver vazamento ou acesso indevido. |
| `retencao.md` | Prazos de guarda por tipo de dado e o que o sistema já faz sozinho. |

## Papéis (premissa a confirmar com o advogado)
- **Transportadora (cliente do Fretebase)** = controladora dos dados de seus motoristas, clientes e equipe.
- **NicoTech** = operadora: trata os dados em nome da transportadora, seguindo as instruções dela.
- **Suboperadores usados hoje:** Supabase (banco, autenticação e arquivos — projeto na região São Paulo), Vercel (hospedagem do aplicativo), Brevo (envio de e-mails do sistema) e Mercado Pago (cobrança da assinatura; só dados de quem paga).

## Dados já preenchidos
- Operadora: 69.667.882 NICOLAS VELOSO MENDES (nome fantasia NicoTech) — CNPJ 69.667.882/0001-40.
- Encarregado: Nicolas Veloso Mendes — contato.nicotech@gmail.com.

## O que ainda falta
1. **Endereço** da NicoTech (aparece como `[ENDEREÇO]`).
2. Trechos marcados **"padrão sugerido"** (prazos de 24 h, 30 e 90 dias, foro em Guarulhos, regra de cancelamento): conferir se você aceita.
3. Trechos marcados **"advogado"**: dependem de revisão jurídica.
4. Confirmar onde a Vercel executa as funções (hoje há execução fora do Brasil).
5. Contratar o plano pago do Supabase (backup).
6. Publicar a Política e os Termos em páginas públicas **só depois** da revisão do advogado.
