-- CreateEnum
CREATE TYPE "TipoLancamento" AS ENUM ('RECEITA', 'DESPESA');

-- CreateEnum
CREATE TYPE "StatusLancamento" AS ENUM ('ABERTO', 'PAGO', 'CANCELADO');

-- CreateTable
CREATE TABLE "ContaFinanceira" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'BANCO',
    "saldoInicial" INTEGER NOT NULL DEFAULT 0,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContaFinanceira_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoriaFinanceira" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoLancamento" NOT NULL,
    "grupo" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CategoriaFinanceira_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lancamento" (
    "id" TEXT NOT NULL,
    "tipo" "TipoLancamento" NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor" INTEGER NOT NULL,
    "vencimento" TIMESTAMP(3) NOT NULL,
    "competencia" TIMESTAMP(3) NOT NULL,
    "status" "StatusLancamento" NOT NULL DEFAULT 'ABERTO',
    "pagoEm" TIMESTAMP(3),
    "valorPago" INTEGER,
    "formaPagamento" TEXT,
    "documento" TEXT,
    "observacao" TEXT,
    "categoriaId" TEXT NOT NULL,
    "contaId" TEXT,
    "fornecedorId" TEXT,
    "funcionarioId" TEXT,
    "compraId" TEXT,
    "pessoa" TEXT,
    "grupoParcelas" TEXT,
    "parcela" INTEGER,
    "totalParcelas" INTEGER,
    "origem" TEXT NOT NULL DEFAULT 'manual',
    "criadoPor" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lancamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Funcionario" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cpfCifrado" TEXT,
    "rg" TEXT,
    "nascimento" TIMESTAMP(3),
    "telefone" TEXT,
    "email" TEXT,
    "endereco" TEXT,
    "cargo" TEXT NOT NULL,
    "setor" TEXT,
    "tipoContrato" TEXT NOT NULL DEFAULT 'CLT',
    "admissao" TIMESTAMP(3) NOT NULL,
    "demissao" TIMESTAMP(3),
    "salario" INTEGER NOT NULL,
    "valeTransporte" INTEGER NOT NULL DEFAULT 0,
    "valeRefeicao" INTEGER NOT NULL DEFAULT 0,
    "outrosBeneficios" INTEGER NOT NULL DEFAULT 0,
    "jornada" TEXT,
    "escala" TEXT,
    "crf" TEXT,
    "pixCifrado" TEXT,
    "usuarioId" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "observacoes" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Funcionario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OcorrenciaFuncionario" (
    "id" TEXT NOT NULL,
    "funcionarioId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3),
    "valor" INTEGER,
    "descricao" TEXT,
    "criadoPor" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OcorrenciaFuncionario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CategoriaFinanceira_nome_tipo_key" ON "CategoriaFinanceira"("nome", "tipo");

-- CreateIndex
CREATE INDEX "Lancamento_status_vencimento_idx" ON "Lancamento"("status", "vencimento");

-- CreateIndex
CREATE INDEX "Lancamento_tipo_competencia_idx" ON "Lancamento"("tipo", "competencia");

-- CreateIndex
CREATE UNIQUE INDEX "Funcionario_usuarioId_key" ON "Funcionario"("usuarioId");

-- CreateIndex
CREATE INDEX "OcorrenciaFuncionario_funcionarioId_inicio_idx" ON "OcorrenciaFuncionario"("funcionarioId", "inicio");

-- AddForeignKey
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "CategoriaFinanceira"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "ContaFinanceira"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_funcionarioId_fkey" FOREIGN KEY ("funcionarioId") REFERENCES "Funcionario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OcorrenciaFuncionario" ADD CONSTRAINT "OcorrenciaFuncionario_funcionarioId_fkey" FOREIGN KEY ("funcionarioId") REFERENCES "Funcionario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
