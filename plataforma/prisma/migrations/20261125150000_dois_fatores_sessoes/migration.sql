-- Recriada a partir do banco de produção (aplicada lá em 25/11). Idempotente.
ALTER TABLE "Usuario" ADD COLUMN IF NOT EXISTS "totpSegredoCifrado" TEXT,
  ADD COLUMN IF NOT EXISTS "totpAtivoEm" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "totpUltimoPasso" INTEGER,
  ADD COLUMN IF NOT EXISTS "codigosRecuperacao" TEXT[] DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "Sessao" ADD COLUMN IF NOT EXISTS "mfaPendente" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "tentativasMfa" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "reautenticadoEm" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "ultimoUsoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS "LimiteTaxa" (
  "chave" TEXT NOT NULL,
  "contagem" INTEGER NOT NULL,
  "expiraEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LimiteTaxa_pkey" PRIMARY KEY ("chave")
);
CREATE INDEX IF NOT EXISTS "LimiteTaxa_expiraEm_idx" ON "LimiteTaxa"("expiraEm");
