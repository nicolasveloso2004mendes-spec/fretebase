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

## Pendências para você (NicoTech)
1. Razão social, CNPJ e endereço da NicoTech.
2. Nome e e-mail do **encarregado** (contato de privacidade). Pode ser você.
3. Advogado para revisar os 4 textos.
4. Confirmar onde o Vercel executa as funções (hoje há execução fora do Brasil → tratar como possível transferência internacional no contrato).
5. Contratar o plano pago do Supabase (backup).
