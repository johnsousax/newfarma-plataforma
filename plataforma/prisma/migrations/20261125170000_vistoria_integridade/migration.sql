-- Recriada a partir do banco de produção (aplicada lá em 25/11). Idempotente.
ALTER TABLE "Receita" ADD COLUMN IF NOT EXISTS "arquivoHash" TEXT;
CREATE INDEX IF NOT EXISTS "Receita_arquivoHash_idx" ON "Receita"("arquivoHash");
ALTER TABLE "Motoboy" ADD COLUMN IF NOT EXISTS "tokenExpiraEm" TIMESTAMP(3);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'usuario_pontos_nao_negativo') THEN
    ALTER TABLE "Usuario" ADD CONSTRAINT usuario_pontos_nao_negativo CHECK (pontos >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cupom_usos_nao_negativo') THEN
    ALTER TABLE "Cupom" ADD CONSTRAINT cupom_usos_nao_negativo CHECK (usos >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lote_quantidades_validas') THEN
    ALTER TABLE "Lote" ADD CONSTRAINT lote_quantidades_validas CHECK (quantidade >= 0 AND reservado >= 0 AND reservado <= quantidade) NOT VALID;
  END IF;
END $$;
