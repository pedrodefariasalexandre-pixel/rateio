# Migrations

Uma migration por arquivo, em SQL puro, aplicadas em ordem pelo prefixo numérico
(`0001_schema.sql`, `0002_pin.sql`, ...). A próxima é `0005_descricao.sql`.

Regras:

- Nunca editar uma migration já aplicada; corrigir com uma nova.
- Toda tabela com dados do usuário tem `user_id` e RLS ligado (`(select auth.uid()) = user_id`).
- Dados reais nunca entram aqui (nada de seeds com fatura, CPF ou chave PIX).

O que cada migration faz e como testar: [../README.md](../README.md).
