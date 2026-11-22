-- CreateEnum
CREATE TYPE "StatusMensagemWhats" AS ENUM ('ENVIANDO', 'ENVIADA', 'ENTREGUE', 'LIDA', 'ERRO', 'RECEBIDA');

-- CreateTable
CREATE TABLE "WhatsappConversa" (
    "id" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "nome" TEXT,
    "usuarioId" TEXT,
    "ultimaPrevia" TEXT,
    "ultimaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "naoLidas" INTEGER NOT NULL DEFAULT 0,
    "arquivada" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsappConversa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsappMensagem" (
    "id" TEXT NOT NULL,
    "conversaId" TEXT NOT NULL,
    "externoId" TEXT,
    "deMim" BOOLEAN NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'texto',
    "textoCifrado" TEXT,
    "midia" BYTEA,
    "midiaMime" TEXT,
    "arquivoNome" TEXT,
    "status" "StatusMensagemWhats" NOT NULL DEFAULT 'RECEBIDA',
    "autorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsappMensagem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappConversa_telefone_key" ON "WhatsappConversa"("telefone");

-- CreateIndex
CREATE INDEX "WhatsappConversa_ultimaEm_idx" ON "WhatsappConversa"("ultimaEm");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappMensagem_externoId_key" ON "WhatsappMensagem"("externoId");

-- CreateIndex
CREATE INDEX "WhatsappMensagem_conversaId_criadoEm_idx" ON "WhatsappMensagem"("conversaId", "criadoEm");

-- AddForeignKey
ALTER TABLE "WhatsappMensagem" ADD CONSTRAINT "WhatsappMensagem_conversaId_fkey" FOREIGN KEY ("conversaId") REFERENCES "WhatsappConversa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
