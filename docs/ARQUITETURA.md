# Arquitetura

```
 ┌──────────────┐   HTTPS/JSON    ┌───────────────────────────── API (Node.js) ─────────────────────────────┐
 │ App web/PWA  │ ──────────────▶ │ Router → rate limit → auth (JWT) → RBAC → validação → serviço           │
 │ (public/)    │ ◀── SSE ─────── │                                                                         │
 └──────────────┘                 │  services/   auth · anvisa · estoque · pedidos · pagamentos             │
                                  │  integrations/  ifood · whatsapp      lib/ crypto · store · eventos     │
 iFood ── webhook/polling ──────▶ │                                                                         │
 Meta WhatsApp ── webhook ──────▶ │  Barramento de eventos (estoque, alerta, pedido, atendimento)           │
 Gateway pgto ── webhook ───────▶ │      ├─▶ SSE do painel   ├─▶ notificação WhatsApp   └─▶ status no iFood  │
                                  └──────────────────────────────┬──────────────────────────────────────────┘
                                                                 ▼
                                          Store (JSON atômico; campos sensíveis AES-256-GCM)
                                          → em produção: PostgreSQL com a mesma interface
```

## Ciclo de vida do pedido

```
AGUARDANDO_RECEITA ──(farmacêutico aprova)──▶ AGUARDANDO_PAGAMENTO ──(gateway aprova)──▶ PAGO
        │                                            │                                     │
        └────────────── CANCELADO ◀──────────────────┴──── (estorno solicitado) ◀──────────┤
                                                                                           ▼
                         ENTREGUE ◀── SAIU_PARA_ENTREGA (iFood) ◀── EM_SEPARACAO (baixa FEFO + escrituração)
                         ENTREGUE ◀── PRONTO_PARA_RETIRADA ◀────────┘
```

- **Reserva** de estoque ao criar o pedido (tudo-ou-nada); **liberação** ao cancelar; **baixa** na dispensação.
- Pedidos com receita só podem ir para `EM_SEPARACAO` por um **farmacêutico**.
- Preço e total são sempre calculados no servidor.

## Endpoints principais

| Método | Rota | Acesso |
|---|---|---|
| GET | `/api/produtos?q=&categoria=` · `/api/produtos/:id` · `/api/categorias` | público |
| GET | `/api/farmacia` (CNPJ, AFE, RT/CRF) | público |
| POST | `/api/auth/registrar` · `/api/auth/login` · `/api/auth/logout` · GET `/api/auth/eu` | público / logado |
| POST | `/api/pedidos` · `/api/pedidos/:id/receitas` · `/api/pedidos/:id/pagar` | cliente |
| GET | `/api/pedidos` · `/api/pedidos/:id` · POST `/api/pedidos/:id/cancelar` | dono ou equipe |
| POST | `/api/pedidos/:id/status` | equipe |
| GET/POST | `/api/receitas` · `/api/receitas/:id/arquivo` · `/api/receitas/:id/avaliar` | farmacêutico |
| GET | `/api/estoque` · `/api/estoque/alertas` · `/api/estoque/movimentos` · `/api/estoque/stream` (SSE) | equipe |
| POST | `/api/estoque/:id/entrada` · `/api/estoque/:id/ajuste` | equipe |
| GET | `/api/anvisa/escrituracao` | farmacêutico/admin |
| POST | `/api/produtos` · PATCH `/api/produtos/:id` · POST `/api/usuarios/equipe` | admin |
| GET/POST | `/api/ifood/status` · `/api/ifood/sincronizar-catalogo` | admin |
| POST | `/api/atendimento/chat` (simulador) | logado |
| GET/POST | `/api/atendimento/conversas[/:id][/responder\|/encerrar]` | equipe |
| GET | `/api/auditoria` · `/api/auditoria/verificar` | admin |
| GET/POST | `/api/webhooks/whatsapp` · POST `/api/webhooks/ifood` · `/api/webhooks/pagamento` | assinatura HMAC |
| POST | `/api/dev/...` (simuladores PIX e iFood) | **só fora de produção** |

## Evolução recomendada para produção
- Trocar `Store` por **PostgreSQL** (transações para reserva de estoque; `SELECT … FOR UPDATE`).
- Armazenar receitas em **object storage** (S3/GCS) com cifra no cliente e URL assinada de curta duração.
- Fila (BullMQ/SQS) para chamadas externas (iFood, WhatsApp, SNGPC) com retry/backoff.
- App mobile nativo (React Native/Flutter) consumindo a mesma API; o front atual já é PWA instalável.
- Observabilidade: logs estruturados sem dados pessoais, métricas e alertas.
