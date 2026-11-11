-- Testes de RLS/gatilhos da Fase 3. Rodam numa transação que SEMPRE termina em erro (rollback):
-- nada é gravado. O resultado vem na mensagem do erro final (JSON).
do $t$
declare
  res jsonb := '[]'::jsonb;
  oa uuid := gen_random_uuid(); ob uuid := gen_random_uuid();
  uoa uuid := gen_random_uuid(); ufa uuid := gen_random_uuid(); uda uuid := gen_random_uuid(); uda2 uuid := gen_random_uuid(); uop uuid := gen_random_uuid(); uob uuid := gen_random_uuid();
  da uuid := gen_random_uuid(); da2 uuid := gen_random_uuid();
  va uuid := gen_random_uuid(); vb uuid := gen_random_uuid();
  ta uuid := gen_random_uuid(); ta2 uuid := gen_random_uuid(); tb uuid := gen_random_uuid();
  n int; v numeric; ok boolean; msg text; fl uuid;

begin
  -- cenário (como superusuário, ignora RLS)
  insert into orgs(id,name) values (oa,'Empresa A (teste)'),(ob,'Empresa B (teste)');
  insert into auth.users(id,aud,role,email) select x, 'authenticated','authenticated', x||'@teste.local' from unnest(array[uoa,ufa,uda,uda2,uop,uob]) x;
  delete from members where user_id in (uoa,ufa,uda,uda2,uop,uob);
  insert into members(user_id,org_id,role,full_name) values (uoa,oa,'proprietario','Dono A'),(ufa,oa,'financeiro','Fin A'),(uda,oa,'motorista','Mot A'),(uda2,oa,'motorista','Mot A2'),(uop,oa,'operacional','Op A'),(uob,ob,'proprietario','Dono B');
  insert into drivers(id,org_id,user_id,name) values (da,oa,uda,'Mot A'),(da2,oa,uda2,'Mot A2');
  insert into vehicles(id,user_id,org_id,name,consumption_km_l,odometer_km) values (va,uoa,oa,'Truck A',3,1000),(vb,uob,ob,'Truck B',3,500);
  insert into trips(id,user_id,org_id,origin,destination,freight_value,cost_total,planned_cost,driver_id,vehicle_id) values
    (ta,uoa,oa,'SP','RJ',5000,3000,3000,da,va),(ta2,uoa,oa,'SP','MG',4000,2000,2000,da2,va),(tb,uob,ob,'X','Y',7777,1,1,null,vb);

  -- helper: executa SQL como usuário autenticado
  -- (sem função auxiliar: set_config + set local role em cada bloco)

  -- T1 isolamento entre empresas (dono B tenta acessar dados da A)
  perform set_config('request.jwt.claims', json_build_object('sub',uob,'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from vehicles where id=va; res := res || jsonb_build_object('t','T1a dono B não lê veículo da A','ok', n=0);
  select count(*) into n from trips where id in (ta,ta2); res := res || jsonb_build_object('t','T1b dono B não lê viagens da A','ok', n=0);
  update vehicles set name='hack' where id=va; get diagnostics n = row_count; res := res || jsonb_build_object('t','T1c dono B não altera veículo da A','ok', n=0);
  delete from trips where id=ta; get diagnostics n = row_count; res := res || jsonb_build_object('t','T1d dono B não exclui viagem da A','ok', n=0);
  begin insert into vehicles(user_id,org_id,name,consumption_km_l) values (uob,oa,'invasor',1); ok:=false; exception when others then ok:=true; end;
  res := res || jsonb_build_object('t','T1e dono B não insere registro na org A','ok', ok);
  begin insert into trip_expenses(org_id,trip_id,kind,amount) values (ob,ta,'outros',1); ok:=false; exception when others then ok:=true; end;
  res := res || jsonb_build_object('t','T1f despesa da B ligada a viagem da A é barrada','ok', ok);
  select count(*) into n from members where org_id=oa; res := res || jsonb_build_object('t','T1g dono B não lê equipe da A','ok', n=0);
  begin insert into invites(org_id,email,role) values (oa,'x@x.com','admin'); ok:=false; exception when others then ok:=true; end;
  res := res || jsonb_build_object('t','T1h dono B não cria convite na org A','ok', ok);
  reset role;

  -- T2 financeiro: lê, não cria frota, pode registrar pagamento
  perform set_config('request.jwt.claims', json_build_object('sub',ufa,'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from trips where org_id=oa; res := res || jsonb_build_object('t','T2a financeiro lê viagens da própria empresa','ok', n=2);
  begin insert into vehicles(user_id,org_id,name,consumption_km_l) values (ufa,oa,'x',1); ok:=false; exception when others then ok:=true; end;
  res := res || jsonb_build_object('t','T2b financeiro não cadastra veículo','ok', ok);
  update trips set payment_status='pago', paid_at=current_date where id=ta; get diagnostics n=row_count; res := res || jsonb_build_object('t','T2c financeiro registra pagamento','ok', n=1);
  begin insert into drivers(org_id,name) values (oa,'x'); ok:=false; exception when others then ok:=true; end;
  res := res || jsonb_build_object('t','T2d financeiro não cadastra motorista','ok', ok);
  reset role;

  -- T3 operacional não administra equipe nem convites; motorista não escala papel
  perform set_config('request.jwt.claims', json_build_object('sub',uop,'role','authenticated')::text, true);
  set local role authenticated;
  begin insert into invites(org_id,email,role) values (oa,'y@y.com','admin'); ok:=false; exception when others then ok:=true; end;
  res := res || jsonb_build_object('t','T3a operacional não cria convite','ok', ok);
  update members set role='admin' where user_id=uop; get diagnostics n=row_count; res := res || jsonb_build_object('t','T3b operacional não promove a si mesmo','ok', n=0);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',uda,'role','authenticated')::text, true);
  set local role authenticated;
  update members set role='admin' where user_id=uda; get diagnostics n=row_count; res := res || jsonb_build_object('t','T3c motorista não promove a si mesmo','ok', n=0);
  reset role;
  select role into msg from members where user_id=uda; res := res || jsonb_build_object('t','T3d papel do motorista segue "motorista"','ok', msg='motorista');

  -- T4 motorista: só a própria viagem, sem dados financeiros
  perform set_config('request.jwt.claims', json_build_object('sub',uda,'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from driver_trips; res := res || jsonb_build_object('t','T4a motorista vê só 1 viagem (a dele)','ok', n=1);
  select count(*) into n from driver_trips where id=ta2; res := res || jsonb_build_object('t','T4b motorista não vê viagem de outro motorista','ok', n=0);
  select count(*) into n from trips; res := res || jsonb_build_object('t','T4c motorista não lê a tabela trips (frete/custo)','ok', n=0);
  begin execute 'select freight_value from driver_trips'; ok:=false; exception when others then ok:=true; end;
  res := res || jsonb_build_object('t','T4d visão do motorista não tem coluna de frete','ok', ok);
  update trips set status='entregue' where id=ta; get diagnostics n=row_count; res := res || jsonb_build_object('t','T4e motorista não altera viagem direto','ok', n=0);
  select count(*) into n from quotes; res := res || jsonb_build_object('t','T4f motorista não lê cotações','ok', n=0);
  select count(*) into n from clients; res := res || jsonb_build_object('t','T4g motorista não lê clientes','ok', n=0);

  -- T5 portão: sem checklist não inicia
  begin perform driver_start_trip(ta); ok:=false; exception when others then ok:=true; msg:=sqlerrm; end;
  res := res || jsonb_build_object('t','T5a sem checklist a viagem não inicia','ok', ok, 'detalhe', msg);
  -- checklist com item crítico
  insert into vehicle_checklists(org_id,trip_id,vehicle_id,driver_id,items) values (oa,ta,va,da,'{"freios":"critico","pneus":"ok"}');
  begin perform driver_start_trip(ta); ok:=false; exception when others then ok:=true; msg:=sqlerrm; end;
  res := res || jsonb_build_object('t','T5b checklist crítico bloqueia o início','ok', ok, 'detalhe', msg);
  -- motorista tenta se autorizar
  begin update vehicle_checklists set authorized_at=now(), authorization_note='eu mesmo' where trip_id=ta; get diagnostics n=row_count; ok:= n=0; exception when others then ok:=true; end;
  res := res || jsonb_build_object('t','T5c motorista não autoriza o próprio checklist','ok', ok);
  begin perform driver_start_trip(ta); ok:=false; exception when others then ok:=true; end;
  res := res || jsonb_build_object('t','T5d continua bloqueado após tentativa de autoescalada','ok', ok);
  reset role;
  -- gestão autoriza (sem motivo falha; com motivo passa)
  perform set_config('request.jwt.claims', json_build_object('sub',uoa,'role','authenticated')::text, true);
  set local role authenticated;
  begin update vehicle_checklists set authorized_at=now() where trip_id=ta; ok:=false; exception when others then ok:=true; end;
  res := res || jsonb_build_object('t','T5e autorização exige motivo','ok', ok);
  update vehicle_checklists set authorized_at=now(), authorization_note='Freio revisado na oficina' where trip_id=ta; get diagnostics n=row_count;
  res := res || jsonb_build_object('t','T5f gestão autoriza com motivo','ok', n=1);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',uda,'role','authenticated')::text, true);
  set local role authenticated;
  begin perform driver_start_trip(ta); ok:=true; exception when others then ok:=false; msg:=sqlerrm; end;
  res := res || jsonb_build_object('t','T5g após autorização o motorista inicia','ok', ok, 'detalhe', msg);
  select status into msg from driver_trips where id=ta; res := res || jsonb_build_object('t','T5h status virou em_viagem','ok', msg='em_viagem');

  -- T6 abastecimento ligado à viagem => 1 despesa, sem duplicar
  insert into fuel_logs(vehicle_id,driver_id,trip_id,date,odometer_km,liters,price_per_liter,total_value,full_tank) values (va,da,ta,current_date,1200,100,6,600,true) returning id into fl;
  select count(*), coalesce(sum(amount),0) into n, v from trip_expenses where trip_id=ta and kind='combustivel';
  res := res || jsonb_build_object('t','T6a abastecimento gera exatamente 1 despesa de combustível (600)','ok', n=1 and v=600);
  reset role;
  update fuel_logs set liters=110, total_value=660 where id=fl;
  select count(*), coalesce(sum(amount),0) into n, v from trip_expenses where trip_id=ta and kind='combustivel';
  res := res || jsonb_build_object('t','T6b editar o abastecimento não duplica (1 despesa de 660)','ok', n=1 and v=660);
  select odometer_km into v from vehicles where id=va; res := res || jsonb_build_object('t','T6c hodômetro do veículo atualizado pelo abastecimento','ok', v=1200);
  delete from fuel_logs where id=fl; select count(*) into n from trip_expenses where trip_id=ta and kind='combustivel';
  res := res || jsonb_build_object('t','T6d excluir abastecimento remove a despesa ligada','ok', n=0);

  -- T7 entrega: caminho de outra empresa é recusado; entrega válida muda status mas não o pagamento
  perform set_config('request.jwt.claims', json_build_object('sub',uda,'role','authenticated')::text, true);
  set local role authenticated;
  begin perform driver_deliver(ta,'Fulano','ok', array[ob::text||'/x.jpg'], null); ok:=false; exception when others then ok:=true; end;
  res := res || jsonb_build_object('t','T7a entrega com arquivo de outra empresa é recusada','ok', ok);
  begin perform driver_deliver(ta,'  ','ok', '{}', null); ok:=false; exception when others then ok:=true; end;
  res := res || jsonb_build_object('t','T7b entrega exige nome de quem recebeu','ok', ok);
  begin perform driver_deliver(ta2,'Fulano','ok', '{}', null); ok:=false; exception when others then ok:=true; end;
  res := res || jsonb_build_object('t','T7c motorista não entrega viagem de outro','ok', ok);
  perform driver_deliver(ta,'Fulano','Sem avarias', array[oa::text||'/entregas/a.jpg'], oa::text||'/assinaturas/s.png');
  select status into msg from driver_trips where id=ta; res := res || jsonb_build_object('t','T7d entrega válida marca entregue','ok', msg='entregue');
  begin perform driver_deliver(ta,'Fulano','dup', '{}', null); ok:=false; exception when others then ok:=true; end;
  res := res || jsonb_build_object('t','T7e entrega duplicada é recusada','ok', ok);
  reset role;
  select payment_status into msg from trips where id=ta; res := res || jsonb_build_object('t','T7f entrega NÃO altera pagamento (mantém o que já era: pago pelo financeiro no T2c)','ok', msg='pago');
  select count(*) into n from delivery_proofs where trip_id=ta; res := res || jsonb_build_object('t','T7g comprovante registrado como captura em tela','ok', n=1 and (select signature_kind from delivery_proofs where trip_id=ta)='captura_em_tela');
  select count(*) into n from trip_events where trip_id=ta; res := res || jsonb_build_object('t','T7h linha do tempo registrou eventos','ok', n>=3);

  -- T8 storage: prefixo da empresa
  begin
    perform set_config('request.jwt.claims', json_build_object('sub',uob,'role','authenticated')::text, true);
    set local role authenticated;
    insert into storage.objects(bucket_id,name,owner) values ('comprovantes', oa::text||'/invasao.jpg', uob); ok:=false;
  exception when others then ok:=true; end;
  reset role;
  res := res || jsonb_build_object('t','T8a empresa B não grava arquivo no prefixo da A','ok', ok);
  perform set_config('request.jwt.claims', json_build_object('sub',uoa,'role','authenticated')::text, true);
  set local role authenticated;
  begin insert into storage.objects(bucket_id,name,owner) values ('comprovantes', oa::text||'/ok.jpg', uoa); ok:=true; exception when others then ok:=false; msg:=sqlerrm; end;
  res := res || jsonb_build_object('t','T8b empresa A grava no próprio prefixo','ok', ok, 'detalhe', msg);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',uob,'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from storage.objects where bucket_id='comprovantes' and name like oa::text||'/%'; res := res || jsonb_build_object('t','T8c empresa B não enxerga arquivos da A','ok', n=0);
  reset role;
  select public into ok from storage.buckets where id='comprovantes'; res := res || jsonb_build_object('t','T8d bucket é privado','ok', ok=false);

  raise exception 'RESULTADO_TESTES:%', res::text;
end $t$;
