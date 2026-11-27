-- Recriada a partir do banco de produção (aplicada lá em 25/11). Idempotente.
-- Trilha de auditoria e escrituração ANVISA não podem ser alteradas nem apagadas.
CREATE OR REPLACE FUNCTION nf_bloquear_alteracao() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Registro imutável: % em "%" não é permitido', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE OR REPLACE FUNCTION nf_escrituracao_somente_transmissao() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."transmitidoSngpc" = true AND OLD."transmitidoSngpc" = false
     AND (to_jsonb(NEW) - 'transmitidoSngpc') = (to_jsonb(OLD) - 'transmitidoSngpc') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Escrituração ANVISA é imutável: só é permitido marcar como transmitida ao SNGPC'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS auditoria_sem_update ON "Auditoria";
CREATE TRIGGER auditoria_sem_update BEFORE DELETE OR UPDATE ON "Auditoria" FOR EACH ROW EXECUTE FUNCTION nf_bloquear_alteracao();
DROP TRIGGER IF EXISTS auditoria_sem_truncate ON "Auditoria";
CREATE TRIGGER auditoria_sem_truncate BEFORE TRUNCATE ON "Auditoria" FOR EACH STATEMENT EXECUTE FUNCTION nf_bloquear_alteracao();
DROP TRIGGER IF EXISTS escrituracao_sem_delete ON "Escrituracao";
CREATE TRIGGER escrituracao_sem_delete BEFORE DELETE ON "Escrituracao" FOR EACH ROW EXECUTE FUNCTION nf_bloquear_alteracao();
DROP TRIGGER IF EXISTS escrituracao_sem_truncate ON "Escrituracao";
CREATE TRIGGER escrituracao_sem_truncate BEFORE TRUNCATE ON "Escrituracao" FOR EACH STATEMENT EXECUTE FUNCTION nf_bloquear_alteracao();
DROP TRIGGER IF EXISTS escrituracao_so_transmissao ON "Escrituracao";
CREATE TRIGGER escrituracao_so_transmissao BEFORE UPDATE ON "Escrituracao" FOR EACH ROW EXECUTE FUNCTION nf_escrituracao_somente_transmissao();
