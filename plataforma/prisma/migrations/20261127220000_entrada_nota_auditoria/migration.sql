-- Entrada de nota fiscal de compra (NF-e) pelo XML ou pela chave de acesso.
-- CreateEnum
CREATE TYPE "StatusNotaEntrada" AS ENUM ('PENDENTE', 'LANCADA', 'DESCARTADA');

-- CreateTable
CREATE TABLE "NotaEntrada" (
    "id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "serie" INTEGER NOT NULL,
    "emitidaEm" TIMESTAMP(3) NOT NULL,
    "fornecedorId" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "emitenteCnpj" TEXT NOT NULL,
    "emitenteNome" TEXT NOT NULL,
    "destCnpj" TEXT,
    "valorTotal" INTEGER NOT NULL,
    "autorizada" BOOLEAN NOT NULL DEFAULT false,
    "status" "StatusNotaEntrada" NOT NULL DEFAULT 'PENDENTE',
    "itens" JSONB NOT NULL,
    "duplicatas" JSONB NOT NULL,
    "xml" TEXT NOT NULL,
    "origem" TEXT NOT NULL DEFAULT 'xml',
    "compraId" TEXT,
    "importadaPorId" TEXT NOT NULL,
    "lancadaPorId" TEXT,
    "lancadaEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotaEntrada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodigoFornecedor" (
    "id" TEXT NOT NULL,
    "fornecedorId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "fator" INTEGER NOT NULL DEFAULT 1,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CodigoFornecedor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotaEntrada_chave_key" ON "NotaEntrada"("chave");

-- CreateIndex
CREATE INDEX "NotaEntrada_status_criadoEm_idx" ON "NotaEntrada"("status", "criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "CodigoFornecedor_fornecedorId_codigo_key" ON "CodigoFornecedor"("fornecedorId", "codigo");


-- Auditoria: versão do cálculo do hash (2 = JSON canônico; o jsonb não preserva a ordem das chaves)
ALTER TABLE "Auditoria" ADD COLUMN "versaoHash" INTEGER NOT NULL DEFAULT 1;
