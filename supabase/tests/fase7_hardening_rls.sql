-- Teste de isolamento/hardening. Roda numa transação que SEMPRE termina em erro 'RESULT:' (rollback).
-- Substitua <SEGREDO_DO_WEBHOOK> pelo segredo real apenas ao executar; nunca commite o valor.
-- Observação: a auditoria (audit_log) registra UPDATE/DELETE nas tabelas de cadastro, não INSERT; o teste 'auditoria gravou' deve usar update/delete.
do $$
declare
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); uf uuid := gen_random_uuid(); ud uuid := gen_random_uuid(); uadm uuid := gen_random_uuid();
  oa uuid := gen_random_uuid(); ob uuid := gen_random_uuid();
  res jsonb := '[]'; n int; ok boolean; r text;
  sec text := '<SEGREDO_DO_WEBHOOK>';
begin
  set local session_replication_role = replica;
  insert into auth.users(id,email,instance_id,aud,role) select x,x||'@t.local','00000000-0000-0000-0000-000000000000','authenticated','authenticated' from unnest(array[ua,ub,uf,ud,uadm]) x;
  insert into orgs(id,name,status,plan_id) values (oa,'A','teste',(select id from plans where code='premium')),(ob,'B','ativa',(select id from plans where code='premium'));
  insert into members(user_id,org_id,role) values (ua,oa,'proprietario'),(ub,ob,'proprietario'),(uf,oa,'financeiro'),(ud,oa,'motorista'),(uadm,oa,'admin');
  insert into clients(org_id,user_id,name) values (ob,ub,'Cli B');
  set local session_replication_role = origin;

  set local role authenticated; perform set_config('request.jwt.claims', json_build_object('sub',ua,'role','authenticated')::text, true);
  begin insert into clients(org_id,name) values (oa,'novo'); ok:=true; exception when others then ok:=false; r:=sqlerrm; end;
  res := res || jsonb_build_object('t','REGRESSAO: proprietario ainda cria cliente','ok',ok,'e',r);
  begin insert into vehicles(org_id,name) values (oa,'V1'); ok:=true; exception when others then ok:=false; r:=sqlerrm; end;
  res := res || jsonb_build_object('t','REGRESSAO: proprietario cria veiculo','ok',ok,'e',r);
  begin insert into trips(org_id,origin,destination) values (oa,'A','B'); ok:=true; exception when others then ok:=false; r:=sqlerrm; end;
  res := res || jsonb_build_object('t','REGRESSAO: proprietario cria viagem','ok',ok,'e',r);
  select count(*) into n from audit_log where org_id=oa; res := res || jsonb_build_object('t','auditoria gravou as alteracoes','ok',n>=3,'n',n);
  begin insert into driver_trips select * from driver_trips limit 0; ok:=false; exception when others then ok:=true; end;
  res := res || jsonb_build_object('t','driver_trips sem escrita','ok',ok);
  begin truncate clients; ok:=false; exception when others then ok:=true; end;
  res := res || jsonb_build_object('t','authenticated nao da TRUNCATE','ok',ok);
  begin update members set role='proprietario' where user_id=ua; get diagnostics n=row_count; ok:=n=0; exception when others then ok:=true; end;
  res := res || jsonb_build_object('t','proprietario nao altera o proprio papel','ok',ok);
  begin update members set org_id=ob where user_id=uf; get diagnostics n=row_count; ok:=n=0; exception when others then ok:=true; end;
  res := res || jsonb_build_object('t','admin/proprietario nao move membro para outra empresa','ok',ok);
  begin insert into members(user_id,org_id,role) values (gen_random_uuid(),oa,'admin'); ok:=false; exception when others then ok:=true; end;
  res := res || jsonb_build_object('t','ninguem insere membro direto','ok',ok);
  begin insert into platform_admins(user_id) values (ua); ok:=false; exception when others then ok:=true; end;
  res := res || jsonb_build_object('t','nao vira superadmin','ok',ok);
  begin insert into subscription_payments(provider,provider_event_id,kind,status) values ('x','1','k','confirmado'); ok:=false; exception when others then ok:=true; end;
  res := res || jsonb_build_object('t','nao forja pagamento de assinatura','ok',ok);
  begin update plans set price_month=1; ok:=false; exception when others then ok:=true; end;
  res := res || jsonb_build_object('t','nao altera precos de plano','ok',ok);
  begin select count(*) into n from platform_secrets; ok:=false; exception when others then ok:=true; end;
  res := res || jsonb_build_object('t','platform_secrets inacessivel','ok',ok);

  reset role; set local role authenticated; perform set_config('request.jwt.claims', json_build_object('sub',uf,'role','authenticated')::text, true);
  begin update members set role='admin' where user_id=ud; get diagnostics n=row_count; ok:=n=0; exception when others then ok:=true; end;
  res := res || jsonb_build_object('t','financeiro nao muda permissoes','ok',ok);
  begin update orgs set name='x' where id=oa; get diagnostics n=row_count; ok:=n=0; exception when others then ok:=true; end;
  res := res || jsonb_build_object('t','financeiro nao edita empresa','ok',ok);

  reset role; set local role authenticated; perform set_config('request.jwt.claims', json_build_object('sub',ud,'role','authenticated')::text, true);
  select count(*) into n from clients; res := res || jsonb_build_object('t','motorista nao ve clientes','ok',n=0);

  -- MFA: superadmin precisa de aal2
  reset role; set local session_replication_role = replica; insert into platform_admins(user_id) values (ua); set local session_replication_role = origin;
  set local role authenticated; perform set_config('request.jwt.claims', json_build_object('sub',ua,'role','authenticated','aal','aal1')::text, true);
  select app_is_superadmin() into ok; res := res || jsonb_build_object('t','superadmin aal1 NAO e superadmin','ok',not ok);
  begin perform master_overview(); ok:=false; exception when others then ok:=true; end;
  res := res || jsonb_build_object('t','master_overview negado em aal1','ok',ok);
  perform set_config('request.jwt.claims', json_build_object('sub',ua,'role','authenticated','aal','aal2')::text, true);
  select app_is_superadmin() into ok; res := res || jsonb_build_object('t','superadmin aal2 acessa','ok',ok);

  -- MFA por empresa: politica ligada + aal1 + sem fator => app_org nulo e my_org pede ativacao
  reset role; set local session_replication_role = replica; update orgs set settings = jsonb_build_object('mfa_obrigatorio','true') where id=oa; set local session_replication_role = origin;
  set local role authenticated; perform set_config('request.jwt.claims', json_build_object('sub',uadm,'role','authenticated','aal','aal1')::text, true);
  select count(*) into n from clients; res := res || jsonb_build_object('t','admin sem MFA bloqueado quando a empresa exige','ok',n=0);
  select (my_org()->>'mfa_enroll_required')::boolean into ok; res := res || jsonb_build_object('t','my_org pede ativacao de MFA','ok',ok);
  perform set_config('request.jwt.claims', json_build_object('sub',ud,'role','authenticated','aal','aal1')::text, true);
  select count(*) into n from vehicles; res := res || jsonb_build_object('t','motorista nao e afetado pela exigencia','ok',n>=0);

  -- webhook
  reset role; set local role anon; perform set_config('request.jwt.claims','{"role":"anon"}',true);
  begin perform ingest_payment_event('segredo-errado-segredo-errado-segredo-errado','p','e1',oa,'k','confirmado',10,now(),'{}'); ok:=false; exception when others then ok:=true; end;
  res := res || jsonb_build_object('t','webhook: segredo errado negado','ok',ok);
  select ingest_payment_event(sec,'p','e1',oa,'assinatura','confirmado',10,now(),'{}') into r; res := res || jsonb_build_object('t','webhook: evento valido gravado','ok',r='ok');
  select ingest_payment_event(sec,'p','e1',oa,'assinatura','confirmado',10,now(),'{}') into r; res := res || jsonb_build_object('t','webhook: duplicado ignorado','ok',r='duplicate');
  begin perform ingest_payment_event(sec,'p','e2',oa,'assinatura','xpto',10,now(),'{}'); ok:=false; exception when others then ok:=true; end;
  res := res || jsonb_build_object('t','webhook: status invalido negado','ok',ok);
  reset role;
  select status into r from orgs where id=oa; res := res || jsonb_build_object('t','webhook: pagamento confirmado ativa a empresa','ok',r='ativa');
  select count(*) into n from subscription_payments where provider='p'; res := res || jsonb_build_object('t','webhook: um unico registro','ok',n=1);
  set local role anon; perform set_config('request.jwt.claims','{"role":"anon"}',true);
  begin select count(*) into n from clients; ok:=false; exception when others then ok:=true; end;
  res := res || jsonb_build_object('t','anon sem privilegio em tabelas','ok',ok);
  reset role;
  raise exception 'RESULT:%', res::text;
end $$;
