-- CreateEnum
CREATE TYPE "StatusConversa" AS ENUM ('ASSISTENTE', 'AGUARDANDO_FARMACEUTICO', 'EM_ATENDIMENTO', 'ENCERRADA');

-- CreateEnum
CREATE TYPE "AutorMensagem" AS ENUM ('CLIENTE', 'ASSISTENTE', 'FARMACEUTICO', 'SISTEMA');

-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "consentimentoAssistenteEm" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "TokenSenha" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "usadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenSenha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImagemProduto" (
    "id" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "dados" BYTEA NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImagemProduto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversa" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "status" "StatusConversa" NOT NULL DEFAULT 'ASSISTENTE',
    "farmaceuticoId" TEXT,
    "motivoEncaminhamento" TEXT,
    "emergencia" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mensagem" (
    "id" TEXT NOT NULL,
    "conversaId" TEXT NOT NULL,
    "autor" "AutorMensagem" NOT NULL,
    "autorId" TEXT,
    "textoCifrado" TEXT NOT NULL,
    "dadosCifrados" TEXT,
    "teveImagem" BOOLEAN NOT NULL DEFAULT false,
    "bloqueadaPorRegra" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Mensagem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TokenSenha_tokenHash_key" ON "TokenSenha"("tokenHash");

-- CreateIndex
CREATE INDEX "TokenSenha_usuarioId_idx" ON "TokenSenha"("usuarioId");

-- CreateIndex
CREATE INDEX "ImagemProduto_produtoId_ordem_idx" ON "ImagemProduto"("produtoId", "ordem");

-- CreateIndex
CREATE INDEX "Conversa_status_atualizadoEm_idx" ON "Conversa"("status", "atualizadoEm");

-- CreateIndex
CREATE INDEX "Conversa_usuarioId_atualizadoEm_idx" ON "Conversa"("usuarioId", "atualizadoEm");

-- CreateIndex
CREATE INDEX "Mensagem_conversaId_criadoEm_idx" ON "Mensagem"("conversaId", "criadoEm");

-- AddForeignKey
ALTER TABLE "TokenSenha" ADD CONSTRAINT "TokenSenha_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImagemProduto" ADD CONSTRAINT "ImagemProduto_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversa" ADD CONSTRAINT "Conversa_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversa" ADD CONSTRAINT "Conversa_farmaceuticoId_fkey" FOREIGN KEY ("farmaceuticoId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mensagem" ADD CONSTRAINT "Mensagem_conversaId_fkey" FOREIGN KEY ("conversaId") REFERENCES "Conversa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
