import { Suspense } from 'react';
import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import { db } from '@/server/db';
import { paginaAdmin } from '@/server/auth';
import { configuracoes } from '@/server/configuracoes';
import { decifrar } from '@/server/cripto';
import { AutoImprimir } from '@/components/impressao/Impressao';
import { FARMACIA } from '@/lib/farmacia';
import { MODALIDADE } from '@/lib/dominio';
import { linhaEndereco, type EnderecoPedido } from '@/lib/endereco';
import { brl, dataHora } from '@/lib/formato';

export const metadata = { title: 'Imprimir pedido', robots: { index: false } };

const PAGAMENTO: Record<string, string> = { CARTAO_CREDITO: 'Cartão de crédito', CARTAO_DEBITO: 'Cartão de débito', PIX: 'Pix', DINHEIRO: 'Dinheiro', CREDIARIO: 'Crediário', CONVENIO: 'Convênio' };
const mascaraCpf = (c: string) => c.replace(/\D/g, '').replace(/^(\d{3})\d{6}(\d{2})$/, '$1.***.***-$2');

async function Comanda({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  await paginaAdmin('pedidos');
  const [{ id }, sp, cfg] = await Promise.all([params, searchParams, configuracoes()]);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const p = await db.pedido.findUnique({
    where: { id },
    include: { itens: true, loja: true, usuario: { select: { nome: true, telefone: true } }, motoboy: { select: { nome: true } }, cupom: { select: { codigo: true } }, pagamentos: { where: { status: 'APROVADO' }, select: { id: true }, take: 1 }, notas: { where: { status: { not: 'CANCELADA' } }, select: { numero: true, serie: true, chaveAcesso: true }, take: 1 } },
  });
  if (!p) notFound();
  const { impressao: imp, contato } = cfg;
  const e = p.enderecoEntrega as EnderecoPedido | null;
  const cpf = imp.mostrarCpf && p.cpfNaNota ? mascaraCpf(decifrar(p.cpfNaNota) ?? p.cpfNaNota) : null;
  const pago = p.pagamentos.length > 0 || p.canal === 'PDV';
  const largura = imp.larguraMm === 58 ? '48mm' : '72mm';
  const via = (n: number) => (
    <section key={n} className="comanda">
      <h1>{FARMACIA.nome}</h1>
      <p className="c">{p.loja.logradouro}, {p.loja.numero} - {p.loja.bairro}<br />{contato.telefone || contato.whatsapp}</p>
      {imp.cabecalho && <p className="c">{imp.cabecalho}</p>}
      <hr />
      <p className="g">PEDIDO #{p.numero}</p>
      <p>{dataHora(p.criadoEm)} · {p.canal}{imp.vias > 1 && ` · via ${n + 1}/${imp.vias}`}</p>
      <hr />
      <p><b>{e?.destinatario || p.usuario?.nome || 'Consumidor'}</b> {p.usuario?.telefone}</p>
      {cpf && <p>CPF {cpf}</p>}
      <p><b>{MODALIDADE[p.modalidade].toUpperCase()}</b></p>
      {e && <p>{linhaEndereco(e)}{e.cep && ` · CEP ${e.cep}`}</p>}
      {p.motoboy && <p>Entregador: {p.motoboy.nome}</p>}
      <hr />
      <table>
        <tbody>
          {p.itens.map((i) => (
            <tr key={i.id}><td><b>{i.quantidade}x</b> {i.nome}<br /><small>{i.sku}</small></td><td className="d">{brl(i.total)}</td></tr>
          ))}
        </tbody>
      </table>
      {p.observacao && <><hr /><p><b>OBS: {p.observacao}</b></p></>}
      <hr />
      <table>
        <tbody>
          <tr><td>Subtotal</td><td className="d">{brl(p.subtotal)}</td></tr>
          {p.descontoPromocoes > 0 && <tr><td>Promoções</td><td className="d">- {brl(p.descontoPromocoes)}</td></tr>}
          {p.descontoCupom > 0 && <tr><td>Cupom {p.cupom?.codigo}</td><td className="d">- {brl(p.descontoCupom)}</td></tr>}
          {p.frete > 0 && <tr><td>Entrega</td><td className="d">{brl(p.frete)}</td></tr>}
          <tr className="g"><td>TOTAL</td><td className="d">{brl(p.total)}</td></tr>
        </tbody>
      </table>
      <hr />
      <p>{pago ? <>{PAGAMENTO[p.metodoPagamento ?? ''] ?? 'Pagamento'} · <b>PAGO</b></> : <b>A RECEBER: {brl(p.total)} · {PAGAMENTO[p.metodoPagamento ?? ''] ?? ''}</b>}</p>
      {p.notas[0] && <><hr /><p className="c">NFC-e {p.notas[0].serie}/{p.notas[0].numero}<br /><small>{p.notas[0].chaveAcesso.replace(/(\d{4})/g, '$1 ')}</small></p></>}
      {(imp.rodape || contato.rtNome) && <><hr /><p className="c">{imp.rodape}{contato.rtNome && <><br />Farm. resp.: {contato.rtNome} {contato.rtCrf}</>}</p></>}
    </section>
  );
  return (
    <>
      <style>{`
        @page { size: ${imp.larguraMm}mm auto; margin: 3mm; }
        body { background: #fff; }
        .comanda { width: ${largura}; margin: 0 auto; font: 12px/1.35 ui-monospace, Menlo, monospace; color: #000; }
        .comanda + .comanda { break-before: page; margin-top: 24px; }
        .comanda h1 { font-size: 15px; text-align: center; margin: 0 0 2px; }
        .comanda p { margin: 2px 0; } .comanda .c { text-align: center; } .comanda .g { font-size: 15px; font-weight: 700; }
        .comanda hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
        .comanda table { width: 100%; border-collapse: collapse; } .comanda td { vertical-align: top; padding: 2px 0; } .comanda .d { text-align: right; white-space: nowrap; padding-left: 6px; }
        .comanda small { font-size: 10px; }
        @media print { .no-print { display: none !important; } }
      `}</style>
      <AutoImprimir ativo={sp.auto === '1' || imp.automatica} />
      {Array.from({ length: imp.vias }, (_, n) => via(n))}
    </>
  );
}

export default function Imprimir(props: PageProps<'/imprimir/pedido/[id]'>) {
  return <Suspense><Comanda params={props.params} searchParams={props.searchParams} /></Suspense>;
}
