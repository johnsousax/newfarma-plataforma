-- Padrão de sistema de gestão de farmácia: crediário, convênios, orçamento/pré-venda,
-- comissão, inventário, cotação de compras e meios de pagamento CREDIARIO/CONVENIO.

-- CreateEnum
CREATE TYPE "TipoMovCrediario" AS ENUM ('COMPRA', 'PAGAMENTO', 'ESTORNO', 'AJUSTE');

-- CreateEnum
CREATE TYPE "TipoOrcamento" AS ENUM ('ORCAMENTO', 'PRE_VENDA');

-- CreateEnum
CREATE TYPE "StatusOrcamento" AS ENUM ('ABERTO', 'CONVERTIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "StatusInventario" AS ENUM ('ABERTO', 'FECHADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "StatusCotacao" AS ENUM ('ABERTA', 'FECHADA', 'CANCELADA');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MetodoPagamento" ADD VALUE 'CREDIARIO';
ALTER TYPE "MetodoPagamento" ADD VALUE 'CONVENIO';

-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN "comissaoBp" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Pedido" ADD COLUMN     "contaCrediarioId" TEXT,
ADD COLUMN     "convenioId" TEXT,
ADD COLUMN     "vendedorId" TEXT;

-- CreateTable
CREATE TABLE "Convenio" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cnpj" TEXT,
    "contato" TEXT,
    "telefone" TEXT,
    "email" TEXT,
    "descontoBp" INTEGER NOT NULL DEFAULT 0,
    "diaFechamento" INTEGER NOT NULL DEFAULT 25,
    "prazoPagamentoDias" INTEGER NOT NULL DEFAULT 10,
    "limitePadrao" INTEGER NOT NULL DEFAULT 30000,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Convenio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContaCrediario" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cpfHash" TEXT,
    "cpfFinal" TEXT,
    "telefone" TEXT,
    "usuarioId" TEXT,
    "convenioId" TEXT,
    "matricula" TEXT,
    "limite" INTEGER NOT NULL,
    "diaVencimento" INTEGER NOT NULL DEFAULT 10,
    "bloqueada" BOOLEAN NOT NULL DEFAULT false,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "observacao" TEXT,
    "ultimaCobrancaEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContaCrediario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimentoCrediario" (
    "id" TEXT NOT NULL,
    "contaId" TEXT NOT NULL,
    "tipo" "TipoMovCrediario" NOT NULL,
    "valor" INTEGER NOT NULL,
    "descricao" TEXT NOT NULL,
    "pedidoId" TEXT,
    "vencimento" TIMESTAMP(3),
    "formaPagamento" TEXT,
    "usuarioId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimentoCrediario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Orcamento" (
    "id" TEXT NOT NULL,
    "numero" SERIAL NOT NULL,
    "tipo" "TipoOrcamento" NOT NULL DEFAULT 'PRE_VENDA',
    "status" "StatusOrcamento" NOT NULL DEFAULT 'ABERTO',
    "lojaId" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "clienteNome" TEXT,
    "telefone" TEXT,
    "observacao" TEXT,
    "itens" JSONB NOT NULL,
    "total" INTEGER NOT NULL,
    "validoAte" TIMESTAMP(3) NOT NULL,
    "pedidoId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Orcamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inventario" (
    "id" TEXT NOT NULL,
    "numero" SERIAL NOT NULL,
    "lojaId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "status" "StatusInventario" NOT NULL DEFAULT 'ABERTO',
    "criadoPorId" TEXT NOT NULL,
    "fechadoPorId" TEXT,
    "abertoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechadoEm" TIMESTAMP(3),

    CONSTRAINT "Inventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventarioItem" (
    "id" TEXT NOT NULL,
    "inventarioId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "loteId" TEXT NOT NULL,
    "produtoNome" TEXT NOT NULL,
    "loteCodigo" TEXT NOT NULL,
    "validade" TIMESTAMP(3) NOT NULL,
    "esperado" INTEGER NOT NULL,
    "contado" INTEGER,

    CONSTRAINT "InventarioItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cotacao" (
    "id" TEXT NOT NULL,
    "numero" SERIAL NOT NULL,
    "lojaId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "status" "StatusCotacao" NOT NULL DEFAULT 'ABERTA',
    "criadoPorId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechadaEm" TIMESTAMP(3),

    CONSTRAINT "Cotacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CotacaoItem" (
    "id" TEXT NOT NULL,
    "cotacaoId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "produtoNome" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,

    CONSTRAINT "CotacaoItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CotacaoPreco" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "fornecedorId" TEXT NOT NULL,
    "custoUnitario" INTEGER NOT NULL,
    "prazoDias" INTEGER,

    CONSTRAINT "CotacaoPreco_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContaCrediario_cpfHash_key" ON "ContaCrediario"("cpfHash");

-- CreateIndex
CREATE INDEX "ContaCrediario_convenioId_idx" ON "ContaCrediario"("convenioId");

-- CreateIndex
CREATE INDEX "MovimentoCrediario_contaId_criadoEm_idx" ON "MovimentoCrediario"("contaId", "criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "Orcamento_numero_key" ON "Orcamento"("numero");

-- CreateIndex
CREATE INDEX "Orcamento_lojaId_status_idx" ON "Orcamento"("lojaId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Inventario_numero_key" ON "Inventario"("numero");

-- CreateIndex
CREATE INDEX "Inventario_lojaId_status_idx" ON "Inventario"("lojaId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "InventarioItem_inventarioId_loteId_key" ON "InventarioItem"("inventarioId", "loteId");

-- CreateIndex
CREATE UNIQUE INDEX "Cotacao_numero_key" ON "Cotacao"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "CotacaoPreco_itemId_fornecedorId_key" ON "CotacaoPreco"("itemId", "fornecedorId");

-- AddForeignKey
ALTER TABLE "ContaCrediario" ADD CONSTRAINT "ContaCrediario_convenioId_fkey" FOREIGN KEY ("convenioId") REFERENCES "Convenio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoCrediario" ADD CONSTRAINT "MovimentoCrediario_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "ContaCrediario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventarioItem" ADD CONSTRAINT "InventarioItem_inventarioId_fkey" FOREIGN KEY ("inventarioId") REFERENCES "Inventario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotacaoItem" ADD CONSTRAINT "CotacaoItem_cotacaoId_fkey" FOREIGN KEY ("cotacaoId") REFERENCES "Cotacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotacaoPreco" ADD CONSTRAINT "CotacaoPreco_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CotacaoItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
