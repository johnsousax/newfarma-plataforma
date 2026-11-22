# Conformidade sanitária (ANVISA)

> Este documento descreve **como o software implementa** as regras. Não substitui parecer jurídico/regulatório.
> A operação exige farmácia com AFE, licença sanitária local, farmacêutico responsável técnico (RT) e
> procedimentos operacionais padrão (POPs). Revise as regras com o RT antes de entrar em produção.

## Regras por classificação de produto

| Classificação | Venda no app | No iFood | Receita | Retenção | Escrituração |
|---|---|---|---|---|---|
| `NAO_MEDICAMENTO` (cosméticos, higiene, suplementos) | ✅ | ✅ | — | — | — |
| `MIP` — isento de prescrição (RDC 98/2016) | ✅ | ✅ | — | — | — |
| `TARJA_VERMELHA` — venda sob prescrição | ✅ após validação | ❌ | ✅ | — | — |
| `ANTIMICROBIANO` (RDC 471/2021) | ✅ após validação | ❌ | ✅ (10 dias) | ✅ 2ª via na entrega | ✅ SNGPC |
| `CONTROLADO` (Portaria SVS/MS 344/98) | ❌ **bloqueado** | ❌ | — | — | — |

Implementação: `src/services/anvisa.js` (`CLASSIFICACOES`, `avaliarProduto`).

## Como cada exigência é atendida

| Exigência | Implementação |
|---|---|
| **RDC 44/2009** — dados da farmácia visíveis no comércio remoto | Rodapé e `GET /api/farmacia`: razão social, CNPJ, AFE, RT e CRF, horário |
| Proibição de venda remota de controlados (Portaria 344/98) | Bloqueio em **todas** as camadas: catálogo (botão “Somente na loja”), API de pedidos (HTTP 422), iFood (não publica e cancela pedidos), WhatsApp (informa venda presencial) |
| Medicamento com prescrição só com receita válida | Pedido nasce em `AGUARDANDO_RECEITA`; pagamento bloqueado até um **farmacêutico com CRF** aprovar. Admin sem CRF não aprova |
| Validade da receita | Antimicrobianos: 10 dias da emissão (bloqueia aprovação de receita vencida). Demais: configurável (`ANVISA_VALIDADE_RECEITA_DIAS`) |
| Identificação do prescritor | Registro (CRM/CRO/CRMV/COREN + UF + número) validado por formato; nome e data obrigatórios |
| Retenção da receita de antimicrobiano | Pedido marcado `coletarReceitaNaEntrega`; instrução enviada ao entregador iFood; alerta na tela do cliente |
| Dispensação por farmacêutico | Pedidos com receita só vão para `EM_SEPARACAO` por usuário com papel `farmaceutico` |
| Escrituração / SNGPC | Cada dispensação de antimicrobiano/controlado gera registro com princípio ativo, registro ANVISA, lote, quantidade, prescritor e CRF (`/api/anvisa/escrituracao`, campo `transmitidoSngpc` para integração) |
| Rastreabilidade por lote | Estoque por lote e validade; baixa **FEFO**; lote registrado na dispensação |
| Produtos vencidos | Excluídos do disponível; alerta `LOTE_VENCIDO` (segregação e descarte conforme RDC 222/2018); entrada de lote vencido é recusada |
| Registro do produto | Cadastro de medicamento exige registro ANVISA (13 dígitos) e princípio ativo (DCB) |
| Advertência obrigatória | “Se persistirem os sintomas, o médico deverá ser consultado” exibida em medicamentos |
| Sem indicação/automedicação | O agente de WhatsApp **não** responde sobre dose, indicação ou interações: encaminha ao farmacêutico; sinais de emergência → SAMU 192 |
| Publicidade | Sem promoções de medicamentos de prescrição no app/iFood (RDC 96/2008) — manter na curadoria de conteúdo |

## Pendências para produção
- Integração real com o **SNGPC** (transmissão dos arquivos XML de escrituração) ou com software homologado.
- Verificação do CRF do farmacêutico e do registro do prescritor em bases oficiais, quando disponível.
- Confirmar com o RT a política de vendas remotas de tarja vermelha e antimicrobianos no município/estado.
- POPs de entrega (temperatura, termolábeis, conferência da receita no ato da entrega).
- Atualizar os registros fictícios dos produtos de exemplo pelos reais.
