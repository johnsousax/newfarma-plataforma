-- CreateTable
CREATE TABLE "Integracao" (
    "chave" TEXT NOT NULL,
    "valorCifrado" TEXT NOT NULL,
    "finalVisivel" TEXT NOT NULL,
    "atualizadoPor" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Integracao_pkey" PRIMARY KEY ("chave")
);
