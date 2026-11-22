# 💊 App Farmácia — venda online com conformidade ANVISA

> **🚀 Nova versão:** a plataforma completa (Next.js + PostgreSQL), com loja, conta do cliente e backoffice, está em [`plataforma/`](plataforma/README.md). Para rodar: `cd plataforma && npm install && npm run dev`.
> Esta pasta raiz mantém a versão 1 (Node sem dependências) como referência.


Aplicativo web (PWA) e API para uma farmácia vender online com:

| # | Funcionalidade | Onde está |
|---|---|---|
| 1 | **Catálogo** com preço, descrição, estoque e informação regulatória | `GET /api/produtos` · tela *Catálogo* |
| 2 | **Integração iFood** — entrega pela logística iFood, recebimento de pedidos do marketplace e sincronização de catálogo | `src/integrations/ifood.js` |
| 3 | **Estoque em tempo real** por lote (FEFO), reserva no pedido, alertas de reposição/ruptura/validade via SSE | `src/services/estoque.js` · *Painel › Estoque/Alertas* |
| 4 | **Conformidade ANVISA** — bloqueio de controlados, validação de receita por farmacêutico, escrituração p/ SNGPC | `src/services/anvisa.js` · [docs/CONFORMIDADE-ANVISA.md](docs/CONFORMIDADE-ANVISA.md) |
| 5 | **Atendimento WhatsApp** — agente automático + transferência para farmacêutico + notificações de pedido | `src/integrations/whatsapp.js` · tela *Atendimento* |
| 6 | **Segurança** — AES-256-GCM, scrypt, JWT, tokenização de cartão, webhooks assinados, auditoria encadeada | [docs/SEGURANCA.md](docs/SEGURANCA.md) |

**Zero dependências externas**: roda só com Node.js ≥ 22.9 (sem `npm install`).

## Como rodar

```bash
cd app-farmacia
npm start            # http://localhost:3000
```

No terminal aparecem os **usuários de demonstração** e a senha (gerada a cada execução, ou defina `DEMO_PASSWORD`):

| Perfil | E-mail | O que pode fazer |
|---|---|---|
| Cliente | `cliente@farmacia.local` | comprar, enviar receita, pagar, conversar no atendimento |
| Farmacêutico | `farmaceutico@farmacia.local` | validar receitas, dispensar pedidos, estoque, atendimento humano |
| Admin | `admin@farmacia.local` | tudo acima (exceto validar receita) + iFood, cadastro de produtos, auditoria |

Sem `.env`, o app roda com **chave temporária e dados em memória** (somem ao reiniciar). Para persistir:

```bash
cp .env.example .env
npm run gerar-chave       # cole o valor em APP_MASTER_KEY no .env
npm start                 # agora grava em data/db.json (campos sensíveis cifrados)
```

### Roteiro de demonstração
1. **Cliente**: adicione *Dipirona* ao carrinho → finalize com entrega → pague com cartão `4111 1111 1111 1111` (validade futura, CVV qualquer). Teste recusa com `4000 0000 0000 0002`.
2. **Cliente**: tente *Clonazepam* → bloqueado (“Somente na loja”). Compre *Amoxicilina* → o pedido fica *Aguardando receita* → anexe uma foto (JPG/PNG/PDF) da receita.
3. **Farmacêutico** (outra janela anônima): *Painel › Receitas* → veja e aprove → cliente paga via PIX e usa “Simular pagamento”.
4. **Farmacêutico**: *Painel › Pedidos* → “em separação” (baixa FEFO + escrituração) → “saiu para entrega” (solicita entregador iFood). Veja *Escrituração* e os alertas chegando em tempo real.
5. **Atendimento**: pergunte “buscar protetor”, “meus pedidos”, “posso tomar dipirona grávida?” (vai para o farmacêutico) e responda pelo *Painel › Atendimento*.
6. **Admin**: *Painel › iFood* → sincronizar catálogo e simular pedidos do iFood (MIP aceito; antibiótico recusado e cancelado).

## Testes

```bash
npm test     # 15 testes: ANVISA, estoque, pagamentos, iFood, WhatsApp, segurança (IDOR, rate limit, JWT, webhooks…)
```

## Estrutura

```
src/
  server.js              # inicialização HTTP
  app.js                 # rotas da API + middleware (auth, rate limit, limites de corpo, erros)
  config.js              # configuração por variáveis de ambiente; chaves derivadas via HKDF
  seed.js                # produtos e usuários de demonstração
  lib/                   # crypto, store (persistência + auditoria), http, eventos (SSE)
  services/              # auth, anvisa, estoque, pedidos, pagamentos
  integrations/          # ifood, whatsapp
public/                  # app web (SPA/PWA, JS puro, compatível com CSP estrita)
tests/api.test.js
docs/                    # arquitetura, ANVISA, segurança, integrações
```

## Documentação
- [Arquitetura e API](docs/ARQUITETURA.md)
- [Conformidade ANVISA](docs/CONFORMIDADE-ANVISA.md)
- [Segurança e LGPD](docs/SEGURANCA.md)
- [Integrações iFood, WhatsApp e pagamentos — como ativar em produção](docs/INTEGRACOES.md)

> ⚠️ Os números de registro ANVISA dos produtos de exemplo são fictícios. As regras sanitárias implementadas devem ser revisadas pelo farmacêutico responsável técnico e por assessoria regulatória antes da operação.
