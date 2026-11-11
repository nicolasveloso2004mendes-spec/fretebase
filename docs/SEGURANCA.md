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


## Atualização — hardening aplicado (migração `fase7_hardening_privilegios_webhook_mfa`)
Achados da auditoria: `anon` tinha grants totais em todas as tabelas (RLS bloqueava, mas era defesa em profundidade ausente);
`authenticated` tinha TRUNCATE/REFERENCES/TRIGGER e escrita em views (`driver_trips`). Corrigido: anon sem acesso a tabelas; authenticated sem
privilégios perigosos; views só leitura; tabelas de plataforma só via RPC.
- **Webhook sem service_role:** rota valida HMAC-SHA256 e chama `ingest_payment_event`, que confere o hash do segredo, é idempotente
  (provedor + id do evento) e só ativa empresa com status `confirmado`. Status aceitos: pendente, confirmado, falhou, estornado.
- **MFA:** superadmin exige sessão aal2 sempre; proprietário/admin/financeiro por política da empresa (Minha conta → exigir da equipe, desligada por padrão); desligar a exigência requer aal2.
- **Teste pós-hardening (transação revertida): 28 de 29 aprovados**; a 29ª foi premissa errada do teste (auditoria só registra UPDATE/DELETE em cadastros). `supabase/tests/fase7_hardening_rls.sql`.
- **Views `client_*`/`driver_trips`:** mantidas como SECURITY DEFINER por decisão (filtram por empresa/cliente/motorista; converter para invoker exigiria abrir SELECT nas tabelas-base ao cliente, o que expõe custos). Risco residual: um erro de filtro numa view vira vazamento — por isso há teste.
- **CSP** ativa (script-src com 'unsafe-inline' por exigência do Next; sem nonce).
- Rollback: `supabase/migrations/20261111180000_fase7_hardening_ROLLBACK.sql`.

## Não feito / pendente (honesto)
Restauração de backup não testada; SQL das migrações antigas não exportado para arquivos (usar `supabase db pull`); revogação de sessão só por "sair de todos os dispositivos";
rate limit de login é o do Supabase Auth (padrão); limitador do webhook é por instância; sem scan de dependências rodado fora do CI; Edge Functions: nenhuma existe;
confirmação adicional para operações críticas não implementada além da exigência de aal2 para desligar MFA; sem alertas automáticos de atividade suspeita.

## Teste de isolamento por papel e Storage (executado, transação revertida, tokens `authenticated` simulados por claims, sem service_role): 30/30
Motorista: vê só a própria viagem (view e RPC), não inicia/localiza viagem de outro motorista, não lê `trips`, não lê fiscal, só lê os próprios arquivos, não envia para pasta de outra empresa.
Cliente: vê só as próprias viagens e documentos **liberados**, não baixa documento não liberado nem de outro cliente, não lê despesas/`trips`/fotos de checklist, não envia arquivos.
Empresa B: não lê arquivos da A, não se move para A. Operacional: lê só a própria empresa. Ninguém renomeia/altera objetos do Storage.
Limites: o teste simula o JWT por claims (não é login real pela API); sessão revogada e URL assinada com expiração não foram testadas; o script deste teste não foi salvo no repositório.

## Teste de restauração (11/11/2026)

**O que foi feito:** projeto Supabase separado (`fretebase-restore-teste`) recriado do zero reaplicando, em ordem, as 8 migrations de produção.

**Resultado (comparação produção × restaurado):** idênticos em 41 tabelas, 585 colunas, 8 views, 88 políticas RLS (+2 de Storage), 55 funções (hash do código igual), 56 gatilhos, 78 índices, 41 tabelas com RLS ativo, bucket `comprovantes`, 3 planos e 147 permissões de `anon`/`authenticated` (hash igual).

**O que isto valida:** que o banco (estrutura, regras de acesso e funções) pode ser reconstruído do zero a partir do histórico de migrations.

**O que NÃO foi validado:**
- Restauração dos DADOS (linhas) — não foram copiados; o teste foi só de estrutura.
- Backup/PITR nativo do Supabase — indisponível no plano gratuito. Sem plano pago, não há backup automático dos dados.
- Arquivos do Storage.
- RTO/RPO medidos: não definidos nem medidos.

**Pendente:** contratar plano com backup diário/PITR e repetir o teste com dados reais antes de comercializar.
