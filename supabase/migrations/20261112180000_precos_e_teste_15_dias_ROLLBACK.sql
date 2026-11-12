update public.plans set price_month = 5  where code = 'essencial';
update public.plans set price_month = 10 where code = 'profissional';
update public.plans set price_month = 15 where code = 'premium';
-- (a função master_decide_request volta ao padrão de 14 dias reaplicando a versão da migração anterior)
