-- AlterTable
ALTER TABLE "Produto" ADD COLUMN     "vendas" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Produto_vendas_idx" ON "Produto"("vendas");
