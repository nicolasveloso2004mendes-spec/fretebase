# Fretebase

Painel para transportadoras: simula o custo do frete, gera a proposta e acompanha pedidos, viagens e recebimentos.
Feito com Next.js (App Router), TypeScript, Tailwind CSS e Supabase (banco + login).

## 1. Banco de dados (Supabase, plano gratuito)

1. Crie uma conta em <https://supabase.com> e um novo projeto.
2. No projeto, abra **SQL Editor**, cole o conteúdo de `supabase/schema.sql` e clique em **Run**.
3. Em **Project Settings → API**, copie a **Project URL** e a chave **anon public**.
4. (Opcional) Em **Authentication → Providers → Email**, desligue "Confirm email" se quiser entrar logo após criar a conta.
5. Depois de criar a conta da transportadora, desligue novos cadastros em **Authentication → Sign In / Providers → Allow new users to sign up**, para ninguém mais criar acesso.

## 2. Rodar no computador

```bash
cp .env.example .env.local   # preencha as duas chaves
npm install
npm run dev                  # http://localhost:3000
```

## 3. Publicar na Vercel (gratuito)

1. Suba esta pasta para um repositório no GitHub.
2. Em <https://vercel.com> clique em **Add New → Project** e importe o repositório.
3. Em **Environment Variables**, cadastre:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_COMPANY_NAME` (opcional: nome que aparece na proposta)
4. Clique em **Deploy**.

## Como funciona o cálculo

- Distância total = ida (× 2 se incluir retorno vazio).
- Diesel = distância total ÷ consumo × preço do litro.
- Manutenção e pneus = distância total × custo por km.
- Custo da viagem = diesel + manutenção + pneus + pedágios + motorista + outras despesas.
- Impostos = % informado × valor do frete (confirme a alíquota com o contador).
- Sobra = frete − custo − impostos.
- Frete sugerido = custo ÷ (1 − impostos% − margem%).

## Segurança

Cada usuário só acessa os próprios dados (Row Level Security no Supabase). A chave `anon` é pública por desenho; nunca coloque a chave `service_role` neste projeto.
