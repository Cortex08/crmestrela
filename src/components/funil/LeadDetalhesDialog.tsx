import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { Building2, CalendarPlus, CheckCircle2, Clock, Edit, Loader2, MapPin, MessageSquare } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { ETAPAS } from '@/components/forms/DealForm';
import { openWhatsapp, hasValidWhatsapp } from '@/lib/whatsapp';
import { cn, formatCurrency, friendlyError } from '@/lib/utils';

/** Ficha do lead no Funil: dados salvos, fase (com troca rápida), imóvel e visitas marcadas. */

interface Props {
  dealId: string | null;
  onOpenChange: (o: boolean) => void;
  canUpdate: boolean;
  onMarcarVisita: (d: { dealId: string; nome: string; whatsapp?: string | null; procura?: string | null }) => void;
  onEditar: (dealId: string) => void;
}

const zapBonito = (w?: string | null) => {
  const d = (w || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return w || '';
};

const Linha = ({ rotulo, children }: { rotulo: string; children: React.ReactNode }) => (
  <div className="grid grid-cols-[110px_1fr] gap-2 py-1.5 text-sm">
    <span className="text-muted-foreground">{rotulo}</span>
    <span className="min-w-0 break-words">{children}</span>
  </div>
);

export const LeadDetalhesDialog = ({ dealId, onOpenChange, canUpdate, onMarcarVisita, onEditar }: Props) => {
  const qc = useQueryClient();
  const [movendo, setMovendo] = useState<string | null>(null);
  const [pedirMotivo, setPedirMotivo] = useState(false);
  const [motivo, setMotivo] = useState('');

  const { data: deal, isLoading } = useQuery({
    queryKey: ['deal-detalhe', dealId],
    enabled: !!dealId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deals')
        .select(`id, titulo, etapa, valor_estimado, proxima_acao, observacoes, motivo_perda, ultima_interacao, created_at, cliente_id,
          cliente:clients(id, nome, whatsapp, email, interesse, origem_lead, created_at),
          imovel:properties(id, codigo, titulo, endereco, numero, bairro, tipo, valor_aluguel, valor_venda, fotos),
          corretor:profiles(nome)`)
        .eq('id', dealId!)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: visitas = [] } = useQuery({
    queryKey: ['deal-detalhe-visitas', deal?.cliente_id],
    enabled: !!deal?.cliente_id,
    queryFn: async () => {
      const { data } = await supabase
        .from('calendar_events')
        .select('id, titulo, data_inicio, data_fim, status, local, imovel:properties(codigo), corretor:profiles!calendar_events_corretor_id_fkey(nome)')
        .eq('cliente_id', deal.cliente_id)
        .order('data_inicio', { ascending: false })
        .limit(20);
      return (data || []) as any[];
    },
  });

  const mover = async (etapa: string, motivoPerda?: string) => {
    if (!deal || etapa === deal.etapa) return;
    if (etapa === 'fechado_perdido' && motivoPerda === undefined) { setPedirMotivo(true); return; }
    setMovendo(etapa);
    const { error } = await supabase
      .from('deals')
      .update({ etapa, ultima_interacao: new Date().toISOString(), motivo_perda: etapa === 'fechado_perdido' ? (motivoPerda?.trim() || null) : null })
      .eq('id', deal.id);
    setMovendo(null);
    if (error) return toast.error(friendlyError(error, 'Não foi possível mudar a fase'));
    setPedirMotivo(false); setMotivo('');
    toast.success(`Movido para ${ETAPAS.find((e) => e.value === etapa)?.label}`);
    qc.invalidateQueries({ queryKey: ['deals'] });
    qc.invalidateQueries({ queryKey: ['deal-detalhe', deal.id] });
  };

  const procura = deal?.cliente?.interesse || (deal?.observacoes?.startsWith('Procura:') ? deal.observacoes.replace(/^Procura:\s*/, '') : null);
  const outrasObs = deal?.observacoes && !deal.observacoes.startsWith('Procura:') ? deal.observacoes : null;
  const im = deal?.imovel;
  const precoIm = im ? (im.tipo === 'venda' ? im.valor_venda : im.valor_aluguel) : null;
  const agora = Date.now();

  return (
    <Dialog open={!!dealId} onOpenChange={(o) => { if (!o) { setPedirMotivo(false); setMotivo(''); } onOpenChange(o); }}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto [&>*]:min-w-0">
        {isLoading || !deal ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{deal.cliente?.nome || deal.titulo}</DialogTitle>
              <DialogDescription>
                Lead desde {format(new Date(deal.created_at), "dd/MM/yyyy", { locale: ptBR })}
                {deal.ultima_interacao ? ` · última movimentação ${formatDistanceToNow(new Date(deal.ultima_interacao), { locale: ptBR, addSuffix: true })}` : ''}
              </DialogDescription>
            </DialogHeader>

            {/* Fase */}
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fase</h3>
              <div className="flex flex-wrap gap-1.5">
                {ETAPAS.map((e) => {
                  const atual = e.value === deal.etapa;
                  return (
                    <button
                      key={e.value} type="button" disabled={!canUpdate || !!movendo || atual}
                      onClick={() => mover(e.value)}
                      aria-pressed={atual}
                      className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                        atual ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted disabled:opacity-60',
                        !canUpdate && !atual && 'cursor-not-allowed')}
                    >
                      {movendo === e.value ? <Loader2 className="h-3 w-3 animate-spin" /> : <span className={cn('h-2 w-2 rounded-full', e.cor)} />}
                      {e.label}
                    </button>
                  );
                })}
              </div>
              {pedirMotivo && (
                <div className="space-y-2 rounded-lg border p-3">
                  <p className="text-sm font-medium">Por que não fechou?</p>
                  <Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: achou outro imóvel, achou caro, desistiu de mudar" autoFocus />
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => { setPedirMotivo(false); setMotivo(''); }}>Cancelar</Button>
                    <Button size="sm" variant="destructive" disabled={!!movendo} onClick={() => mover('fechado_perdido', motivo)}>Marcar como perdido</Button>
                  </div>
                </div>
              )}
              {deal.etapa === 'fechado_perdido' && deal.motivo_perda && <p className="text-xs text-muted-foreground">Motivo: {deal.motivo_perda}</p>}
            </section>

            {/* Dados da pessoa */}
            <section className="divide-y rounded-lg border px-3">
              <Linha rotulo="WhatsApp">
                {hasValidWhatsapp(deal.cliente?.whatsapp)
                  ? <button type="button" className="font-medium text-primary hover:underline" onClick={() => openWhatsapp(deal.cliente.whatsapp)}>{zapBonito(deal.cliente.whatsapp)}</button>
                  : '—'}
              </Linha>
              <Linha rotulo="Procura">{procura || '—'}</Linha>
              {deal.cliente?.email && <Linha rotulo="E-mail">{deal.cliente.email}</Linha>}
              <Linha rotulo="Origem">{deal.cliente?.origem_lead || '—'}</Linha>
              <Linha rotulo="Responsável">{deal.corretor?.nome || '—'}</Linha>
              {deal.proxima_acao && <Linha rotulo="Próxima ação">{deal.proxima_acao}</Linha>}
              {deal.valor_estimado ? <Linha rotulo="Valor">{formatCurrency(deal.valor_estimado)}</Linha> : null}
              {outrasObs && <Linha rotulo="Observações"><span className="whitespace-pre-line">{outrasObs}</span></Linha>}
            </section>

            {/* Imóvel */}
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Imóvel</h3>
              {im ? (
                <div className="flex items-center gap-3 rounded-lg border p-2">
                  <div className="h-14 w-20 shrink-0 overflow-hidden rounded-md bg-muted">
                    {im.fotos?.[0] ? <img src={im.fotos[0]} alt="" className="h-full w-full object-cover" /> : <Building2 className="m-auto mt-4 h-6 w-6 text-muted-foreground" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{im.codigo} · {im.titulo}</p>
                    <p className="truncate text-xs text-muted-foreground">{[im.endereco, im.numero, im.bairro].filter(Boolean).join(', ')}</p>
                    {precoIm ? <p className="text-xs font-medium">{formatCurrency(precoIm)}{im.tipo === 'locacao' ? '/mês' : ''}</p> : null}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Ainda não escolheu um imóvel.</p>
              )}
            </section>

            {/* Visitas */}
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Visitas</h3>
              {visitas.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma visita marcada.</p>}
              <ul className="space-y-1.5">
                {visitas.map((v) => {
                  const feita = v.status === 'concluido';
                  const passou = new Date(v.data_fim).getTime() < agora;
                  return (
                    <li key={v.id} className="flex items-start gap-2 rounded-lg border p-2 text-sm">
                      {feita ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" /> : <Clock className={cn('mt-0.5 h-4 w-4 shrink-0', passou ? 'text-amber-600' : 'text-primary')} />}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium first-letter:uppercase">
                          {format(new Date(v.data_inicio), "EEEE, dd/MM 'às' HH:mm", { locale: ptBR })}
                          {v.imovel?.codigo ? ` · ${v.imovel.codigo}` : ''}
                        </p>
                        {v.local && <p className="flex items-center gap-1 truncate text-xs text-muted-foreground"><MapPin className="h-3 w-3 shrink-0" />{v.local}</p>}
                        <p className="text-xs text-muted-foreground">
                          {feita ? 'Visita feita' : passou ? 'Horário passou — marque como concluída na Agenda' : 'Marcada'}
                          {v.corretor?.nome ? ` · ${v.corretor.nome}` : ''}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>

            <div className="flex flex-wrap justify-end gap-2 pt-1">
              {hasValidWhatsapp(deal.cliente?.whatsapp) && (
                <Button variant="outline" onClick={() => openWhatsapp(deal.cliente.whatsapp)}><MessageSquare className="mr-2 h-4 w-4" />WhatsApp</Button>
              )}
              {canUpdate && (
                <Button variant="outline" onClick={() => onEditar(deal.id)}><Edit className="mr-2 h-4 w-4" />Editar</Button>
              )}
              {canUpdate && (
                <Button onClick={() => onMarcarVisita({ dealId: deal.id, nome: deal.cliente?.nome || deal.titulo, whatsapp: deal.cliente?.whatsapp, procura })}>
                  <CalendarPlus className="mr-2 h-4 w-4" />{visitas.some((v) => v.status !== 'concluido' && new Date(v.data_fim).getTime() >= agora) ? 'Marcar outra visita' : 'Marcar visita'}
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
