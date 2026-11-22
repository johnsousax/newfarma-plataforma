# Guia completo: App de Farmácia com Claude Code e conectores MCP (orçamento baixo)

> Projeto pessoal. Este guia mostra o caminho do zero até o app rodando de verdade,
> gastando o mínimo possível. Base: o código que já existe em `app-farmacia/`.
>
> Aviso: nenhum valor de preço foi colocado aqui de propósito. Planos e taxas mudam.
> Sempre confira no site oficial antes de assinar. Onde algo é opinião ou estimativa, está escrito.

---

## Sumário

1. O que você vai construir
2. Antes do código: o que a lei exige (ANVISA, CRF, LGPD)
3. Ferramentas e custo (pilha de baixo custo)
4. Conectores MCP: quais usar e para quê
5. Configuração inicial do Claude Code
6. Plano em fases (com prompts prontos para colar)
7. Segurança: checklist obrigatório
8. Integrações: WhatsApp, iFood, pagamento, ANVISA
9. Agente de IA no WhatsApp
10. App no celular (APK)
11. Checklist antes de colocar no ar
12. Erros comuns que custam caro
13. Próximos passos

---

## 1. O que você vai construir

Um sistema com 4 partes:

| Parte | Para quem | O que faz |
|---|---|---|
| Loja online (site e app) | Cliente | Ver produtos, buscar, comprar, enviar receita, acompanhar pedido |
| Painel de gestão | Dono e funcionários | Estoque por lote e validade, pedidos, preços, relatórios |
| Atendente de IA no WhatsApp | Cliente | Tira dúvidas, consulta estoque, status do pedido, passa para o farmacêutico |
| Integrações | Sistema | iFood, pagamento (Pix e cartão), e-mail, base de registros da ANVISA |

O projeto atual (`app-farmacia/`) já tem a base: catálogo, regras ANVISA, estoque por lote,
simulação de iFood e WhatsApp. Ele guarda dados em memória (some quando reinicia).
O primeiro passo real é trocar isso por um banco de dados de verdade.

---

## 2. Antes do código: o que a lei exige

Isto não é programação, mas sem isto o app não pode vender. Fonte: conhecimento geral das normas.
Confirme tudo com um advogado ou com o CRF do seu estado antes de abrir.

### Documentos da farmácia

- CNPJ com atividade de comércio de medicamentos.
- AFE (Autorização de Funcionamento de Empresa), emitida pela ANVISA.
- Licença sanitária da Vigilância Sanitária do município.
- Registro no CRF (Conselho Regional de Farmácia).
- Farmacêutico responsável técnico, presente no horário de funcionamento.

### Regras para vender pela internet (RDC 44/2009 e normas ligadas)

- Só farmácia com loja física aberta e licenciada pode vender online.
- O site precisa mostrar: razão social, CNPJ, endereço, AFE, licença sanitária,
  nome e CRF do farmacêutico responsável. A norma pede domínio `.com.br`.
- Medicamentos controlados (Portaria 344/98, tarja preta e parte da tarja vermelha com retenção de receita):
  **não podem ser vendidos pela internet.** O app deve bloquear.
- Medicamentos com receita simples: exigem a receita antes de liberar.
- Propaganda de medicamento segue regras próprias (RDC 96/2008). Nada de "compre 2 leve 3" em remédio de receita.
- Controlados vendidos no balcão são registrados no SNGPC (sistema da ANVISA). Isso fica no sistema da loja, não no app online.

### LGPD

- Receita, remédio comprado e condição de saúde são **dados sensíveis**. Exigem consentimento claro e proteção forte.
- Precisa de: política de privacidade, termo de uso, forma de o cliente pedir para apagar os dados,
  e um responsável (encarregado) pelos dados.

---

## 3. Ferramentas e custo (pilha de baixo custo)

Recomendação para começar gastando pouco. "Grátis para começar" quer dizer que existe plano gratuito
com limites. Confira os limites atuais em cada site.

| Necessidade | Ferramenta recomendada | Custo para começar | Observação |
|---|---|---|---|
| Programar | Claude Code (assinatura Claude) | Assinatura que você já tem | Faz o código, testes e deploy por você |
| Banco de dados, login, arquivos | Supabase | Grátis para começar | Plano grátis pausa projeto parado. Para loja real, considere o plano pago |
| Hospedagem do site | Vercel | Grátis para começar | **Plano grátis (Hobby) é só para uso não comercial.** Loja vendendo de verdade precisa do plano pago, ou use Cloudflare Pages |
| Automações (WhatsApp, avisos) | n8n | Grátis se instalar no seu servidor; pago na nuvem | Já tem conector MCP |
| WhatsApp oficial | WhatsApp Cloud API (Meta) | Paga por mensagem enviada pela empresa | Respostas dentro de 24h após o cliente falar costumam ser grátis. Confira a tabela da Meta |
| IA do atendente | API da Anthropic (modelo Haiku) | Paga por uso | Haiku é o mais barato. Use cache de prompt |
| E-mail (confirmação de pedido) | Resend | Grátis para começar | Já tem conector MCP |
| Pagamento | Mercado Pago, Asaas ou Stripe | Sem mensalidade, taxa por venda | Compare taxas de Pix e cartão |
| Código guardado | GitHub | Grátis | Repositório privado |
| Domínio `.com.br` | Registro.br | Anual | Exigência da norma para farmácia |
| App Android | Capacitor + Google Play | Taxa única de cadastro na Play | Comece com PWA (grátis) |

### Ordem de gasto sugerida (para não gastar antes da hora)

1. Agora: nada além do Claude Code. Tudo em plano grátis, só testes.
2. Quando for abrir para clientes: domínio `.com.br`, Supabase pago, hospedagem comercial.
3. Quando tiver volume: WhatsApp oficial e IA (pagos por uso, crescem com as vendas).
4. Por último: conta na Google Play.

---

## 4. Conectores MCP: quais usar e para quê

MCP é o que deixa o Claude Code mexer direto nos serviços (criar tabela, publicar site, montar automação)
sem você entrar em cada painel. Situação verificada nesta sessão:

### Conectados e prontos

| Conector | Use para | Gasta créditos? |
|---|---|---|
| **Supabase** | Criar o banco, tabelas, regras de acesso (RLS), migrações, funções no servidor, ver logs | Não (usa seu plano Supabase) |
| **Vercel** | Publicar o site, ver erros em produção, variáveis de ambiente, voltar versão | Não no plano grátis |
| **n8n** | Montar o fluxo do WhatsApp, avisos de estoque baixo, validade, pedido novo | Depende do seu plano n8n |
| **Resend** | E-mail de confirmação de pedido, recuperação de senha | Plano grátis cobre o começo |
| **Chrome DevTools** | Abrir o app no navegador, testar telas, medir velocidade (Lighthouse), achar erros | Não |
| **Google Drive** | Guardar documentos (AFE, licenças, políticas) e planilha de produtos | Não |
| **Lovable** | Gerar rapidamente um protótipo visual das telas | **Sim**, consome créditos do Lovable. Use pouco |
| **Canva** | Banners, logo, artes da loja | Plano grátis cobre o básico |
| **ElevenLabs / Fish Audio / Higgsfield** | Voz, vídeos e imagens de marketing | **Sim**. Opcional, deixe para depois |
| **Shopify** | Loja pronta | Não recomendo: a plataforma tem restrições para remédio com receita |

### Precisam de ação sua

| Conector | Situação | O que fazer |
|---|---|---|
| **GitHub** | Falhou ao conectar (erro de autorização) | Reconectar em `/mcp` no Claude Code ou nas configurações de conectores do claude.ai |
| **Stripe** | Precisa autorizar | Autorizar nas configurações de conectores do claude.ai (só se escolher Stripe) |
| **Figma, Notion, Linear** | Precisam autorizar | Opcionais. Notion ou Linear servem para organizar tarefas |

### Os 5 que importam de verdade (orçamento baixo)

**Supabase + Vercel + n8n + Resend + Chrome DevTools.** Com eles o app fica completo.
O resto é opcional.

---

## 5. Configuração inicial do Claude Code

### 5.1 Abrir o projeto

No Terminal:

```bash
cd /Users/a01/NexusUp-Projetos/app-farmacia
claude
```

### 5.2 Criar o arquivo de regras do projeto (CLAUDE.md)

Este arquivo é lido pelo Claude Code em toda conversa. Ele evita erro e economiza tempo (e uso do plano).
Peça ao Claude Code: "crie o CLAUDE.md com o conteúdo abaixo".

```markdown
# App Farmácia — regras do projeto

## Pilha
- Backend: Node.js 22 (ESM). Banco: Supabase (Postgres) com RLS em todas as tabelas.
- Front: HTML/JS em public/ (depois PWA). Hospedagem: Vercel.
- Automações: n8n. E-mail: Resend. IA: API da Anthropic, modelo Haiku.

## Regras de negócio que nunca podem quebrar
- Bloquear venda online de medicamento controlado (Portaria 344/98).
- Medicamento com receita: só libera o pedido depois que o farmacêutico aprova a receita.
- Estoque sai sempre do lote que vence primeiro. Lote vencido nunca é vendido.
- Toda página mostra dados da farmácia e do farmacêutico responsável.

## Segurança
- Nunca colocar chave, senha ou token no código. Usar .env (que está no .gitignore).
- CPF e receitas criptografados. Receitas em bucket privado com link temporário.
- Toda rota valida a entrada. Toda tabela tem RLS.

## Como trabalhar
- Sempre rodar `npm test` antes de dizer que terminou.
- Mudança no banco só por migração revisada. Nunca apagar dados.
- Respostas e textos do app em português do Brasil.
```

### 5.3 Dicas para gastar menos do plano

- Uma tarefa por conversa. Use `/clear` ao trocar de assunto.
- Peça um plano antes de tarefas grandes ("faça um plano, não programe ainda").
- Mande o Claude rodar os testes em vez de você testar na mão.
- `/code-review` (níveis baixos) revisa o código antes de publicar.
  O nível **ultra** (`/code-review ultra`) é uma revisão profunda na nuvem, com cobrança à parte.
  Guarde para antes do lançamento, uma vez só.

---

## 6. Plano em fases (com prompts prontos)

Cada fase termina com o app funcionando. Não pule a fase 0.
Prazos são estimativa para quem trabalha algumas horas por semana.

| Fase | Entrega | Estimativa |
|---|---|---|
| 0 | Documentos legais e decisões | 2 a 6 semanas (depende de órgãos públicos) |
| 1 | Banco de dados real e login | 1 semana |
| 2 | Loja com pedido e receita | 2 semanas |
| 3 | Pagamento online | 1 semana |
| 4 | Painel de gestão e alertas | 1 a 2 semanas |
| 5 | Atendente de IA no WhatsApp | 1 a 2 semanas |
| 6 | Integração iFood | 2 a 4 semanas (depende da homologação do iFood) |
| 7 | App Android | 1 semana |

### Fase 0 — Preparação (sem código)

- Separar AFE, licença sanitária, CRF do farmacêutico.
- Registrar o domínio `.com.br`.
- Criar contas grátis: Supabase, Vercel, GitHub, Resend.
- Planilha de produtos: nome, EAN (código de barras), registro ANVISA, preço, tipo (livre, receita, controlado).

### Fase 1 — Banco de dados real

Prompt para colar no Claude Code:

```
Use o conector do Supabase. Crie um projeto chamado app-farmacia.
Leia docs/ARQUITETURA.md e src/ e troque o armazenamento em memória por Postgres no Supabase.
Tabelas: produtos, lotes, clientes, pedidos, itens_pedido, receitas, auditoria.
Ative RLS em todas as tabelas, com regras: cliente só vê os próprios pedidos e receitas;
funcionário vê tudo da loja. Use migrações. Use Supabase Auth para login.
Crie um bucket privado "receitas". Rode get_advisors no fim e corrija os alertas de segurança.
Atualize os testes e rode npm test.
```

### Fase 2 — Loja com pedido e receita

```
Monte a loja em public/ como PWA, celular primeiro.
Telas: início, busca, produto, carrinho, envio de receita, checkout, meus pedidos.
Produto controlado: aparece com aviso "venda só na loja física" e sem botão de comprar.
Produto com receita: pede foto ou PDF da receita, que vai para o bucket privado.
Rodapé com dados da farmácia e do farmacêutico (RDC 44/2009).
Depois abra no Chrome DevTools, teste no tamanho de celular e rode o Lighthouse.
```

### Fase 3 — Pagamento

Escolha um: Mercado Pago ou Asaas (comuns no Brasil, Pix fácil) ou Stripe.

```
Integre pagamento com [Mercado Pago | Asaas | Stripe] em modo de teste (sandbox).
Pix e cartão. Confirmação só pelo webhook assinado, nunca pelo navegador.
Chaves só em variáveis de ambiente. Pedido com receita só cobra depois da aprovação do farmacêutico.
Mande e-mail de confirmação pelo Resend. Escreva testes para o webhook.
```

### Fase 4 — Painel de gestão

```
Crie o painel /admin com login de funcionário e de farmacêutico (papéis diferentes).
Telas: pedidos (fila), aprovar receita, estoque por lote, entrada de mercadoria por código de barras,
produtos, relatório de vendas e validade.
Use o conector do n8n para criar: alerta diário de estoque baixo e de lotes vencendo em 60 dias,
enviado por e-mail.
```

### Fase 5 — Atendente de IA no WhatsApp

Veja a seção 9. Prompt:

```
Use o conector do n8n. Crie um fluxo: recebe mensagem do WhatsApp Cloud API (webhook),
chama a API da Anthropic (modelo Haiku) com ferramentas: consultar_produto, status_pedido,
enviar_receita e chamar_farmaceutico. A IA nunca indica remédio nem dose: nesses casos
passa para o farmacêutico. Grave a conversa sem CPF. Teste com pin data antes de ativar.
```

### Fase 6 — iFood

```
Leia docs/INTEGRACOES.md. Implemente a integração real com a API de pedidos do iFood
(polling de eventos, confirmar, despachar, cancelar). Todo pedido do iFood passa pelas
mesmas regras ANVISA e de estoque. Deixe tudo atrás de uma chave IFOOD_ATIVO no .env
para ligar só depois da homologação.
```

### Fase 7 — App Android

```
Transforme o PWA em app Android com Capacitor. Gere o APK de teste e o AAB para a Play Store.
Ícone, tela de abertura e permissão de câmera (para foto da receita).
```

---

## 7. Segurança: checklist obrigatório

### Dados e acesso
- [ ] RLS ligado em todas as tabelas do Supabase (rodar `get_advisors` do conector).
- [ ] Receitas em bucket privado. Link de acesso expira em minutos.
- [ ] CPF criptografado no banco. Na tela, mostrar só parte (ex.: `***.456.789-**`).
- [ ] Senhas com hash (o Supabase Auth faz). Nunca guardar senha em texto.
- [ ] Bloqueio após várias tentativas de login erradas.
- [ ] Papéis separados: cliente, atendente, farmacêutico, administrador.
- [ ] Registro de auditoria: quem aprovou receita, quem mudou preço ou estoque.

### Código
- [ ] Nenhuma chave no código. `.env` no `.gitignore`.
- [ ] Chave secreta do Supabase (service role) **só no servidor**, nunca no navegador.
- [ ] Validação de toda entrada (tamanho, tipo, formato).
- [ ] Webhooks (pagamento, WhatsApp, iFood) com assinatura verificada.
- [ ] HTTPS sempre. Cabeçalhos de segurança (CSP, HSTS).
- [ ] `npm audit` sem falha grave.
- [ ] Upload de receita: aceitar só imagem e PDF, limite de tamanho.

### IA
- [ ] A IA não tem acesso direto ao banco. Só às ferramentas que você criou.
- [ ] A IA não recebe CPF nem receita.
- [ ] Mensagem do cliente tratada como texto, nunca como ordem para o sistema (proteção contra "injeção de prompt").
- [ ] Limite de mensagens por número para evitar gasto alto.

### LGPD
- [ ] Caixa de consentimento clara no cadastro (separada para dados de saúde).
- [ ] Política de privacidade e termos de uso publicados.
- [ ] Botão para o cliente baixar e apagar os próprios dados.
- [ ] Backup diário do banco, testado.

---

## 8. Integrações

### WhatsApp

| Opção | Prós | Contras | Recomendação |
|---|---|---|---|
| WhatsApp Cloud API (oficial, Meta) | Seguro, número verificado, não é banido | Precisa de conta Meta Business e modelos aprovados; paga por mensagem enviada | **Use esta** |
| APIs não oficiais (Evolution, Baileys e similares) | Grátis | Risco real de banimento do número; não serve para dado de saúde | Não use em farmácia |

Passos: criar app em developers.facebook.com, adicionar produto WhatsApp, verificar a empresa,
cadastrar o número, apontar o webhook para o n8n.

### iFood

- Portal de desenvolvedores do iFood (developer.ifood.com.br).
- Precisa ser loja parceira no iFood na categoria farmácia.
- A integração passa por homologação do iFood antes de ir para produção.
- Começo barato: use o próprio Portal do Parceiro do iFood e integre só quando o volume justificar.

### ANVISA (verificação de registro)

- Não existe, até onde sei, uma API oficial pública e documentada para consultar registro em tempo real.
- Caminho barato e confiável: a ANVISA publica a lista de medicamentos registrados em **dados abertos**
  (arquivo CSV no portal de dados abertos do governo). Importe esse arquivo no banco e atualize todo mês
  com uma automação no n8n.
- Na hora de cadastrar produto, o sistema confere o número de registro com essa lista e marca:
  registro válido, vencido ou não encontrado.
- Consulta manual: consultas.anvisa.gov.br.

### Pagamento

- Mercado Pago ou Asaas: Pix simples e muito usado no Brasil.
- Stripe: bom, tem conector MCP (precisa autorizar).
- Regra de ouro: o pedido só vira "pago" quando o webhook do gateway confirma.

---

## 9. Agente de IA no WhatsApp

### Como funciona

```
Cliente (WhatsApp) -> Meta Cloud API -> n8n (webhook) -> Claude Haiku (com ferramentas)
                                                 |-> API do app (estoque, pedido)
                                                 |-> Farmacêutico (quando precisa)
```

### O que a IA pode fazer
- Dizer se tem um produto e o preço.
- Informar status do pedido (depois de confirmar o telefone).
- Explicar como enviar a receita.
- Horário, endereço, entrega.

### O que a IA **não** pode fazer
- Indicar remédio, dose ou trocar um remédio por outro.
- Comentar sintomas. Sempre: "vou chamar o farmacêutico".
- Vender controlado.

### Instrução base para a IA (copie e ajuste)

```
Você é a atendente virtual da Farmácia [NOME], em [CIDADE].
Fale em português do Brasil, frases curtas e educadas.
Você pode: consultar produtos e preços, informar status de pedido, explicar como enviar receita,
informar horário e endereço.
Você nunca indica medicamento, dose, nem interpreta sintomas ou exames. Nesses casos, diga que
vai chamar o farmacêutico e use a ferramenta chamar_farmaceutico.
Medicamentos controlados só são vendidos na loja física, com receita.
Em emergência, oriente ligar 192 (SAMU).
Nunca peça CPF ou foto de documento pelo chat.
```

### Para gastar pouco com a IA
- Use o modelo Haiku (o mais barato da Anthropic).
- Ative cache de prompt na instrução base (ela se repete em toda mensagem).
- Perguntas comuns (horário, endereço) respondidas pelo n8n sem chamar a IA.
- Limite de mensagens por número por hora.

---

## 10. App no celular

1. **PWA primeiro (grátis):** o cliente "instala" pelo navegador. Funciona em Android e iPhone.
2. **Android (APK/AAB):** Capacitor transforma o PWA em app. Conta na Google Play tem taxa única.
3. **iPhone na App Store:** exige conta Apple paga por ano e um Mac (você já tem). Deixe para depois.

---

## 11. Checklist antes de colocar no ar

- [ ] Todos os testes passando (`npm test`).
- [ ] Revisão de código feita (`/code-review`; ultra uma vez antes do lançamento, se quiser).
- [ ] Migrações do banco revisadas.
- [ ] Backup do banco feito e testado.
- [ ] Variáveis de ambiente conferidas na Vercel (sem chave de teste em produção).
- [ ] Pagamento testado no modo sandbox e depois com uma compra real pequena.
- [ ] Bloqueio de controlados testado.
- [ ] Fluxo de receita testado (enviar, aprovar, recusar).
- [ ] Dados da farmácia e do farmacêutico visíveis em todas as páginas.
- [ ] Política de privacidade e termos publicados.
- [ ] Plano para voltar atrás: na Vercel, `request_rollback` volta para a versão anterior.

---

## 12. Erros comuns que custam caro

| Erro | Consequência | Como evitar |
|---|---|---|
| Publicar loja comercial no plano grátis da Vercel | Violação dos termos, site pode cair | Plano pago ou Cloudflare Pages |
| WhatsApp não oficial | Número banido, perda de clientes | Cloud API da Meta |
| Esquecer RLS no Supabase | Qualquer pessoa lê os dados de todos | `get_advisors` após cada mudança |
| Chave secreta no front | Banco exposto | Chave só no servidor |
| IA indicando remédio | Problema com CRF e risco ao cliente | Regra rígida e passagem ao farmacêutico |
| Vender controlado online | Infração sanitária grave | Bloqueio no código e teste automático |
| Gastar com Lovable, vídeo e IA de imagem cedo | Orçamento acaba antes do app | Só depois de vender |

---

## 13. Próximos passos (hoje)

1. Ler a seção 2 e começar os documentos da farmácia.
2. Criar contas grátis: Supabase, Vercel, GitHub, Resend.
3. Reconectar o GitHub no Claude Code (`/mcp`).
4. Abrir o Claude Code na pasta do projeto e criar o `CLAUDE.md` (seção 5.2).
5. Colar o prompt da Fase 1.

Documentos relacionados nesta pasta: `ARQUITETURA.md`, `CONFORMIDADE-ANVISA.md`, `SEGURANCA.md`, `INTEGRACOES.md`.

---

Desenvolvido por NexusUp Company · NexusUp.company
