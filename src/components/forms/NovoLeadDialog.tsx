import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { ArrowLeft, Building2, CalendarCheck, Check, Clock, Loader2, Search, UserPlus } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useOptions } from '@/hooks/useOptions';
import { cn, formatCurrency, friendlyError } from '@/lib/utils';

/**
 * "Novo lead" do Funil, em 3 passos:
 *   1. quem é (nome, WhatsApp e o que procura)
 *   2. qual imóvel vai visitar
 *   3. dia e horário da visita -> já vai para a Agenda
 * Tudo é salvo de uma vez pela função funil_novo_lead (cliente + card no Funil + visita).
 */

type Imovel = {
  id: string; codigo: string; titulo: string; bairro: string | null; endereco: string | null; numero: string | null;
  tipo: string; valor_venda: number | null; valor_aluguel: number | null; quartos: number | null; fotos: string[] | null;
};

const mascaraZap = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};
const sem = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const precoDe = (i: Imovel) => (i.tipo === 'venda' ? i.valor_venda : i.valor_aluguel);
const HORARIOS = Array.from({ length: 25 }, (_, k) => {
  const min = 8 * 60 + k * 30; // 08:00 até 20:00, de meia em meia hora
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
});

/** Lead que já está no Funil: o assistente começa direto na escolha da casa */
export interface LeadExistente { dealId: string; nome: string; whatsapp?: string | null; procura?: string | null }

interface Props { open: boolean; onOpenChange: (o: boolean) => void; lead?: LeadExistente | null }

export const NovoLeadDialog = ({ open, onOpenChange, lead = null }: Props) => {
  const qc = useQueryClient();
  const { user, roles } = useAuth();
  const isAdmin = roles.includes('admin');
  const { profiles } = useOptions(open && isAdmin, { profiles: true });

  const [passo, setPasso] = useState<1 | 2 | 3>(1);
  const [nome, setNome] = useState('');
  const [zap, setZap] = useState('');
  const [procura, setProcura] = useState('');
  const [busca, setBusca] = useState('');
  const [imovel, setImovel] = useState<Imovel | null>(null);
  const [dia, setDia] = useState(format(addDays(new Date(), 1), 'yyyy-MM-dd'));
  const [hora, setHora] = useState('10:00');
  const [duracao, setDuracao] = useState('60');
  const [responsavel, setResponsavel] = useState('');
  const [salvando, setSalvando] = useState(false);

  // sempre que abrir, começa do zero
  useEffect(() => {
    if (!open) return;
    setPasso(lead ? 2 : 1); setNome(lead?.nome ?? ''); setZap(''); setProcura(lead?.procura ?? ''); setBusca(''); setImovel(null);
    setDia(format(addDays(new Date(), 1), 'yyyy-MM-dd')); setHora('10:00'); setDuracao('60'); setResponsavel('');
  }, [open, lead]);

  const { data: imoveis = [], isLoading: carregandoImoveis } = useQuery({
    queryKey: ['novo-lead-imoveis'],
    enabled: open,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('properties')
        .select('id, codigo, titulo, bairro, endereco, numero, tipo, valor_venda, valor_aluguel, quartos, fotos')
        .eq('status', 'disponivel')
        .order('codigo');
      if (error) throw error;
      return (data || []) as Imovel[];
    },
  });

  const digitos = zap.replace(/\D/g, '');
  // avisa se esse WhatsApp já é de alguém cadastrado (o lead vai para a mesma pessoa)
  const { data: jaExiste } = useQuery({
    queryKey: ['novo-lead-cliente', digitos],
    enabled: open && !lead && digitos.length >= 10,
    queryFn: async () => {
      const { data } = await supabase.from('clients').select('id, nome, whatsapp').or(`whatsapp.ilike.%${digitos.slice(-8)}%`).limit(5);
      return (data || []).find((c) => {
        const w = (c.whatsapp || '').replace(/\D/g, '');
        return w === digitos || w === `55${digitos}` || `55${w}` === digitos;
      }) || null;
    },
  });

  const filtrados = useMemo(() => {
    const t = sem(busca.trim());
    if (!t) return imoveis;
    return imoveis.filter((i) => sem(`${i.codigo} ${i.titulo} ${i.bairro || ''} ${i.endereco || ''}`).includes(t));
  }, [imoveis, busca]);

  // visitas já marcadas nesse imóvel no dia escolhido (para não marcar duas no mesmo horário)
  const { data: visitasDoDia = [] } = useQuery({
    queryKey: ['novo-lead-visitas', imovel?.id, dia],
    enabled: open && passo === 3 && !!imovel && !!dia,
    queryFn: async () => {
      const ini = new Date(`${dia}T00:00:00`);
      const fim = addDays(ini, 1);
      const { data } = await supabase
        .from('calendar_events')
        .select('id, titulo, data_inicio, data_fim, corretor:profiles!calendar_events_corretor_id_fkey(nome)')
        .eq('imovel_id', imovel!.id)
        .neq('status', 'concluido')
        .gte('data_inicio', ini.toISOString())
        .lt('data_inicio', fim.toISOString())
        .order('data_inicio');
      return (data || []) as any[];
    },
  });

  const inicio = useMemo(() => (dia && hora ? new Date(`${dia}T${hora}:00`) : null), [dia, hora]);
  const fimVisita = inicio ? new Date(inicio.getTime() + Number(duracao) * 60_000) : null;
  const choque = inicio && fimVisita
    ? visitasDoDia.find((v) => new Date(v.data_inicio) < fimVisita && new Date(v.data_fim) > inicio)
    : null;

  const passo1Ok = nome.trim().length >= 2 && (digitos.length === 10 || digitos.length === 11) && procura.trim().length > 0;

  const salvar = async (comVisita: boolean) => {
    if (!user) return toast.error('Faça login novamente');
    if (comVisita && (!imovel || !inicio)) return toast.error('Escolha o imóvel, o dia e o horário');
    if (comVisita && inicio && inicio.getTime() < Date.now() - 5 * 60_000) return toast.error('Esse horário já passou');
    setSalvando(true);
    const { data, error } = lead
      ? await supabase.rpc('funil_marcar_visita' as any, {
          _deal_id: lead.dealId,
          _imovel_id: imovel!.id,
          _inicio: inicio!.toISOString(),
          _duracao_min: Number(duracao),
          _responsavel: isAdmin && responsavel ? responsavel : null,
        })
      : await supabase.rpc('funil_novo_lead' as any, {
      _nome: nome.trim(),
      _whatsapp: digitos,
      _procura: procura.trim(),
      _imovel_id: comVisita ? imovel!.id : null,
      _inicio: comVisita ? inicio!.toISOString() : null,
      _duracao_min: Number(duracao),
      _responsavel: isAdmin && responsavel ? responsavel : null,
    });
    setSalvando(false);
    if (error) return toast.error(friendlyError(error, 'Não foi possível salvar o lead'));
    qc.invalidateQueries({ queryKey: ['deals'] });
    qc.invalidateQueries({ queryKey: ['calendar_events'] });
    qc.invalidateQueries({ queryKey: ['clients'] });
    qc.invalidateQueries({ queryKey: ['opt', 'clients'] });
    const novo = (data as any)?.cliente_novo;
    toast.success(
      comVisita
        ? `Visita marcada: ${format(inicio!, "EEEE, dd/MM 'às' HH:mm", { locale: ptBR })} no ${imovel!.codigo}`
        : 'Interesse salvo no Funil',
      { description: comVisita ? 'Já está na Agenda e no Funil em "Visita Agendada".' : `Está em "Novo Lead". Quando a pessoa escolher a casa, toque em "Marcar visita" no card.${novo ? '' : ' (Ligado ao cliente que já tinha esse WhatsApp.)'}` },
    );
    onOpenChange(false);
  };

  const titulos = { 1: 'Quem é a pessoa?', 2: lead ? `Qual imóvel ${lead.nome.split(' ')[0]} vai visitar?` : 'Qual imóvel ela vai visitar?', 3: 'Quando é a visita?' } as const;
  const passos = lead ? [2, 3] : [1, 2, 3];
  const posicao = passos.indexOf(passo) + 1;

  return (
    <Dialog open={open} onOpenChange={(o) => !salvando && onOpenChange(o)}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto [&>*]:min-w-0">
        <DialogHeader>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {passos.map((n) => (
              <span key={n} className={cn('h-1.5 flex-1 rounded-full', n <= passo ? 'bg-primary' : 'bg-muted')} />
            ))}
          </div>
          <DialogTitle className="pt-2">{titulos[passo]}</DialogTitle>
          <DialogDescription>
            Passo {posicao} de {passos.length}
            {lead?.procura ? <span className="mt-1 block text-foreground/80">Procura: {lead.procura}</span> : null}
          </DialogDescription>
        </DialogHeader>

        {passo === 1 && (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (passo1Ok) salvar(false); }}>
            <div className="space-y-1.5">
              <Label htmlFor="nl-nome">Nome</Label>
              <Input id="nl-nome" autoFocus value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Maria Souza" maxLength={120} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nl-zap">WhatsApp</Label>
              <Input id="nl-zap" inputMode="tel" value={zap} onChange={(e) => setZap(mascaraZap(e.target.value))} placeholder="(11) 98888-7777" />
              {jaExiste && (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Esse WhatsApp já é de <b>{jaExiste.nome}</b>. O lead vai para esse cadastro, sem duplicar o cliente.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nl-procura">O que procura</Label>
              <Textarea id="nl-procura" rows={3} value={procura} onChange={(e) => setProcura(e.target.value)} maxLength={500}
                placeholder="Ex.: casa de 2 cômodos no Varginha, até R$ 1.200, com vaga para moto" />
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
              <Button type="button" variant="outline" disabled={!passo1Ok || salvando} onClick={() => setPasso(2)}>
                <CalendarCheck className="mr-2 h-4 w-4" />Já marcar visita
              </Button>
              <Button type="submit" disabled={!passo1Ok || salvando}>
                {salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                Salvar interesse
              </Button>
            </div>
          </form>
        )}

        {passo === 2 && (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por código, bairro ou rua" className="pl-9" />
            </div>
            <div className="max-h-[48vh] space-y-2 overflow-y-auto pr-1" role="listbox" aria-label="Imóveis disponíveis">
              {carregandoImoveis && <p className="py-6 text-center text-sm text-muted-foreground">Carregando imóveis…</p>}
              {!carregandoImoveis && filtrados.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">Nenhum imóvel disponível com essa busca.</p>
              )}
              {filtrados.map((i) => {
                const sel = imovel?.id === i.id;
                const preco = precoDe(i);
                return (
                  <button
                    key={i.id} type="button" role="option" aria-selected={sel}
                    onClick={() => { setImovel(i); setPasso(3); }}
                    className={cn('flex w-full items-center gap-3 rounded-lg border p-2 text-left transition-colors hover:bg-muted/60',
                      sel && 'border-primary bg-primary/5')}
                  >
                    <div className="h-14 w-20 shrink-0 overflow-hidden rounded-md bg-muted">
                      {i.fotos?.[0]
                        ? <img src={i.fotos[0]} alt="" loading="lazy" className="h-full w-full object-cover" />
                        : <Building2 className="m-auto mt-4 h-6 w-6 text-muted-foreground" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{i.codigo} · {i.titulo}</p>
                      <p className="truncate text-xs text-muted-foreground">{[i.endereco, i.bairro].filter(Boolean).join(' – ')}</p>
                      <p className="text-xs font-medium">
                        {preco ? `${formatCurrency(preco)}${i.tipo === 'locacao' ? '/mês' : ''}` : 'Sem valor'}
                        <span className="font-normal text-muted-foreground"> · {i.tipo === 'venda' ? 'Venda' : 'Aluguel'}</span>
                      </p>
                    </div>
                    {sel && <Check className="h-4 w-4 shrink-0 text-primary" />}
                  </button>
                );
              })}
            </div>
            {!lead && (
              <div className="pt-1">
                <Button type="button" variant="ghost" onClick={() => setPasso(1)}><ArrowLeft className="mr-1 h-4 w-4" />Voltar</Button>
              </div>
            )}
          </div>
        )}

        {passo === 3 && imovel && (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); salvar(true); }}>
            <button type="button" onClick={() => setPasso(2)}
              className="flex w-full items-center gap-3 rounded-lg border bg-muted/40 p-2 text-left hover:bg-muted/70">
              <div className="h-12 w-16 shrink-0 overflow-hidden rounded-md bg-muted">
                {imovel.fotos?.[0] && <img src={imovel.fotos[0]} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{imovel.codigo} · {imovel.titulo}</p>
                <p className="truncate text-xs text-muted-foreground">{[imovel.endereco, imovel.numero, imovel.bairro].filter(Boolean).join(', ')}</p>
              </div>
              <span className="text-xs text-primary">Trocar</span>
            </button>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="nl-dia">Dia</Label>
                <Input id="nl-dia" type="date" value={dia} min={format(new Date(), 'yyyy-MM-dd')} onChange={(e) => setDia(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Horário</Label>
                <Select value={hora} onValueChange={setHora}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-64">
                    {HORARIOS.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {dia && (
              <p className="-mt-2 text-xs text-muted-foreground first-letter:uppercase">{format(new Date(`${dia}T12:00:00`), "EEEE, dd 'de' MMMM", { locale: ptBR })}</p>
            )}

            <div className={cn('grid gap-3', isAdmin ? 'grid-cols-2' : 'grid-cols-1')}>
              <div className="space-y-1.5">
                <Label>Duração</Label>
                <Select value={duracao} onValueChange={setDuracao}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 minutos</SelectItem>
                    <SelectItem value="60">1 hora</SelectItem>
                    <SelectItem value="90">1 hora e meia</SelectItem>
                    <SelectItem value="120">2 horas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {isAdmin && (
                <div className="space-y-1.5">
                  <Label>Quem vai levar</Label>
                  <Select value={responsavel || user?.id || ''} onValueChange={setResponsavel}>
                    <SelectTrigger><SelectValue placeholder="Eu" /></SelectTrigger>
                    <SelectContent>
                      {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.id === user?.id ? `${p.nome} (eu)` : p.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {visitasDoDia.length > 0 && (
              <div className={cn('rounded-lg border p-3 text-xs', choque ? 'border-amber-300 bg-amber-50 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100' : 'bg-muted/40')}>
                <p className="mb-1 flex items-center gap-1.5 font-semibold">
                  <Clock className="h-3.5 w-3.5" />
                  {choque ? 'Já tem visita nesse imóvel nesse horário' : 'Visitas já marcadas nesse imóvel nesse dia'}
                </p>
                <ul className="space-y-0.5">
                  {visitasDoDia.map((v) => (
                    <li key={v.id}>
                      {format(new Date(v.data_inicio), 'HH:mm')}–{format(new Date(v.data_fim), 'HH:mm')} · {v.titulo}{v.corretor?.nome ? ` (${v.corretor.nome})` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={() => setPasso(2)}><ArrowLeft className="mr-1 h-4 w-4" />Voltar</Button>
              <Button type="submit" disabled={salvando || !dia || !hora}>
                {salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarCheck className="mr-2 h-4 w-4" />}
                Marcar visita
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};
