# 💊 New Farma Popular — e-commerce + backoffice

Site e sistema da **New Farma Popular** (newpopularfarma.com.br), no padrão das grandes redes: loja completa, conta do cliente com fidelidade e uso contínuo, e um backoffice com pedidos, receitas, PDV, estoque por lote, compras, promoções e relatórios. Tudo com as regras da ANVISA, LGPD e PCI embutidas.

**Stack:** Next.js 16 (App Router, Server Actions, Cache Components/PPR) · React 19 · TypeScript · Tailwind CSS 4 · PostgreSQL · Prisma 7 · Zod · Vitest.

## Como rodar (desenvolvimento)

Requisitos: **Node.js 22.12+**. Não precisa de Docker: o projeto sobe um PostgreSQL embutido.

```bash
cd plataforma
npm install
cp .env.example .env          # preencha APP_MASTER_KEY (npm run gerar-chave) e DEMO_PASSWORD
npm run dev                    # sobe o Postgres, aplica migrações, popula (1ª vez) e abre http://localhost:3000
```

| Perfil | E-mail | O que faz |
|---|---|---|
| Cliente | `cliente@farmacia.local` | compra, pontos, assinaturas, lembretes |
| Farmacêutica | `farmaceutico@farmacia.local` | valida receitas, dispensa antibióticos, PDV, escrituração |
| Gerente | `gerente@farmacia.local` | produtos, preços, promoções, compras, relatórios (loja Sol e Mar) |
| Atendente | `atendente@farmacia.local` | pedidos, PDV, clientes (loja Sol e Mar) |
| Admin | `admin@farmacia.local` | tudo + equipe, lojas e auditoria |

Senha: a que estiver em `DEMO_PASSWORD` no `.env`.

Outros comandos: `npm test` (testes de integração em banco separado) · `npm run db:seed` (recria os dados de demonstração) · `npm run db:studio` (navegar no banco) · `npm run build && npm start` (produção) · `npm run lint` · `npm run typecheck`.

## O que tem

**Loja**
- Home com banners, categorias, ofertas, mais vendidos e vitrines por categoria
- Busca com sugestões instantâneas, sem acento, por nome/princípio ativo/marca; filtros (marca, tipo, genérico, preço, disponível) e ordenação
- Página de produto: preço de/por, parcelamento, leve-X-pague-Y, bula resumida, dados técnicos, **genéricos equivalentes com economia**, "quem comprou levou também", estoque por loja, cálculo de frete, avaliações com compra verificada e JSON-LD para SEO
- Carrinho com cupom, barra de frete grátis e avisos de receita
- Checkout: entrega **expressa (2h)**, padrão ou **retirada na loja**, resgate de pontos, PIX ou cartão em até 6x (tokenizado no navegador)
- Acompanhamento do pedido com linha do tempo, PIX copia-e-cola, envio de receita, cancelamento e recompra

**Assistente virtual com IA (`/assistente`):** o cliente manda foto do remédio ou da receita e entende o que é e para que serve **segundo a bula**. Nunca indica tratamento, dose ou mistura. Encaminha ao farmacêutico, com fila no painel, e tem resposta imediata para emergências (192, 0800 722 6001, 188). Regras completas e revisão do RT em [docs/ASSISTENTE-IA.md](docs/ASSISTENTE-IA.md).

**Minha conta:** pedidos · endereços (autopreenchimento por CEP) · favoritos · **programa de pontos com níveis Bronze/Prata/Ouro** · **assinatura de uso contínuo (−10%)** · **lembrete de remédio** com aviso de recompra · dados, troca de senha, **exportação (portabilidade) e exclusão de conta (LGPD)**

**Também:** fotos de produto com galeria, recuperação de senha por e-mail, sitemap, robots e PWA instalável, termos de uso, parcelamento configurável (padrão 3x).

**Backoffice (`/admin`)**
- Visão geral: faturamento, pedidos, ticket médio, margem, gráficos, alertas
- Pedidos de todos os canais, com fluxo de status e baixa FEFO na separação
- **Atendimento farmacêutico**: fila das dúvidas encaminhadas pelo assistente (emergências no topo) e resposta pelo painel
- **Fila de receitas** para o farmacêutico (imagem cifrada, validade automática de 10/30 dias)
- **PDV de balcão** com leitor de código de barras, troco, pontos por CPF, abertura e fechamento de caixa, sangria e suprimento
- **Estoque por loja e lote**: posição, validade, alertas (ruptura, reposição, vencendo, vencido), entradas, ajustes e perdas
- **Compras**: sugestão automática de reposição, envio ao fornecedor e recebimento com lote e validade (atualiza o custo médio)
- Produtos e preços com **trava de PMC (CMED)**, histórico de preço e validação de registro ANVISA
- Promoções (% e leve-pague), cupons com regras e banners
- Moderação de avaliações, clientes com LTV e nível
- **Relatórios**: por dia, categoria, loja, canal, pagamento e entrega; **curva ABC**; exportação CSV
- **Escrituração ANVISA/SNGPC** com exportação
- Equipe com permissões por papel (RBAC), configuração das lojas e **trilha de auditoria encadeada por hash**

## Regras e segurança

- **ANVISA:** controlados (Portaria 344/98) não são vendidos online (RDC 44/2009). Antimicrobianos e tarja vermelha só seguem com receita aprovada por farmacêutico com CRF. Só farmacêutico dispensa itens com prescrição, e a escrituração é gerada automaticamente.
- **Estoque:** reserva FEFO com `SELECT … FOR UPDATE` (dois pedidos nunca levam a mesma unidade), tudo-ou-nada. Cancelamento libera a reserva, estorna o pagamento, devolve os pontos e o uso do cupom. PIX não pago expira em 30 min, por uma rotina em segundo plano.
- **Pagamentos:** o número do cartão nunca chega ao servidor (só um token). O valor é sempre calculado no servidor e a cobrança é idempotente.
- **LGPD:** CPF e receitas cifrados (AES-256-GCM, chaves derivadas por HKDF). Busca por CPF via HMAC. Senhas com scrypt. Consentimento registrado. Exportação e exclusão de conta.
- **Sessões** opacas no banco (revogáveis), cookie `httpOnly`/`SameSite`. Bloqueio após 5 tentativas e limite por IP.
- **Cabeçalhos:** CSP, `X-Frame-Options`, `nosniff`, HSTS em produção. Proxy barra o acesso sem sessão às áreas logadas.
- **Autorização** verificada em toda Server Action, com checagem de dono do recurso (sem IDOR).

## Estrutura

```
prisma/            schema (30 tabelas), migrações e seed de demonstração
scripts/           db.mjs (Postgres embutido) e dev.mjs (sobe tudo com um comando)
src/server/        regras de negócio: auth, carrinho, catálogo, preços, frete, estoque, pedidos,
                   pagamentos, receitas, auditoria, admin/relatorios, admin/operacoes (compras, PDV, caixa)
src/app/(loja)/    páginas da loja e da conta
src/app/admin/     backoffice
src/app/acoes/     Server Actions (validação com Zod + autorização)
src/components/    UI da loja, checkout, conta e painel
tests/             testes de integração (Vitest + Postgres real)
```

## Onde está no ar

| O quê | Onde |
|---|---|
| Prévia (produção do projeto novo) | https://newfarma-plataforma.vercel.app |
| Projeto Vercel | `newfarma-plataforma` (região iad1). Cada push na `main` publica sozinho; o diretório raiz é `plataforma/` |
| Código | https://github.com/johnsousax/newfarma-plataforma (privado) |
| Banco | Supabase "Fluxo zero", **schema `newfarma`**, usuário exclusivo `newfarma_app` (não acessa as tabelas dos outros projetos) |
| Site antigo | Projeto Vercel `newfarmapopular`, ainda servindo newpopularfarma.com.br até a virada |

Migrações em produção: `DATABASE_URL_MIGRACAO=<pooler porta 5432 ?schema=newfarma> npx prisma migrate deploy`.

## Antes de publicar (dados da New Farma)

Preencha no `.env`: **AFE**, **nome e CRF do farmacêutico responsável**, **WhatsApp**, telefone e e-mail. Em *Painel › Lojas*, ajuste o **endereço real da loja** e as **faixas de CEP** de entrega. Cadastre as **fotos** e os **preços reais** dos produtos. O catálogo do seed é fictício.

## Para produção

1. **Banco:** PostgreSQL gerenciado (Neon, Supabase, RDS…) em `DATABASE_URL`. Rode `npm run db:migrate` (não use o seed).
2. **Segredos:** `APP_MASTER_KEY` num cofre. Trocar a chave exige recifrar os dados.
3. **Gateway real:** substitua `src/lib/tokenizacao.ts` pelo SDK do gateway (Mercado Pago, Pagar.me, Stripe) e `src/server/pagamentos.ts` pela API dele, com webhook assinado.
4. **Arquivos de receita:** mova para object storage (S3/GCS) com URL assinada. Hoje ficam cifrados no Postgres.
5. **SNGPC, NF-e, iFood, WhatsApp e e-mail:** integrações reais (veja `../docs/INTEGRACOES.md`).
6. **Validação regulatória:** a farmacêutica responsável técnica e a assessoria regulatória devem revisar as regras sanitárias antes de operar.

> Marcas, produtos e registros ANVISA do seed são fictícios.
