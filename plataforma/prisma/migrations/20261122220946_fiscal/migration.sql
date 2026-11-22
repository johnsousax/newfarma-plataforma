-- CreateEnum
CREATE TYPE "ModeloNota" AS ENUM ('NFCE', 'NFE');

-- CreateEnum
CREATE TYPE "StatusNota" AS ENUM ('PENDENTE', 'ENVIADA', 'AUTORIZADA', 'REJEITADA', 'CANCELADA');

-- AlterTable
ALTER TABLE "Produto" ADD COLUMN     "cest" TEXT,
ADD COLUMN     "cfop" TEXT,
ADD COLUMN     "cstIcms" TEXT,
ADD COLUMN     "ncm" TEXT,
ADD COLUMN     "origemFiscal" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "unidade" TEXT NOT NULL DEFAULT 'UN';

-- CreateTable
CREATE TABLE "NotaFiscal" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "modelo" "ModeloNota" NOT NULL DEFAULT 'NFCE',
    "serie" INTEGER NOT NULL,
    "numero" INTEGER NOT NULL,
    "ambiente" TEXT NOT NULL,
    "status" "StatusNota" NOT NULL DEFAULT 'PENDENTE',
    "chaveAcesso" TEXT NOT NULL,
    "protocolo" TEXT,
    "conteudo" JSONB NOT NULL,
    "xmlAutorizado" TEXT,
    "motivo" TEXT,
    "valorTotal" INTEGER NOT NULL,
    "provedor" TEXT NOT NULL,
    "emitidaPor" TEXT,
    "autorizadaEm" TIMESTAMP(3),
    "canceladaEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotaFiscal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotaFiscal_chaveAcesso_key" ON "NotaFiscal"("chaveAcesso");

-- CreateIndex
CREATE INDEX "NotaFiscal_pedidoId_idx" ON "NotaFiscal"("pedidoId");

-- CreateIndex
CREATE UNIQUE INDEX "NotaFiscal_modelo_serie_numero_ambiente_key" ON "NotaFiscal"("modelo", "serie", "numero", "ambiente");

-- AddForeignKey
ALTER TABLE "NotaFiscal" ADD CONSTRAINT "NotaFiscal_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
