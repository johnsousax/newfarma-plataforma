# Integrações — como ativar em produção

Todas as integrações rodam em modo **`mock`** por padrão (simuladas e registradas localmente). Para usar as APIs reais, preencha o `.env` (veja `.env.example`) — **nunca** coloque credenciais em código.

## iFood (Merchant API) — `src/integrations/ifood.js`

1. Cadastre-se no **Portal do Desenvolvedor iFood** (developer.ifood.com.br), crie o aplicativo e vincule a loja.
2. `.env`: `IFOOD_MODO=live`, `IFOOD_CLIENT_ID`, `IFOOD_CLIENT_SECRET`, `IFOOD_MERCHANT_ID`.
3. Receba eventos de pedido por **webhook** em `POST https://SEU_DOMINIO/api/webhooks/ifood` (assinatura `X-IFood-Signature`) — o polling a cada 30 s também é iniciado como alternativa.

Fluxos implementados:
- **Pedido do app com entrega iFood**: ao marcar *Saiu para entrega*, o sistema solicita o entregador (iFood Envios/Sob Demanda), incluindo instrução de coleta da receita quando necessário.
- **Pedido do marketplace iFood**: evento `PLACED` → busca o pedido → mapeia itens por `externalCode` (= nosso SKU) → valida ANVISA + estoque → `confirm` ou `requestCancellation` com motivo.
- **Status**: em separação → `startPreparation`; saiu → `dispatch`; cancelado → `requestCancellation`.
- **Catálogo**: só MIP e não medicamentos são publicados; disponibilidade atualizada a cada mudança de estoque.

> O iFood versiona seus endpoints (`/order/v1.0`, `/catalog/v2.0`, `/shipping/v1.0`…). Confira a documentação vigente e a homologação exigida antes de ativar. A categoria farmácia no iFood pode ter regras próprias de sortimento.

## WhatsApp Business (Cloud API — Meta) — `src/integrations/whatsapp.js`

1. Crie um app em developers.facebook.com, adicione o produto **WhatsApp** e registre o número da farmácia.
2. `.env`: `WHATSAPP_MODO=live`, `WHATSAPP_TOKEN` (token permanente de usuário do sistema), `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN` (valor que você escolhe), `WHATSAPP_APP_SECRET`.
3. Configure o webhook: URL `https://SEU_DOMINIO/api/webhooks/whatsapp`, token de verificação = `WHATSAPP_VERIFY_TOKEN`, assine o campo `messages`.
4. Notificações iniciadas pela empresa fora da janela de 24 h exigem **templates aprovados** pela Meta (ex.: “pedido_status”) — adapte `enviar()` para usar `type: "template"` nesses casos.

O agente: menu, busca de produtos/preço/estoque, status e cancelamento de pedidos (cliente identificado pelo telefone cadastrado), orientações sobre receita, horário/dados legais, transferência para farmacêutico (aparece no *Painel › Atendimento* em tempo real). Dúvidas clínicas e emergências nunca são respondidas pelo robô.

> Para respostas em linguagem natural, o motor `responder()` pode ser complementado por um LLM — mantendo as mesmas travas (sem orientação clínica, sem dados de terceiros) antes do texto livre.

## Gateway de pagamento — `src/services/pagamentos.js`

Compatível com qualquer gateway com **tokenização no front** e **webhook assinado** (Mercado Pago, Pagar.me, Stripe, Adyen…):
1. Substitua `GatewaySimulado.tokenizar` em `public/app.js` pelo SDK JS do gateway (ajuste a CSP para o domínio do SDK).
2. Em `criar()`, troque a simulação pela chamada de cobrança do gateway com o token.
3. `.env`: `PAGAMENTO_MODO=live`, `PAGAMENTO_WEBHOOK_SECRET`; aponte o webhook para `POST /api/webhooks/pagamento` (ajuste o cabeçalho de assinatura ao padrão do gateway).
4. Os endpoints `/api/dev/*` são desativados automaticamente com `NODE_ENV=production`.
