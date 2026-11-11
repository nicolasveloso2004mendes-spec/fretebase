# Fretebase — Segurança (Fases 6, 7 e 7.1)

## Teste de isolamento (executado no Supabase real, transação revertida, sem service_role)
Duas empresas fictícias + usuários reais do papel `authenticated`/`anon`. **20/20 aprovados**:
A não vê clientes/viagens/fiscal/chamados de B; A não insere em B; A não troca plano/status; A não altera B;
não-superadmin e anon não chamam `master_*`; `audit_log` não é editável/apagável; `platform_admins` invisível;
motorista não vê fiscal/clientes/chamados; anon não lê clientes/viagens; empresa suspensa perde acesso.
Limite: não cobre cliente do portal nem MFA aal1/aal2 (pendente testar com sessão real).

## Advisors do Supabase (após as migrações)
- ERRO `security_definer_view` (8 views `client_*`/`driver_trips`): intencional — filtram por `app_client_id()`/`app_org()`/motorista.
- WARN funções SECURITY DEFINER executáveis por `authenticated`: helpers de RLS e RPCs; cada RPC valida papel/empresa internamente.
- WARN `request_org_signup` para `anon`: intencional (pedido de cadastro, com limite por e-mail/dia).
- INFO RLS sem policy em `org_requests`, `platform_admins`, `platform_audit`: intencional (acesso só via RPC master).
- WARN senha vazada desativada: indisponível no plano gratuito.

## Limitações conhecidas
Recursos do plano só escondem menu (o banco limita usuários, veículos e IA); teste vencido vira aviso (sem agendador);
alertas rodam ao abrir o app; limitador de requisições é por instância; backups não verificados (plano gratuito sem PITR);
sem integração real de WhatsApp, fiscal, pagamento ou rastreador; webhook exige variáveis de ambiente na Vercel.

## Migrações
Aplicadas e versionadas no Supabase (`supabase_migrations.schema_migrations`, 7 versões). Exportar para o repositório: `supabase db pull`. Rollback: restaurar backup/branch; não há SQL de rollback escrito (pendente).
