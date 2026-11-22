# Assistente virtual — regras de segurança (v1.0)

> Documento para revisão e aprovação do **farmacêutico responsável técnico** antes de ativar o assistente em produção.
> Código: `src/server/assistente/regras.ts` (regras), `ia.ts` (chamada ao modelo) e `conversas.ts` (fluxo).

## Para que serve

O cliente envia uma **foto do remédio, da bula ou da receita** (ou só escreve) e recebe:

- qual é o medicamento (nome, princípio ativo, concentração);
- para que ele é indicado **segundo a bula**, em linguagem simples;
- se precisa de receita (livre, tarja vermelha, antibiótico com receita retida, controlado só na loja);
- se temos o produto na loja, com link para comprar;
- e, sempre que a dúvida for sobre o **caso da pessoa**, a passagem para um **farmacêutico de verdade**, na mesma tela.

## O que o assistente NUNCA faz

| Proibido | Por quê | O que acontece |
|---|---|---|
| Dizer se o remédio "serve" ou "é bom" para o problema da pessoa | Exige avaliação clínica individual | Explica a indicação da bula e oferece o farmacêutico |
| Indicar remédio para um sintoma | É indicação terapêutica | Encaminha |
| Dar dose, horário, frequência ou duração (nem repetir a da receita) | Erro de dose é o risco mais grave | "Siga a receita; confirme com o farmacêutico" |
| Avaliar mistura com outros remédios, álcool, alimentos, chás, suplementos | Interações exigem histórico completo | Encaminha sempre |
| Orientar começar, parar, trocar, aumentar ou diminuir | Só médico ou farmacêutico, conforme a lei | Encaminha |
| Orientar gestantes, lactantes, crianças, idosos ou doentes crônicos | Grupos de risco | Encaminha |
| Diagnosticar, interpretar exames, avaliar gravidade | Ato médico | Encaminha |
| Ajudar a obter controlado ou remédio com receita sem receita | RDC 44/2009, Portaria 344/98 | Recusa |
| Chutar o que não consegue ler na foto ou na letra da receita | Risco de troca de medicamento | Diz que não leu com segurança |
| Repetir dados pessoais da imagem (paciente, médico, CRM, CPF) | LGPD (minimização) | Fala só dos medicamentos |

## Três camadas de proteção

1. **Antes da IA: emergência.** Palavras como "dor no peito", "falta de ar", "desmaio", "tomou a cartela", "criança engoliu" ou "não quero mais viver" disparam **na hora** uma resposta fixa com **SAMU 192**, **Disque-Intoxicação 0800 722 6001** e **CVV 188**, sem consultar a IA. A conversa vai para o topo da fila do farmacêutico, marcada em vermelho.
2. **Na IA: instruções e formato fixo.** O modelo recebe as regras acima e precisa responder num formato estruturado (tipo de entrada, medicamentos, se é emergência, se deve encaminhar e o motivo). O servidor valida esse formato. Textos dentro das imagens são tratados como conteúdo, nunca como instruções.
3. **Depois da IA: verificação.** Antes de chegar ao cliente, a resposta passa por um filtro que procura dose e posologia ("500 mg a cada 8 horas"), liberação de uso ("pode tomar junto"), recomendação ("eu recomendo"), adequação ao caso ("vai resolver o seu problema") e mudança de tratamento ("pare de tomar"). Se encontrar algo, **a resposta é descartada**, o cliente recebe uma mensagem segura padrão e a conversa vai para o farmacêutico. Esses bloqueios aparecem em *Painel › Atendimento* para revisão periódica com o RT.

Além disso:

- Toda resposta do assistente vem acompanhada de um **aviso fixo**, que não é gerado pela IA: "informação geral, baseada na bula; não substitui consulta…".
- Depois que o farmacêutico entra na conversa, **a IA para de responder**.
- Se a IA estiver fora do ar ou recusar a pergunta, a conversa **vai para o farmacêutico**. O cliente nunca fica sem resposta.
- Só um usuário **Farmacêutico** (com CRF) responde no painel. Gerente e admin apenas acompanham.

## Privacidade (LGPD)

- É preciso estar **logado** e dar um **consentimento específico** (art. 11, dado de saúde), que pode ser revogado em *Minha conta › Dados e privacidade*.
- **Fotos não são guardadas.** São reduzidas no próprio celular (o que também remove a localização GPS) e descartadas após a resposta.
- Mensagens e dados identificados ficam **cifrados** (AES-256-GCM) no banco. Entram na exportação de dados do titular e são apagadas na exclusão da conta.
- A trilha de auditoria registra que houve consulta, se teve foto, se houve encaminhamento ou bloqueio. O conteúdo nunca vai para a auditoria.
- Limite de 40 perguntas por dia por cliente e 8 por minuto.

## Ativar

1. Crie uma chave em console.anthropic.com e coloque em `ANTHROPIC_API_KEY` no `.env`. Sem a chave, o assistente informa que está indisponível e passa a conversa para o farmacêutico.
2. O modelo padrão é o `claude-opus-5-5` (troca em `ASSISTENTE_MODELO`). Ele lê bem fotos de embalagens e letra de receita. Se um filtro de segurança do modelo recusar a pergunta, a própria API tenta um modelo reserva (`fallbacks: "default"`).
3. Antes de abrir ao público: o RT deve testar com fotos reais (caixas, receitas digitadas e manuscritas, perguntas de dose, mistura e gestante) e aprovar este documento.
4. Revise mensalmente os **bloqueios automáticos** no painel e ajuste as regras se necessário (`VERSAO_REGRAS`).

## Custo estimado

Cada pergunta com foto custa em torno de US$ 0,01 a 0,02 no modelo padrão (cerca de 1.500 a 3.000 tokens de entrada e 300 a 600 de saída). Com 1.000 perguntas por mês, são cerca de US$ 15 a 20. As instruções de sistema ficam em cache entre perguntas, o que reduz o custo.
