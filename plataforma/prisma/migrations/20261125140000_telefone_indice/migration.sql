-- Recriada a partir do banco de produção (aplicada lá em 25/11). Idempotente.
ALTER TABLE "Usuario" ADD COLUMN IF NOT EXISTS "telefoneHash" TEXT;
CREATE INDEX IF NOT EXISTS "Usuario_telefoneHash_idx" ON "Usuario"("telefoneHash");
