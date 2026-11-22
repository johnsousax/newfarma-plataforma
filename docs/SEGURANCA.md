# Segurança e LGPD

## Criptografia
| Item | Como |
|---|---|
| Chaves | Uma `APP_MASTER_KEY` (variável de ambiente / cofre de segredos) → chaves derivadas por **HKDF-SHA256** (dados, JWT, índices). Nada em arquivo versionado. Obrigatória em produção. |
| Dados pessoais em repouso | **AES-256-GCM** por campo (IV aleatório, autenticado): e-mail, CPF, telefone, endereço, nomes na receita, **arquivo da receita** e mensagens do WhatsApp |
| Busca sem expor o dado | **Índice cego** HMAC-SHA256 para e-mail, CPF e telefone |
| Senhas | **scrypt** (N=16384) com sal único; comparação em tempo constante |
| Em trânsito | HTTPS obrigatório em produção (proxy/TLS) + **HSTS** |

## Autenticação e autorização
- Token **JWT HS256** (2h) com `jti`; rejeita `alg: none`/troca de algoritmo; **logout revoga** o token.
- Senha forte (≥10, letras e números); **bloqueio da conta** após 5 falhas (15 min); mensagem genérica e tempo constante (não revela se o e-mail existe).
- **RBAC**: `cliente`, `farmaceutico`, `admin`. Proteção contra **IDOR**: pedido de outro usuário retorna 404.
- **Rate limiting** por IP (geral e por rota sensível: login, cadastro, pedido, pagamento, receita, chat).
- Token enviado só no cabeçalho `Authorization` (não em cookie) → imune a CSRF.

## Pagamentos (PCI-DSS — escopo reduzido)
- Número do cartão e CVV **nunca** chegam ao servidor: o front usa o SDK do gateway para **tokenizar** no navegador.
- O servidor **recusa** qualquer requisição com campos ou padrões de número de cartão.
- Guarda apenas ID/token do gateway, bandeira e últimos 4 dígitos.
- Valor cobrado = total calculado no servidor; webhook verifica **assinatura HMAC** e **valor**; processamento **idempotente**; estorno marcado em cancelamentos pós-pagamento.

## Aplicação web
- **CSP estrita** (`script-src 'self'`, sem inline, `frame-ancestors 'none'`), `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, COOP/CORP.
- Front monta o DOM sem `innerHTML` com dados → sem XSS por injeção.
- Limite de tamanho de corpo (1 MB; 4 MB para receitas), exigência de `application/json`, sanitização de texto.
- Upload de receita: tipo permitido (JPG/PNG/PDF) **e** verificação dos *magic bytes*.
- Arquivos estáticos protegidos contra *path traversal*; erros internos não vazam stack trace.

## Integrações
- Webhooks **iFood**, **WhatsApp** (`X-Hub-Signature-256`) e **gateway** com HMAC-SHA256 verificado em tempo constante; GET de verificação da Meta com `verify_token`.
- Credenciais só por variável de ambiente; chamadas externas com timeout.

## Auditoria
- Trilha de auditoria **encadeada por hash** (cada registro inclui o hash do anterior) — adulteração é detectável em `/api/auditoria/verificar`.
- Eventos: login (sucesso/falha), cadastro, pedidos, mudança de status, receitas (envio, **visualização**, aprovação), pagamentos, estoque, iFood.

## LGPD
- Consentimento explícito no cadastro, registrado com data; finalidade descrita (dispensação e obrigações sanitárias — art. 11, II, “a” e “f”).
- Receita = **dado pessoal sensível de saúde**: cifrada, acessível só ao farmacêutico, acesso auditado.
- Minimização: CPF exibido mascarado; telefones mascarados no painel.
- A implementar na operação: canal do titular (acesso/correção/eliminação respeitando prazos legais de guarda sanitária), encarregado (DPO), política de retenção, RIPD.

## Checklist de produção
- [ ] `NODE_ENV=production`, `APP_MASTER_KEY` em cofre (AWS Secrets Manager, GCP Secret Manager, Vault) e rotação planejada
- [ ] TLS no proxy reverso; `trust proxy` para IP real no rate limit
- [ ] Banco PostgreSQL com backup cifrado; receitas em storage cifrado
- [ ] Pentest e varredura de dependências antes do lançamento
- [ ] MFA para contas de equipe
