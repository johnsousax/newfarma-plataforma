-- New Farma Popular: loja no Sol e Mar (São Luís/MA) e bairros de entrega de São Luís.
-- Só altera a loja principal se ela ainda estiver com o endereço de exemplo de São Paulo,
-- e só troca os bairros se ainda forem os de exemplo de São Paulo (não apaga o que o dono configurou).

UPDATE "Loja"
SET "bairro" = 'Sol e Mar', "cidade" = 'São Luís', "uf" = 'MA', "cep" = '65071000',
    "telefone" = CASE WHEN "telefone" LIKE '11%' THEN '98900000000' ELSE "telefone" END,
    "faixasCep" = ARRAY['65000-65109'], "latitude" = -2.4935, "longitude" = -44.2465
WHERE "slug" = 'matriz' AND ("uf" = 'SP' OR "cidade" = 'São Paulo');

DELETE FROM "ZonaEntrega"
WHERE "lojaId" IN (SELECT "id" FROM "Loja" WHERE "slug" = 'matriz')
  AND "bairroBusca" IN ('bela vista', 'consolacao', 'jardins', 'liberdade', 'republica', 'pinheiros', 'vila mariana', 'moema');

INSERT INTO "ZonaEntrega" ("id", "lojaId", "bairro", "bairroBusca", "taxa", "prazoMinutos")
SELECT gen_random_uuid()::text, l."id", z.bairro, z.busca, z.taxa, z.prazo
FROM "Loja" l
CROSS JOIN (VALUES
  ('Sol e Mar', 'sol e mar', 500, 25),
  ('Brisa do Mar', 'brisa do mar', 500, 25),
  ('Olho d''Água', 'olho d''agua', 700, 30),
  ('Jardim Atlântico', 'jardim atlantico', 700, 30),
  ('Vila Luizão', 'vila luizao', 700, 30),
  ('Divinéia', 'divineia', 700, 30),
  ('Chácara Brasil', 'chacara brasil', 700, 30),
  ('Calhau', 'calhau', 800, 35),
  ('Altos do Calhau', 'altos do calhau', 800, 35),
  ('Jardim Eldorado', 'jardim eldorado', 800, 35),
  ('Cohafuma', 'cohafuma', 1200, 40),
  ('Planalto Turu', 'planalto turu', 1200, 40),
  ('Turu', 'turu', 1200, 40),
  ('Cohama', 'cohama', 1400, 45),
  ('Quintas do Calhau', 'quintas do calhau', 1400, 45),
  ('Parque Shalom', 'parque shalom', 1400, 45),
  ('Anil', 'anil', 1500, 50),
  ('Cohab Anil', 'cohab anil', 1800, 55),
  ('Vila Palmeira', 'vila palmeira', 1800, 55),
  ('Cohatrac', 'cohatrac', 1800, 55),
  ('Bequimão', 'bequimao', 1900, 55),
  ('Vicente Fialho', 'vicente fialho', 1900, 55),
  ('Vinhais Velho', 'vinhais velho', 1900, 55),
  ('Vinhais', 'vinhais', 2000, 60),
  ('Renascença I e II', 'renascenca i e ii', 2000, 60),
  ('Jardim Renascença', 'jardim renascenca', 2000, 60),
  ('São Marcos', 'sao marcos', 2000, 60),
  ('Ponta d''Areia', 'ponta d''areia', 2000, 60),
  ('Ponta do Farol', 'ponta do farol', 2000, 60),
  ('Jaracati', 'jaracati', 2000, 60),
  ('Maranhão Novo', 'maranhao novo', 2000, 60),
  ('Ipase', 'ipase', 2000, 60),
  ('Cohaserma', 'cohaserma', 2000, 60),
  ('Angelim', 'angelim', 2000, 60),
  ('Barreto', 'barreto', 2000, 60)
) AS z(bairro, busca, taxa, prazo)
WHERE l."slug" = 'matriz' AND l."cidade" = 'São Luís'
ON CONFLICT ("lojaId", "bairroBusca") DO NOTHING;
