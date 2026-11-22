-- AlterTable
ALTER TABLE "Loja" ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Pedido" ADD COLUMN     "despachadoEm" TIMESTAMP(3),
ADD COLUMN     "entregueEm" TIMESTAMP(3),
ADD COLUMN     "motoboyId" TEXT,
ADD COLUMN     "taxaMotoboy" INTEGER;

-- CreateTable
CREATE TABLE "ZonaEntrega" (
    "id" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "bairro" TEXT NOT NULL,
    "bairroBusca" TEXT NOT NULL,
    "taxa" INTEGER NOT NULL,
    "prazoMinutos" INTEGER NOT NULL DEFAULT 60,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ZonaEntrega_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Motoboy" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "veiculo" TEXT,
    "placa" TEXT,
    "taxaPorEntrega" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "token" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "posicaoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Motoboy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ZonaEntrega_lojaId_bairroBusca_key" ON "ZonaEntrega"("lojaId", "bairroBusca");

-- CreateIndex
CREATE UNIQUE INDEX "Motoboy_token_key" ON "Motoboy"("token");

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_motoboyId_fkey" FOREIGN KEY ("motoboyId") REFERENCES "Motoboy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZonaEntrega" ADD CONSTRAINT "ZonaEntrega_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "Loja"("id") ON DELETE CASCADE ON UPDATE CASCADE;
