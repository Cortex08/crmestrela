import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, startOfMonth, endOfMonth, parseISO, isToday, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import { Clock, LogIn, LogOut, Coffee, Play, ChevronLeft, ChevronRight, Download, AlertCircle, CheckCircle2, Loader2, Calendar as CalendarIcon, History, Info, MapPin, ScanFace, ShieldAlert } from 'lucide-react';
import { cn, friendlyError } from '@/lib/utils';
import { STATUS_PONTO, statusPonto, fmtHora, fmtMin, intervalToMin } from '@/lib/rh';
import { downloadCSV } from '@/lib/csv';
import { FaceCapture } from '@/components/FaceCapture';
import { carregarFaceApi } from '@/lib/face';

const MEU = '__meu__';
type Campo = 'entrada' | 'saida_almoco' | 'retorno_almoco' | 'saida';

const ACOES: Record<Campo, { label: string; icon: any; color: string }> = {
  entrada: { label: 'Entrada', icon: LogIn, color: 'from-green-500 to-green-600' },
  saida_almoco: { label: 'Almoço', icon: Coffee, color: 'from-orange-500 to-orange-600' },
  retorno_almoco: { label: 'Retorno', icon: Play, color: 'from-blue-500 to-blue-600' },
  saida: { label: 'Saída', icon: LogOut, color: 'from-red-500 to-red-600' },
};
const ORDEM: Campo[] = ['entrada', 'saida_almoco', 'retorno_almoco', 'saida'];
const CORES_STEP: Record<Campo, string> = {
  entrada: 'bg-green-100 text-green-600 dark:bg-green-900/50',
  saida_almoco: 'bg-orange-100 text-orange-600 dark:bg-orange-900/50',
  retorno_almoco: 'bg-blue-100 text-blue-600 dark:bg-blue-900/50',
  saida: 'bg-red-100 text-red-600 dark:bg-red-900/50',
};

const pegarLocalizacao = () =>
  new Promise<string | null>((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(`${p.coords.latitude.toFixed(5)},${p.coords.longitude.toFixed(5)}`),
      () => resolve(null),
      { timeout: 5000, maximumAge: 60000 },
    );
  });

export default function Ponto() {
  const { user } = useAuth();
  const { canRead, canUpdate } = usePermissions();
  const gestor = canRead('funcionarios');
  const qc = useQueryClient();
  useEffect(() => { carregarFaceApi().catch(() => {}); }, []); // prepara o reconhecimento antes de alguém chegar
  const [agora, setAgora] = useState(new Date());
  const [mes, setMes] = useState(new Date());
  const [sel, setSel] = useState(MEU);
  const [showHist, setShowHist] = useState(false);
  const [just, setJust] = useState<any>(null);
  const [justTxt, setJustTxt] = useState('');
  const [facialOpen, setFacialOpen] = useState(false);
  const [cadastroOpen, setCadastroOpen] = useState(false);

  useEffect(() => { const t = setInterval(() => setAgora(new Date()), 1000); return () => clearInterval(t); }, []);
  // baixa e aquece o reconhecimento facial em segundo plano, para a câmera abrir rápido
  useEffect(() => { const t = setTimeout(() => { import('@/lib/face').then((m) => m.carregarFaceApi()).catch(() => {}); }, 800); return () => clearTimeout(t); }, []);

  const { data: meuFunc, isLoading: loadingFunc } = useQuery({
    queryKey: ['current-employee', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from('employees').select('id, nome, cargo, status').eq('user_id', user!.id).eq('status', 'ativo').maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: funcs = [] } = useQuery({
    queryKey: ['employees-ponto'],
    enabled: gestor,
    queryFn: async () => {
      const { data, error } = await supabase.from('employees').select('id, nome').eq('status', 'ativo').order('nome');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: rostos = [] } = useQuery({
    queryKey: ['rostos-cadastrados'],
    enabled: !!meuFunc?.id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('rostos_cadastrados');
      if (error) throw error;
      return (data || []) as { employee_id: string }[];
    },
  });
  const meuRosto = !!meuFunc?.id && rostos.some((r) => r.employee_id === meuFunc.id);

  const proprio = sel === MEU;
  const empId = proprio ? meuFunc?.id : sel;

  const { data: hoje, isLoading: loadingHoje } = useQuery({
    queryKey: ['ponto-hoje', empId],
    enabled: !!empId,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase.from('time_records').select('*').eq('employee_id', empId!).eq('data', format(new Date(), 'yyyy-MM-dd')).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: registros = [], isLoading: loadingMes } = useQuery({
    queryKey: ['ponto-mes', empId, format(mes, 'yyyy-MM')],
    enabled: !!empId && showHist,
    queryFn: async () => {
      const { data, error } = await supabase.from('time_records').select('*').eq('employee_id', empId!)
        .gte('data', format(startOfMonth(mes), 'yyyy-MM-dd')).lte('data', format(endOfMonth(mes), 'yyyy-MM-dd')).order('data', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const bater = useMutation({
    mutationFn: async (descritor: number[] | null) => {
      const loc = await pegarLocalizacao();
      const { data, error } = await supabase.rpc('registrar_ponto_facial', { _localizacao: loc, _descriptor: descritor });
      if (error) throw error;
      return data as any;
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['ponto-hoje'] });
      qc.invalidateQueries({ queryKey: ['ponto-mes'] });
      const nome = ACOES[d?.campo as Campo]?.label || 'Ponto';
      if (d?.facial === 'nao_confere') toast.warning(`${nome} registrada às ${format(new Date(), 'HH:mm')}, mas o rosto não confere. O RH vai conferir.`);
      else toast.success(`${nome} registrada às ${format(new Date(), 'HH:mm')}${d?.facial === 'verificado' ? ' ✓ rosto confirmado' : ''}`);
      setFacialOpen(false);
    },
    // sem toast aqui: no fluxo com rosto o erro aparece dentro da câmera; no fluxo sem rosto o toast sai em semRosto()
  });

  const semRosto = () => bater.mutate(null, {
    onError: (e) => toast.error(friendlyError(e, 'Erro ao registrar ponto')),
    onSettled: () => setFacialOpen(false),
  });

  const justificar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('justificar_ponto', { _record_id: just.id, _texto: justTxt });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ponto-mes'] });
      toast.success('Justificativa registrada!');
      setJust(null);
    },
    onError: (e) => toast.error(friendlyError(e, 'Erro ao justificar')),
  });

  const proxima = ORDEM.find((c) => !hoje?.[c]) || null;
  const totalMes = registros.reduce((s: number, r: any) => s + intervalToMin(r.horas_trabalhadas), 0);
  const extrasMes = registros.reduce((s: number, r: any) => s + intervalToMin(r.horas_extras), 0);

  const exportar = () => {
    if (!registros.length) return toast.error('Nenhum registro para exportar');
    downloadCSV(`ponto-${format(mes, 'yyyy-MM')}`, ['Data', 'Entrada', 'Saída Almoço', 'Retorno Almoço', 'Saída', 'Horas', 'Extras', 'Status', 'Justificativa'],
      registros.map((r: any) => [format(parseISO(r.data), 'dd/MM/yyyy'), fmtHora(r.entrada), fmtHora(r.saida_almoco), fmtHora(r.retorno_almoco), fmtHora(r.saida),
        fmtMin(intervalToMin(r.horas_trabalhadas)), fmtMin(intervalToMin(r.horas_extras)), STATUS_PONTO[statusPonto(r)]?.[0], r.justificativa]));
  };

  if (loadingFunc) {
    return <DashboardLayout><div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div></DashboardLayout>;
  }

  const semVinculo = (
    <Card className="border-yellow-300 bg-yellow-50/60 dark:bg-yellow-950/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><AlertCircle className="h-5 w-5 text-yellow-600" />Seu usuário ainda não está vinculado a um funcionário</CardTitle>
        <CardDescription>
          Sem esse vínculo o sistema não sabe quem é você para registrar o ponto.{' '}
          {gestor ? 'Abra Funcionários, edite o cadastro da pessoa e escolha o usuário em "Acesso ao Sistema".' : 'Peça ao administrador ou ao RH para vincular seu usuário ao seu cadastro de funcionário.'}
        </CardDescription>
      </CardHeader>
    </Card>
  );

  if (!meuFunc && !gestor) {
    return <DashboardLayout><div className="max-w-2xl mx-auto py-6">{semVinculo}</div></DashboardLayout>;
  }

  const nomeVisto = proprio ? meuFunc?.nome || 'Meu Ponto' : funcs.find((e: any) => e.id === sel)?.nome || 'Funcionário';

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold">Ponto</h1>
            <p className="text-sm text-muted-foreground">{nomeVisto}</p>
          </div>
          <div className="flex items-center gap-2">
            {gestor && funcs.length > 0 && (
              <Select value={sel} onValueChange={setSel}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="Funcionário" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={MEU}>👤 Meu Ponto</SelectItem>
                  {funcs.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Button variant={showHist ? 'default' : 'outline'} size="icon" onClick={() => setShowHist(!showHist)} title="Histórico"><History className="h-4 w-4" /></Button>
          </div>
        </div>

        {!meuFunc && proprio && semVinculo}

        {proprio && meuFunc && !meuRosto && (
          <Card className="border-amber-300 bg-amber-50/60 dark:bg-amber-950/20">
            <CardContent className="py-3 px-4 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-start gap-2 text-sm">
                <ShieldAlert className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <span>Seu rosto ainda não está cadastrado. Cadastre para bater o ponto com reconhecimento facial; sem ele, o ponto fica marcado como "sem verificação".</span>
              </div>
              <Button size="sm" onClick={() => setCadastroOpen(true)}><ScanFace className="h-4 w-4 mr-1" />Cadastrar meu rosto</Button>
            </CardContent>
          </Card>
        )}

        {proprio && meuFunc && (
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="py-3 px-4">
              <div className="flex items-start gap-3">
                <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  <span className="font-semibold text-foreground">Como bater seu ponto:</span> toque no botão grande abaixo. A sequência é{' '}
                  <strong>Entrada</strong> → <strong>Almoço</strong> → <strong>Retorno</strong> → <strong>Saída</strong>. O horário gravado é o do servidor,
                  não o do seu celular. Se pedir localização, aceite (opcional).
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="overflow-hidden">
          <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-background p-8 text-center border-b">
            <div className="text-6xl font-mono font-bold tracking-tight text-primary mb-2">
              {format(agora, 'HH:mm')}<span className="text-3xl text-primary/60">{format(agora, ':ss')}</span>
            </div>
            <div className="text-muted-foreground capitalize">{format(agora, "EEEE, dd 'de' MMMM", { locale: ptBR })}</div>
          </div>
          <CardContent className="p-6">
            {!proprio ? (
              <div className="text-center py-8 text-muted-foreground"><AlertCircle className="h-10 w-10 mx-auto mb-2 opacity-50" /><p>Selecione "Meu Ponto" para registrar</p></div>
            ) : !meuFunc ? null : proxima ? (
              <button
                onClick={() => (meuRosto ? setFacialOpen(true) : bater.mutate(null, { onError: (e) => toast.error(friendlyError(e, 'Erro ao registrar ponto')) }))}
                disabled={bater.isPending || loadingHoje}
                className={cn('w-full h-24 rounded-2xl font-bold text-xl text-white shadow-lg bg-gradient-to-r transition-all hover:scale-[1.02] active:scale-[0.98]',
                  'flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none', ACOES[proxima].color)}
              >
                {bater.isPending ? <Loader2 className="h-8 w-8 animate-spin" /> : (() => { const I = ACOES[proxima].icon; return <><I className="h-8 w-8" /><span>Bater Ponto - {ACOES[proxima].label}</span></>; })()}
              </button>
            ) : (
              <div className="text-center py-8">
                <CheckCircle2 className="h-16 w-16 mx-auto text-green-500 mb-3" />
                <p className="font-semibold text-xl">Jornada Completa!</p>
                <p className="text-sm text-muted-foreground mt-1">Todos os pontos foram registrados hoje</p>
              </div>
            )}
          </CardContent>
        </Card>

        {empId && (
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base font-medium flex items-center gap-2"><CalendarIcon className="h-4 w-4" />Hoje</CardTitle></CardHeader>
            <CardContent>
              {loadingHoje ? <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div> : (
                <div className="flex justify-between">
                  {ORDEM.map((c, i) => {
                    const I = ACOES[c].icon;
                    const feito = !!hoje?.[c];
                    const next = !feito && ORDEM.slice(0, i).every((x) => !!hoje?.[x]);
                    return (
                      <div key={c} className="flex flex-col items-center text-center flex-1">
                        <div className={cn('w-12 h-12 rounded-full flex items-center justify-center mb-2', feito ? CORES_STEP[c] : next ? 'bg-primary/10 text-primary ring-2 ring-primary ring-offset-2' : 'bg-muted text-muted-foreground')}>
                          <I className="h-5 w-5" />
                        </div>
                        <span className="text-xs font-medium text-muted-foreground">{ACOES[c].label}</span>
                        <span className={cn('text-sm font-mono font-bold', feito ? 'text-foreground' : 'text-muted-foreground/50')}>{fmtHora(hoje?.[c])}</span>
                        {feito && hoje?.verificacao_facial?.[c]?.status === 'verificado' && <span className="text-[10px] text-green-600">rosto ✓</span>}
                        {feito && hoje?.verificacao_facial?.[c]?.status === 'nao_confere' && <span className="text-[10px] text-red-600">rosto não confere</span>}
                      </div>
                    );
                  })}
                </div>
              )}
              {hoje?.horas_trabalhadas && (
                <div className="mt-4 pt-4 border-t flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Horas trabalhadas hoje</span>
                  <span className="font-bold font-mono text-lg">{fmtMin(intervalToMin(hoje.horas_trabalhadas))}</span>
                </div>
              )}
              {hoje?.localizacao_entrada && (
                <a className="mt-2 text-xs text-muted-foreground inline-flex items-center gap-1 hover:underline" target="_blank" rel="noreferrer"
                  href={`https://www.google.com/maps?q=${encodeURIComponent(hoje.localizacao_entrada)}`}><MapPin className="h-3 w-3" />Local da entrada</a>
              )}
            </CardContent>
          </Card>
        )}

        {showHist && empId && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base font-medium flex items-center gap-2"><History className="h-4 w-4" />Histórico</CardTitle>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMes((m) => addMonths(m, -1))}><ChevronLeft className="h-4 w-4" /></Button>
                  <span className="text-sm font-medium min-w-[100px] text-center capitalize">{format(mes, 'MMM yyyy', { locale: ptBR })}</span>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMes((m) => addMonths(m, 1))}><ChevronRight className="h-4 w-4" /></Button>
                  <Button variant="outline" size="sm" className="ml-2" onClick={exportar}><Download className="h-3 w-3 mr-1" />CSV</Button>
                </div>
              </div>
              {registros.length > 0 && (
                <p className="text-xs text-muted-foreground pt-1">
                  <Clock className="h-3 w-3 inline mr-1" />Total no mês: <strong>{fmtMin(totalMes)}</strong> · Extras: <strong>{fmtMin(extrasMes)}</strong> · {registros.length} dia(s)
                </p>
              )}
            </CardHeader>
            <CardContent>
              {loadingMes ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                : registros.length === 0 ? <div className="text-center py-8 text-muted-foreground">Nenhum registro neste mês</div> : (
                  <div className="max-h-[420px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data</TableHead><TableHead className="text-center">Entrada</TableHead>
                          <TableHead className="text-center hidden sm:table-cell">Almoço</TableHead><TableHead className="text-center">Saída</TableHead>
                          <TableHead className="text-center">Horas</TableHead><TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {registros.map((r: any) => {
                          const st = statusPonto(r);
                          const podeJust = st === 'incompleto' && (proprio || canUpdate('funcionarios'));
                          return (
                            <TableRow key={r.id} className={isToday(parseISO(r.data)) ? 'bg-primary/5' : ''}>
                              <TableCell>
                                <div className="flex flex-col"><span className="font-medium">{format(parseISO(r.data), 'dd/MM')}</span>
                                  <span className="text-xs text-muted-foreground capitalize">{format(parseISO(r.data), 'EEE', { locale: ptBR })}</span></div>
                              </TableCell>
                              <TableCell className="text-center font-mono text-sm">{fmtHora(r.entrada)}</TableCell>
                              <TableCell className="text-center font-mono text-sm hidden sm:table-cell">{r.saida_almoco ? `${fmtHora(r.saida_almoco)}-${fmtHora(r.retorno_almoco)}` : '--'}</TableCell>
                              <TableCell className="text-center font-mono text-sm">{fmtHora(r.saida)}</TableCell>
                              <TableCell className="text-center font-mono text-sm font-medium">{r.horas_trabalhadas ? fmtMin(intervalToMin(r.horas_trabalhadas)) : '--'}</TableCell>
                              <TableCell>
                                <Badge className={cn('text-xs', STATUS_PONTO[st]?.[1], podeJust && 'cursor-pointer')} title={r.justificativa || (podeJust ? 'Clique para justificar' : '')}
                                  onClick={() => { if (podeJust) { setJust(r); setJustTxt(''); } }}>
                                  {STATUS_PONTO[st]?.[0] || st}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
            </CardContent>
          </Card>
        )}
      </div>

      <FaceCapture
        open={facialOpen}
        onOpenChange={setFacialOpen}
        titulo="Bater ponto com o rosto"
        descricao="Olhe de frente para a câmera e fique parado."
        onRosto={async (d) => {
          try { await bater.mutateAsync(d); } catch (e) { throw new Error(friendlyError(e, 'Erro ao registrar ponto')); }
        }}
        onSemRosto={semRosto}
      />
      <FaceCapture
        open={cadastroOpen}
        onOpenChange={setCadastroOpen}
        titulo="Cadastrar meu rosto"
        descricao="Faça em um lugar claro, de frente para a câmera, sem óculos escuros ou boné."
        onRosto={async (d) => {
          const { error } = await supabase.rpc('cadastrar_rosto', { _employee_id: meuFunc!.id, _descriptor: d });
          if (error) throw new Error(friendlyError(error, 'Erro ao cadastrar o rosto'));
          toast.success('Rosto cadastrado! Agora é só olhar para a câmera ao bater o ponto.');
          qc.invalidateQueries({ queryKey: ['rostos-cadastrados'] });
          setCadastroOpen(false);
        }}
      />

      <Dialog open={!!just} onOpenChange={(o) => !o && setJust(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Justificar registro incompleto</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">Data: {just && format(parseISO(just.data), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</p>
            <Textarea placeholder="Descreva o motivo da falta ou registro incompleto..." value={justTxt} onChange={(e) => setJustTxt(e.target.value)} rows={4} maxLength={1000} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setJust(null)}>Cancelar</Button>
            <Button onClick={() => justificar.mutate()} disabled={justTxt.trim().length < 3 || justificar.isPending}>
              {justificar.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
