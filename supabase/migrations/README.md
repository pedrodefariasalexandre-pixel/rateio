# Migrations

Uma migration por arquivo, em SQL puro, no padrão da Supabase CLI:
`AAAAMMDDHHMMSS_descricao.sql` (ex.: `20261125120000_schema_inicial.sql`).

Regras:

- Nunca editar uma migration já aplicada; corrigir com uma nova.
- Toda tabela com dados do usuário tem `user_id` e RLS ligado (`auth.uid() = user_id`).
- Dados reais nunca entram aqui (nada de seeds com fatura, CPF ou chave PIX).
