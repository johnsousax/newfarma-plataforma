-- CreateEnum
CREATE TYPE "Papel" AS ENUM ('CLIENTE', 'ATENDENTE', 'FARMACEUTICO', 'GERENTE', 'ADMIN');

-- CreateEnum
CREATE TYPE "Classificacao" AS ENUM ('NAO_MEDICAMENTO', 'MIP', 'TARJA_VERMELHA', 'ANTIMICROBIANO', 'CONTROLADO');

-- CreateEnum
CREATE TYPE "TipoMedicamento" AS ENUM ('NAO_SE_APLICA', 'REFERENCIA', 'GENERICO', 'SIMILAR');

-- CreateEnum
CREATE TYPE "StatusPedido" AS ENUM ('AGUARDANDO_RECEITA', 'AGUARDANDO_PAGAMENTO', 'PAGO', 'EM_SEPARACAO', 'PRONTO_PARA_RETIRADA', 'SAIU_PARA_ENTREGA', 'ENTREGUE', 'CANCELADO');

-- CreateEnum
CREATE TYPE "Modalidade" AS ENUM ('ENTREGA_PADRAO', 'ENTREGA_EXPRESSA', 'RETIRADA', 'BALCAO');

-- CreateEnum
CREATE TYPE "Canal" AS ENUM ('SITE', 'PDV', 'IFOOD', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "MetodoPagamento" AS ENUM ('CARTAO_CREDITO', 'CARTAO_DEBITO', 'PIX', 'DINHEIRO');

-- CreateEnum
CREATE TYPE "StatusPagamento" AS ENUM ('PENDENTE', 'APROVADO', 'RECUSADO', 'EXPIRADO', 'ESTORNADO');

-- CreateEnum
CREATE TYPE "StatusReceita" AS ENUM ('PENDENTE', 'APROVADA', 'REJEITADA');

-- CreateEnum
CREATE TYPE "StatusModeracao" AS ENUM ('PENDENTE', 'APROVADA', 'REJEITADA');

-- CreateEnum
CREATE TYPE "TipoCupom" AS ENUM ('PERCENTUAL', 'VALOR_FIXO', 'FRETE_GRATIS');

-- CreateEnum
CREATE TYPE "TipoPromocao" AS ENUM ('PERCENTUAL', 'LEVE_PAGUE');

-- CreateEnum
CREATE TYPE "TipoMovimento" AS ENUM ('ENTRADA', 'SAIDA_VENDA', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO', 'PERDA', 'RESERVA', 'LIBERACAO');

-- CreateEnum
CREATE TYPE "StatusCompra" AS ENUM ('RASCUNHO', 'ENVIADO', 'RECEBIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "StatusCaixa" AS ENUM ('ABERTO', 'FECHADO');

-- CreateEnum
CREATE TYPE "TipoMovCaixa" AS ENUM ('SUPRIMENTO', 'SANGRIA', 'VENDA');

-- CreateTable
CREATE TABLE "Loja" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "cep" TEXT NOT NULL,
    "logradouro" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "bairro" TEXT NOT NULL,
    "cidade" TEXT NOT NULL,
    "uf" TEXT NOT NULL,
    "horario" TEXT NOT NULL,
    "faixasCep" TEXT[],
    "aceitaExpressa" BOOLEAN NOT NULL DEFAULT true,
    "centroDistribuicao" BOOLEAN NOT NULL DEFAULT false,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Loja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "cpfCifrado" TEXT,
    "cpfHash" TEXT,
    "telefone" TEXT,
    "nascimento" TIMESTAMP(3),
    "papel" "Papel" NOT NULL DEFAULT 'CLIENTE',
    "lojaId" TEXT,
    "crf" TEXT,
    "pontos" INTEGER NOT NULL DEFAULT 0,
    "consentimentoLgpdEm" TIMESTAMP(3),
    "aceitaMarketing" BOOLEAN NOT NULL DEFAULT false,
    "tentativasFalhas" INTEGER NOT NULL DEFAULT 0,
    "bloqueadoAte" TIMESTAMP(3),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sessao" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sessao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Endereco" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "apelido" TEXT NOT NULL,
    "destinatario" TEXT NOT NULL,
    "cep" TEXT NOT NULL,
    "logradouro" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "complemento" TEXT,
    "bairro" TEXT NOT NULL,
    "cidade" TEXT NOT NULL,
    "uf" TEXT NOT NULL,
    "principal" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Endereco_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Categoria" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "descricao" TEXT,
    "icone" TEXT NOT NULL,
    "cor" TEXT NOT NULL DEFAULT '#0f766e',
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "paiId" TEXT,

    CONSTRAINT "Categoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Marca" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "fabricante" TEXT,

    CONSTRAINT "Marca_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Produto" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "ean" TEXT,
    "nome" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "busca" TEXT NOT NULL,
    "descricaoCurta" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "marcaId" TEXT NOT NULL,
    "categoriaId" TEXT NOT NULL,
    "classificacao" "Classificacao" NOT NULL,
    "tipo" "TipoMedicamento" NOT NULL DEFAULT 'NAO_SE_APLICA',
    "principioAtivo" TEXT,
    "concentracao" TEXT,
    "formaFarmaceutica" TEXT,
    "apresentacao" TEXT,
    "registroAnvisa" TEXT,
    "indicacoes" TEXT,
    "contraindicacoes" TEXT,
    "modoDeUsar" TEXT,
    "advertencias" TEXT,
    "preco" INTEGER NOT NULL,
    "precoDe" INTEGER,
    "pmc" INTEGER,
    "custo" INTEGER,
    "icone" TEXT NOT NULL DEFAULT '💊',
    "estoqueMinimo" INTEGER NOT NULL DEFAULT 10,
    "pesoGramas" INTEGER NOT NULL DEFAULT 100,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "destaque" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT[],
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Produto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoricoPreco" (
    "id" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "precoAnterior" INTEGER NOT NULL,
    "precoNovo" INTEGER NOT NULL,
    "usuarioId" TEXT,
    "motivo" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HistoricoPreco_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Avaliacao" (
    "id" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "nota" INTEGER NOT NULL,
    "titulo" TEXT NOT NULL,
    "comentario" TEXT NOT NULL,
    "status" "StatusModeracao" NOT NULL DEFAULT 'PENDENTE',
    "compraVerificada" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Avaliacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Favorito" (
    "usuarioId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorito_pkey" PRIMARY KEY ("usuarioId","produtoId")
);

-- CreateTable
CREATE TABLE "Banner" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "subtitulo" TEXT,
    "textoBotao" TEXT NOT NULL DEFAULT 'Aproveitar',
    "link" TEXT NOT NULL,
    "corDe" TEXT NOT NULL DEFAULT '#0f766e',
    "corPara" TEXT NOT NULL DEFAULT '#14b8a6',
    "icone" TEXT NOT NULL DEFAULT '💊',
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "inicio" TIMESTAMP(3),
    "fim" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Banner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Promocao" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoPromocao" NOT NULL,
    "percentual" INTEGER,
    "leve" INTEGER,
    "pague" INTEGER,
    "categoriaId" TEXT,
    "marcaId" TEXT,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3) NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Promocao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cupom" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "tipo" "TipoCupom" NOT NULL,
    "valor" INTEGER NOT NULL DEFAULT 0,
    "minimoPedido" INTEGER NOT NULL DEFAULT 0,
    "usoMaximo" INTEGER,
    "usoPorCliente" INTEGER NOT NULL DEFAULT 1,
    "usos" INTEGER NOT NULL DEFAULT 0,
    "primeiraCompra" BOOLEAN NOT NULL DEFAULT false,
    "inicio" TIMESTAMP(3),
    "fim" TIMESTAMP(3),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cupom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lote" (
    "id" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "validade" TIMESTAMP(3) NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "reservado" INTEGER NOT NULL DEFAULT 0,
    "custoUnit" INTEGER,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimentoEstoque" (
    "id" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "loteId" TEXT,
    "tipo" "TipoMovimento" NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "motivo" TEXT,
    "usuarioId" TEXT,
    "pedidoId" TEXT,
    "compraId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimentoEstoque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Carrinho" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT,
    "cupomCodigo" TEXT,
    "cep" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Carrinho_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarrinhoItem" (
    "id" TEXT NOT NULL,
    "carrinhoId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,

    CONSTRAINT "CarrinhoItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pedido" (
    "id" TEXT NOT NULL,
    "numero" SERIAL NOT NULL,
    "usuarioId" TEXT,
    "lojaId" TEXT NOT NULL,
    "canal" "Canal" NOT NULL DEFAULT 'SITE',
    "status" "StatusPedido" NOT NULL,
    "modalidade" "Modalidade" NOT NULL,
    "enderecoEntrega" JSONB,
    "subtotal" INTEGER NOT NULL,
    "descontoPromocoes" INTEGER NOT NULL DEFAULT 0,
    "descontoCupom" INTEGER NOT NULL DEFAULT 0,
    "descontoPontos" INTEGER NOT NULL DEFAULT 0,
    "frete" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "cupomId" TEXT,
    "pontosUsados" INTEGER NOT NULL DEFAULT 0,
    "pontosGanhos" INTEGER NOT NULL DEFAULT 0,
    "metodoPagamento" "MetodoPagamento",
    "previsaoEntrega" TIMESTAMP(3),
    "observacao" TEXT,
    "cpfNaNota" TEXT,
    "clienteNome" TEXT,
    "operadorId" TEXT,
    "caixaId" TEXT,
    "assinaturaId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pedido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PedidoItem" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "classificacao" "Classificacao" NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "precoUnitario" INTEGER NOT NULL,
    "desconto" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "custoUnitario" INTEGER,
    "alocacoes" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "PedidoItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PedidoEvento" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "status" "StatusPedido" NOT NULL,
    "descricao" TEXT NOT NULL,
    "usuarioId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PedidoEvento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pagamento" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "metodo" "MetodoPagamento" NOT NULL,
    "status" "StatusPagamento" NOT NULL,
    "valor" INTEGER NOT NULL,
    "parcelas" INTEGER NOT NULL DEFAULT 1,
    "gatewayId" TEXT NOT NULL,
    "cartaoBandeira" TEXT,
    "cartaoFinal" TEXT,
    "pixCopiaECola" TEXT,
    "pixExpiraEm" TIMESTAMP(3),
    "valorRecebido" INTEGER,
    "troco" INTEGER,
    "motivoRecusa" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pagamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receita" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "arquivoCifrado" BYTEA NOT NULL,
    "mime" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "prescritorCifrado" TEXT NOT NULL,
    "registroPrescritor" TEXT NOT NULL,
    "dataEmissao" TIMESTAMP(3) NOT NULL,
    "status" "StatusReceita" NOT NULL DEFAULT 'PENDENTE',
    "farmaceuticoId" TEXT,
    "observacao" TEXT,
    "avaliadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Receita_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Escrituracao" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "registroAnvisa" TEXT,
    "principioAtivo" TEXT,
    "quantidade" INTEGER NOT NULL,
    "lotes" JSONB NOT NULL,
    "receitaId" TEXT,
    "registroPrescritor" TEXT,
    "farmaceuticoId" TEXT NOT NULL,
    "crfFarmaceutico" TEXT NOT NULL,
    "transmitidoSngpc" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Escrituracao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assinatura" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "enderecoId" TEXT,
    "quantidade" INTEGER NOT NULL,
    "intervaloDias" INTEGER NOT NULL,
    "descontoPercentual" INTEGER NOT NULL DEFAULT 10,
    "proximaEntrega" TIMESTAMP(3) NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Assinatura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lembrete" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "produtoId" TEXT,
    "nomeMedicamento" TEXT NOT NULL,
    "dosagem" TEXT,
    "horarios" TEXT[],
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3),
    "dosesRestantes" INTEGER,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lembrete_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimentoPontos" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "pedidoId" TEXT,
    "pontos" INTEGER NOT NULL,
    "descricao" TEXT NOT NULL,
    "expiraEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimentoPontos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fornecedor" (
    "id" TEXT NOT NULL,
    "razaoSocial" TEXT NOT NULL,
    "nomeFantasia" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "email" TEXT,
    "telefone" TEXT,
    "contato" TEXT,
    "prazoEntregaDias" INTEGER NOT NULL DEFAULT 5,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Fornecedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PedidoCompra" (
    "id" TEXT NOT NULL,
    "numero" SERIAL NOT NULL,
    "fornecedorId" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "status" "StatusCompra" NOT NULL DEFAULT 'RASCUNHO',
    "observacao" TEXT,
    "total" INTEGER NOT NULL DEFAULT 0,
    "criadoPorId" TEXT NOT NULL,
    "enviadoEm" TIMESTAMP(3),
    "recebidoEm" TIMESTAMP(3),
    "notaFiscal" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PedidoCompra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PedidoCompraItem" (
    "id" TEXT NOT NULL,
    "compraId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "custoUnitario" INTEGER NOT NULL,

    CONSTRAINT "PedidoCompraItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaixaSessao" (
    "id" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "operadorId" TEXT NOT NULL,
    "status" "StatusCaixa" NOT NULL DEFAULT 'ABERTO',
    "valorAbertura" INTEGER NOT NULL,
    "valorInformado" INTEGER,
    "valorEsperado" INTEGER,
    "diferenca" INTEGER,
    "abertoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechadoEm" TIMESTAMP(3),

    CONSTRAINT "CaixaSessao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaixaMovimento" (
    "id" TEXT NOT NULL,
    "caixaId" TEXT NOT NULL,
    "tipo" "TipoMovCaixa" NOT NULL,
    "metodo" "MetodoPagamento",
    "valor" INTEGER NOT NULL,
    "descricao" TEXT NOT NULL,
    "pedidoId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaixaMovimento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Auditoria" (
    "seq" SERIAL NOT NULL,
    "acao" TEXT NOT NULL,
    "usuarioId" TEXT,
    "alvo" TEXT,
    "ip" TEXT,
    "detalhes" JSONB,
    "hashAnterior" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Auditoria_pkey" PRIMARY KEY ("seq")
);

-- CreateTable
CREATE TABLE "_PromocaoProdutos" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_PromocaoProdutos_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "Loja_slug_key" ON "Loja"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_cpfHash_key" ON "Usuario"("cpfHash");

-- CreateIndex
CREATE INDEX "Usuario_papel_idx" ON "Usuario"("papel");

-- CreateIndex
CREATE UNIQUE INDEX "Sessao_tokenHash_key" ON "Sessao"("tokenHash");

-- CreateIndex
CREATE INDEX "Sessao_usuarioId_idx" ON "Sessao"("usuarioId");

-- CreateIndex
CREATE INDEX "Endereco_usuarioId_idx" ON "Endereco"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "Categoria_slug_key" ON "Categoria"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Marca_slug_key" ON "Marca"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Produto_sku_key" ON "Produto"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "Produto_ean_key" ON "Produto"("ean");

-- CreateIndex
CREATE UNIQUE INDEX "Produto_slug_key" ON "Produto"("slug");

-- CreateIndex
CREATE INDEX "Produto_categoriaId_idx" ON "Produto"("categoriaId");

-- CreateIndex
CREATE INDEX "Produto_marcaId_idx" ON "Produto"("marcaId");

-- CreateIndex
CREATE INDEX "Produto_principioAtivo_idx" ON "Produto"("principioAtivo");

-- CreateIndex
CREATE INDEX "Produto_ativo_destaque_idx" ON "Produto"("ativo", "destaque");

-- CreateIndex
CREATE INDEX "HistoricoPreco_produtoId_idx" ON "HistoricoPreco"("produtoId");

-- CreateIndex
CREATE INDEX "Avaliacao_produtoId_status_idx" ON "Avaliacao"("produtoId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Avaliacao_produtoId_usuarioId_key" ON "Avaliacao"("produtoId", "usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "Cupom_codigo_key" ON "Cupom"("codigo");

-- CreateIndex
CREATE INDEX "Lote_lojaId_produtoId_idx" ON "Lote"("lojaId", "produtoId");

-- CreateIndex
CREATE INDEX "Lote_validade_idx" ON "Lote"("validade");

-- CreateIndex
CREATE UNIQUE INDEX "Lote_produtoId_lojaId_codigo_key" ON "Lote"("produtoId", "lojaId", "codigo");

-- CreateIndex
CREATE INDEX "MovimentoEstoque_lojaId_criadoEm_idx" ON "MovimentoEstoque"("lojaId", "criadoEm");

-- CreateIndex
CREATE INDEX "MovimentoEstoque_produtoId_idx" ON "MovimentoEstoque"("produtoId");

-- CreateIndex
CREATE UNIQUE INDEX "Carrinho_usuarioId_key" ON "Carrinho"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "CarrinhoItem_carrinhoId_produtoId_key" ON "CarrinhoItem"("carrinhoId", "produtoId");

-- CreateIndex
CREATE UNIQUE INDEX "Pedido_numero_key" ON "Pedido"("numero");

-- CreateIndex
CREATE INDEX "Pedido_usuarioId_criadoEm_idx" ON "Pedido"("usuarioId", "criadoEm");

-- CreateIndex
CREATE INDEX "Pedido_status_idx" ON "Pedido"("status");

-- CreateIndex
CREATE INDEX "Pedido_lojaId_criadoEm_idx" ON "Pedido"("lojaId", "criadoEm");

-- CreateIndex
CREATE INDEX "Pedido_criadoEm_idx" ON "Pedido"("criadoEm");

-- CreateIndex
CREATE INDEX "PedidoEvento_pedidoId_idx" ON "PedidoEvento"("pedidoId");

-- CreateIndex
CREATE UNIQUE INDEX "Pagamento_gatewayId_key" ON "Pagamento"("gatewayId");

-- CreateIndex
CREATE INDEX "Pagamento_pedidoId_idx" ON "Pagamento"("pedidoId");

-- CreateIndex
CREATE INDEX "Pagamento_status_pixExpiraEm_idx" ON "Pagamento"("status", "pixExpiraEm");

-- CreateIndex
CREATE INDEX "Receita_status_idx" ON "Receita"("status");

-- CreateIndex
CREATE INDEX "Receita_pedidoId_idx" ON "Receita"("pedidoId");

-- CreateIndex
CREATE INDEX "Escrituracao_criadoEm_idx" ON "Escrituracao"("criadoEm");

-- CreateIndex
CREATE INDEX "Assinatura_usuarioId_idx" ON "Assinatura"("usuarioId");

-- CreateIndex
CREATE INDEX "Assinatura_ativa_proximaEntrega_idx" ON "Assinatura"("ativa", "proximaEntrega");

-- CreateIndex
CREATE INDEX "Lembrete_usuarioId_idx" ON "Lembrete"("usuarioId");

-- CreateIndex
CREATE INDEX "MovimentoPontos_usuarioId_criadoEm_idx" ON "MovimentoPontos"("usuarioId", "criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "Fornecedor_cnpj_key" ON "Fornecedor"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "PedidoCompra_numero_key" ON "PedidoCompra"("numero");

-- CreateIndex
CREATE INDEX "PedidoCompra_status_idx" ON "PedidoCompra"("status");

-- CreateIndex
CREATE INDEX "CaixaSessao_lojaId_status_idx" ON "CaixaSessao"("lojaId", "status");

-- CreateIndex
CREATE INDEX "Auditoria_acao_idx" ON "Auditoria"("acao");

-- CreateIndex
CREATE INDEX "Auditoria_criadoEm_idx" ON "Auditoria"("criadoEm");

-- CreateIndex
CREATE INDEX "_PromocaoProdutos_B_index" ON "_PromocaoProdutos"("B");

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "Loja"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sessao" ADD CONSTRAINT "Sessao_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Endereco" ADD CONSTRAINT "Endereco_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Categoria" ADD CONSTRAINT "Categoria_paiId_fkey" FOREIGN KEY ("paiId") REFERENCES "Categoria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Produto" ADD CONSTRAINT "Produto_marcaId_fkey" FOREIGN KEY ("marcaId") REFERENCES "Marca"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Produto" ADD CONSTRAINT "Produto_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "Categoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoPreco" ADD CONSTRAINT "HistoricoPreco_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Avaliacao" ADD CONSTRAINT "Avaliacao_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Avaliacao" ADD CONSTRAINT "Avaliacao_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorito" ADD CONSTRAINT "Favorito_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorito" ADD CONSTRAINT "Favorito_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promocao" ADD CONSTRAINT "Promocao_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "Categoria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promocao" ADD CONSTRAINT "Promocao_marcaId_fkey" FOREIGN KEY ("marcaId") REFERENCES "Marca"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lote" ADD CONSTRAINT "Lote_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lote" ADD CONSTRAINT "Lote_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "Loja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoEstoque" ADD CONSTRAINT "MovimentoEstoque_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoEstoque" ADD CONSTRAINT "MovimentoEstoque_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "Loja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoEstoque" ADD CONSTRAINT "MovimentoEstoque_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "Lote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Carrinho" ADD CONSTRAINT "Carrinho_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarrinhoItem" ADD CONSTRAINT "CarrinhoItem_carrinhoId_fkey" FOREIGN KEY ("carrinhoId") REFERENCES "Carrinho"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarrinhoItem" ADD CONSTRAINT "CarrinhoItem_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "Loja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_cupomId_fkey" FOREIGN KEY ("cupomId") REFERENCES "Cupom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_caixaId_fkey" FOREIGN KEY ("caixaId") REFERENCES "CaixaSessao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoItem" ADD CONSTRAINT "PedidoItem_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoItem" ADD CONSTRAINT "PedidoItem_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoEvento" ADD CONSTRAINT "PedidoEvento_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pagamento" ADD CONSTRAINT "Pagamento_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receita" ADD CONSTRAINT "Receita_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receita" ADD CONSTRAINT "Receita_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receita" ADD CONSTRAINT "Receita_farmaceuticoId_fkey" FOREIGN KEY ("farmaceuticoId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escrituracao" ADD CONSTRAINT "Escrituracao_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escrituracao" ADD CONSTRAINT "Escrituracao_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escrituracao" ADD CONSTRAINT "Escrituracao_receitaId_fkey" FOREIGN KEY ("receitaId") REFERENCES "Receita"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assinatura" ADD CONSTRAINT "Assinatura_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assinatura" ADD CONSTRAINT "Assinatura_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assinatura" ADD CONSTRAINT "Assinatura_enderecoId_fkey" FOREIGN KEY ("enderecoId") REFERENCES "Endereco"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lembrete" ADD CONSTRAINT "Lembrete_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lembrete" ADD CONSTRAINT "Lembrete_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoPontos" ADD CONSTRAINT "MovimentoPontos_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoCompra" ADD CONSTRAINT "PedidoCompra_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoCompra" ADD CONSTRAINT "PedidoCompra_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "Loja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoCompraItem" ADD CONSTRAINT "PedidoCompraItem_compraId_fkey" FOREIGN KEY ("compraId") REFERENCES "PedidoCompra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoCompraItem" ADD CONSTRAINT "PedidoCompraItem_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaixaSessao" ADD CONSTRAINT "CaixaSessao_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "Loja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaixaSessao" ADD CONSTRAINT "CaixaSessao_operadorId_fkey" FOREIGN KEY ("operadorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaixaMovimento" ADD CONSTRAINT "CaixaMovimento_caixaId_fkey" FOREIGN KEY ("caixaId") REFERENCES "CaixaSessao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PromocaoProdutos" ADD CONSTRAINT "_PromocaoProdutos_A_fkey" FOREIGN KEY ("A") REFERENCES "Produto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PromocaoProdutos" ADD CONSTRAINT "_PromocaoProdutos_B_fkey" FOREIGN KEY ("B") REFERENCES "Promocao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
