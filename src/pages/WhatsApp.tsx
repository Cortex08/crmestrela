import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, isToday } from 'date-fns';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useAuth } from '@/contexts/AuthContext';
import { wa, type WaChat, type WaMessage, type WaStatus } from '@/lib/whatsappApi';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Loader2, Smartphone, Wifi, WifiOff, QrCode, RefreshCw, Send, Search, Settings, LogOut, MessageSquare, Users, Plus, ShieldCheck, ServerCrash } from 'lucide-react';

const fmtHora = (ms: number | null) => (ms ? (isToday(ms) ? format(ms, 'HH:mm') : format(ms, 'dd/MM')) : '');
const fmtPhone = (p?: string | null) => {
  const d = (p || '').replace(/\D/g, '');
  if (d.length === 13) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 12) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  return p || '';
};
const STATUS: Record<WaStatus, [string, string]> = {
  conectado: ['Conectado', 'bg-green-100 text-green-700 hover:bg-green-100'],
  conectando: ['Aguardando leitura do QR', 'bg-amber-100 text-amber-700 hover:bg-amber-100'],
  desconectado: ['Desconectado', 'bg-gray-100 text-gray-700 hover:bg-gray-100'],
};

/* ---------------- Configuração do servidor (admin) ---------------- */
function ConfigServidor({ onSaved }: { onSaved: () => void }) {
  const { data, refetch } = useQuery({ queryKey: ['wa-config'], queryFn: () => wa<{ api_url: string; has_key: boolean }>('config_get') });
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (data?.api_url) setUrl(data.api_url); }, [data?.api_url]);
  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await wa('config_set', { api_url: url.trim(), api_key: key.trim() });
      toast.success('Servidor do WhatsApp conectado!');
      setKey('');
      refetch();
      onSaved();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Settings className="h-4 w-4" />Servidor Evolution API</CardTitle>
        <CardDescription>Dados do servidor que faz a ponte com o WhatsApp. A chave fica guardada no servidor e nunca aparece no navegador.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={salvar} className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <div className="space-y-2"><Label>URL do servidor</Label><Input placeholder="https://evolution.seudominio.com" value={url} onChange={(e) => setUrl(e.target.value)} required /></div>
          <div className="space-y-2">
            <Label>API Key global</Label>
            <Input type="password" autoComplete="off" placeholder={data?.has_key ? '•••••••• (deixe vazio para manter)' : 'AUTHENTICATION_API_KEY'} value={key} onChange={(e) => setKey(e.target.value)} />
          </div>
          <Button type="submit" disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Testar e salvar</Button>
        </form>
        {data?.has_key && <p className="text-xs text-green-600 mt-3 flex items-center gap-1"><ShieldCheck className="h-3 w-3" />Servidor configurado</p>}
      </CardContent>
    </Card>
  );
}

/* ---------------- Meu celular ---------------- */
function MeuCelular({ status, phone, profile, onChange }: { status: WaStatus; phone?: string | null; profile?: string | null; onChange: () => void }) {
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [numero, setNumero] = useState('');
  const [busy, setBusy] = useState(false);
  const [sair, setSair] = useState(false);

  const conectar = async (porCodigo = false) => {
    setBusy(true);
    try {
      const r = await wa<{ status: WaStatus; qr?: string | null; pairing_code?: string | null }>('connect', porCodigo ? { number: numero } : {});
      if (r.status === 'conectado') { toast.success('WhatsApp já está conectado'); onChange(); return; }
      setQr(r.qr || null);
      setCode(r.pairing_code || null);
      if (!r.qr && !r.pairing_code) toast.info('Aguarde alguns segundos e clique em "Gerar novo QR"');
      onChange();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  // QR do WhatsApp expira em ~40s: renova enquanto estiver aguardando
  useEffect(() => {
    if (status !== 'conectando' || !qr) return;
    const t = setInterval(() => conectar(false), 40000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, qr]);
  useEffect(() => { if (status === 'conectado') { setQr(null); setCode(null); } }, [status]);

  const desconectar = async () => {
    try { await wa('disconnect'); toast.success('WhatsApp desconectado'); onChange(); } catch (e: any) { toast.error(e.message); }
    setSair(false);
  };

  if (status === 'conectado') {
    return (
      <Card className="border-green-500/30">
        <CardContent className="pt-6 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center"><Wifi className="h-6 w-6 text-green-600" /></div>
            <div>
              <p className="font-semibold">{profile || 'Seu WhatsApp'}</p>
              <p className="text-sm text-muted-foreground">{fmtPhone(phone)} · conectado</p>
            </div>
          </div>
          <Button variant="outline" onClick={() => setSair(true)}><LogOut className="h-4 w-4 mr-2" />Desconectar celular</Button>
        </CardContent>
        <ConfirmDialog open={sair} onOpenChange={setSair} title="Desconectar seu WhatsApp?" description="O CRM deixa de ver e enviar mensagens pelo seu número até você conectar de novo." confirmText="Desconectar" onConfirm={desconectar} />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Smartphone className="h-4 w-4" />Conectar meu celular</CardTitle>
        <CardDescription>Cada pessoa conecta o próprio WhatsApp. Só você vê as suas conversas aqui.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-2">
        <div className="space-y-3 text-sm">
          <ol className="list-decimal list-inside space-y-1.5 text-muted-foreground">
            <li>Clique em <strong className="text-foreground">Gerar QR Code</strong>.</li>
            <li>No celular, abra o WhatsApp → <strong className="text-foreground">Configurações</strong> (ou ⋮) → <strong className="text-foreground">Aparelhos conectados</strong>.</li>
            <li>Toque em <strong className="text-foreground">Conectar um aparelho</strong> e aponte a câmera para o QR.</li>
          </ol>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button onClick={() => conectar(false)} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <QrCode className="h-4 w-4 mr-2" />}{qr ? 'Gerar novo QR' : 'Gerar QR Code'}
            </Button>
            {status === 'conectando' && <Button variant="outline" onClick={onChange}><RefreshCw className="h-4 w-4 mr-2" />Já escaneei</Button>}
          </div>
          <div className="pt-4 border-t space-y-2">
            <Label className="text-xs">Sem câmera? Conecte por código (informe seu número com DDD)</Label>
            <div className="flex gap-2">
              <Input placeholder="(11) 99999-9999" value={numero} onChange={(e) => setNumero(e.target.value)} />
              <Button variant="outline" disabled={busy || numero.replace(/\D/g, '').length < 10} onClick={() => conectar(true)}>Gerar código</Button>
            </div>
            {code && <p className="text-sm">Digite no celular (Aparelhos conectados → Conectar com número): <span className="font-mono text-lg font-bold tracking-widest">{code}</span></p>}
          </div>
        </div>
        <div className="flex items-center justify-center rounded-xl border bg-white min-h-[260px]">
          {qr ? <img src={qr} alt="QR Code do WhatsApp" className="w-64 h-64" /> : (
            <div className="text-center text-muted-foreground p-6"><QrCode className="h-12 w-12 mx-auto mb-2 opacity-30" /><p className="text-sm">O QR Code aparece aqui</p></div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------------- Conversas ---------------- */
function Conversas() {
  const qc = useQueryClient();
  const [sel, setSel] = useState<WaChat | null>(null);
  const [busca, setBusca] = useState('');
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [novo, setNovo] = useState(false);
  const [novoNum, setNovoNum] = useState('');
  const [novoTxt, setNovoTxt] = useState('');
  const fim = useRef<HTMLDivElement>(null);

  const { data: chats = [], isLoading, error, refetch } = useQuery({
    queryKey: ['wa-chats'],
    queryFn: async () => (await wa<{ chats: WaChat[] }>('chats')).chats,
    refetchInterval: 20000,
  });
  const { data: msgs = [], isLoading: loadingMsgs } = useQuery({
    queryKey: ['wa-msgs', sel?.jid],
    enabled: !!sel,
    queryFn: async () => (await wa<{ messages: WaMessage[] }>('messages', { jid: sel!.jid })).messages,
    refetchInterval: 8000,
  });
  useEffect(() => { fim.current?.scrollIntoView({ block: 'end' }); }, [msgs.length, sel?.jid]);

  const lista = useMemo(() => {
    const q = busca.toLowerCase();
    return chats.filter((c) => !q || (c.name || '').toLowerCase().includes(q) || (c.phone || '').includes(q.replace(/\D/g, '') || '§'));
  }, [chats, busca]);

  const enviar = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!sel || !texto.trim()) return;
    setEnviando(true);
    try {
      await wa('send', { jid: sel.jid, text: texto.trim() });
      setTexto('');
      qc.invalidateQueries({ queryKey: ['wa-msgs', sel.jid] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setEnviando(false);
    }
  };
  const enviarNovo = async () => {
    setEnviando(true);
    try {
      await wa('send', { number: novoNum, text: novoTxt.trim() });
      toast.success('Mensagem enviada');
      setNovo(false); setNovoNum(''); setNovoTxt('');
      setTimeout(() => refetch(), 1500);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setEnviando(false);
    }
  };

  if (error) return <Card><CardContent className="pt-6 text-sm text-destructive">{(error as Error).message}</CardContent></Card>;

  return (
    <Card className="overflow-hidden">
      <div className="grid md:grid-cols-[320px_1fr] h-[calc(100vh-260px)] min-h-[480px]">
        <div className={cn('border-r flex flex-col min-h-0', sel && 'hidden md:flex')}>
          <div className="p-3 border-b flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8 h-9" placeholder="Buscar conversa" value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            <Button size="icon" variant="outline" className="h-9 w-9" title="Nova conversa" onClick={() => setNovo(true)}><Plus className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" className="h-9 w-9" title="Atualizar" onClick={() => refetch()}><RefreshCw className="h-4 w-4" /></Button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {isLoading && <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
            {!isLoading && lista.length === 0 && <p className="text-sm text-muted-foreground text-center py-10">Nenhuma conversa</p>}
            {lista.map((c) => (
              <button key={c.jid} onClick={() => setSel(c)} className={cn('w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/60 border-b border-border/40', sel?.jid === c.jid && 'bg-muted')}>
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
                  {c.picture ? <img src={c.picture} alt="" className="h-10 w-10 object-cover" referrerPolicy="no-referrer" /> : c.group ? <Users className="h-5 w-5 text-primary" /> : <span className="text-sm font-semibold text-primary">{(c.name || '?').slice(0, 1).toUpperCase()}</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between gap-2"><span className="font-medium text-sm truncate">{c.name || fmtPhone(c.phone)}</span><span className="text-[11px] text-muted-foreground shrink-0">{fmtHora(c.last_at)}</span></div>
                  <div className="flex justify-between gap-2"><span className="text-xs text-muted-foreground truncate">{c.last_text || (c.group ? 'Grupo' : fmtPhone(c.phone))}</span>{c.unread > 0 && <Badge className="h-5 min-w-5 px-1.5 text-[10px] bg-green-600 hover:bg-green-600">{c.unread}</Badge>}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className={cn('flex flex-col min-h-0', !sel && 'hidden md:flex')}>
          {!sel ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground"><div className="text-center"><MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-30" /><p className="text-sm">Escolha uma conversa</p></div></div>
          ) : (
            <>
              <div className="p-3 border-b flex items-center gap-3">
                <Button variant="ghost" size="sm" className="md:hidden" onClick={() => setSel(null)}>←</Button>
                <div className="min-w-0"><p className="font-medium truncate">{sel.name || fmtPhone(sel.phone)}</p><p className="text-xs text-muted-foreground">{sel.group ? 'Grupo' : fmtPhone(sel.phone)}</p></div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-muted/30">
                {loadingMsgs && <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
                {msgs.map((m) => (
                  <div key={m.id} className={cn('flex', m.from_me ? 'justify-end' : 'justify-start')}>
                    <div className={cn('max-w-[78%] rounded-lg px-3 py-1.5 text-sm shadow-sm whitespace-pre-wrap break-words', m.from_me ? 'bg-green-100 text-green-950 dark:bg-green-900/40 dark:text-green-50' : 'bg-background')}>
                      {sel.group && !m.from_me && m.name && <p className="text-[11px] font-semibold text-primary">{m.name}</p>}
                      {m.text || <span className="italic text-muted-foreground">mensagem</span>}
                      <span className="block text-[10px] text-muted-foreground text-right mt-0.5">{fmtHora(m.at)}</span>
                    </div>
                  </div>
                ))}
                <div ref={fim} />
              </div>
              <form onSubmit={enviar} className="p-3 border-t flex gap-2 items-end">
                <Textarea rows={1} className="min-h-[40px] max-h-32 resize-none" placeholder="Digite uma mensagem" value={texto} onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }} maxLength={4000} />
                <Button type="submit" size="icon" className="h-10 w-10 shrink-0" disabled={enviando || !texto.trim()}>{enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</Button>
              </form>
            </>
          )}
        </div>
      </div>

      <Dialog open={novo} onOpenChange={setNovo}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nova conversa</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2"><Label>Número com DDD</Label><Input placeholder="(11) 99999-9999" value={novoNum} onChange={(e) => setNovoNum(e.target.value)} /></div>
            <div className="space-y-2"><Label>Mensagem</Label><Textarea rows={4} value={novoTxt} onChange={(e) => setNovoTxt(e.target.value)} maxLength={4000} /></div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setNovo(false)}>Cancelar</Button>
              <Button onClick={enviarNovo} disabled={enviando || novoNum.replace(/\D/g, '').length < 10 || !novoTxt.trim()}>{enviando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Enviar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ---------------- Admin: celulares da equipe ---------------- */
function Equipe() {
  const [desc, setDesc] = useState<any>(null);
  const { data, isLoading, refetch, isFetching } = useQuery({ queryKey: ['wa-admin'], queryFn: async () => (await wa<{ instances: any[] }>('admin_list')).instances });
  const desconectar = async () => {
    try { await wa('disconnect', { user_id: desc.user_id }); toast.success('Celular desconectado'); refetch(); } catch (e: any) { toast.error(e.message); }
    setDesc(null);
  };
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div><CardTitle className="text-base">Celulares da equipe</CardTitle><CardDescription>Quem já conectou o WhatsApp ao CRM</CardDescription></div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}><RefreshCw className={cn('h-4 w-4 mr-2', isFetching && 'animate-spin')} />Atualizar</Button>
      </CardHeader>
      <CardContent>
        {isLoading ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div> : (
          <Table>
            <TableHeader><TableRow><TableHead>Usuário</TableHead><TableHead>Número</TableHead><TableHead>Status</TableHead><TableHead className="hidden md:table-cell">Desde</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {(data || []).length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Ninguém conectou ainda</TableCell></TableRow>}
              {(data || []).map((i) => (
                <TableRow key={i.user_id}>
                  <TableCell><p className="font-medium">{i.profiles?.nome}</p><p className="text-xs text-muted-foreground">{i.profiles?.email}</p></TableCell>
                  <TableCell>{fmtPhone(i.phone) || '—'}</TableCell>
                  <TableCell><Badge className={STATUS[i.status as WaStatus]?.[1]}>{STATUS[i.status as WaStatus]?.[0]}</Badge></TableCell>
                  <TableCell className="hidden md:table-cell">{i.connected_at && i.status === 'conectado' ? format(new Date(i.connected_at), 'dd/MM/yyyy HH:mm') : '—'}</TableCell>
                  <TableCell className="text-right">{i.status !== 'desconectado' && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDesc(i)}>Desconectar</Button>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <ConfirmDialog open={!!desc} onOpenChange={(o) => !o && setDesc(null)} title="Desconectar este celular?" description={`O WhatsApp de ${desc?.profiles?.nome} deixará de funcionar no CRM até ele conectar de novo.`} confirmText="Desconectar" onConfirm={desconectar} />
    </Card>
  );
}

/* ---------------- Página ---------------- */
export default function WhatsApp() {
  const { roles } = useAuth();
  const isAdmin = roles.includes('admin');
  const qc = useQueryClient();
  const [aba, setAba] = useState('conversas');

  const { data: st, isLoading, refetch } = useQuery({
    queryKey: ['wa-status'],
    queryFn: () => wa<{ configured: boolean; status?: WaStatus; phone?: string; profile_name?: string; reachable?: boolean; error?: string }>('status'),
    refetchInterval: (q) => ((q.state.data as any)?.status === 'conectando' ? 4000 : 60000),
  });
  const status: WaStatus = st?.status || 'desconectado';
  const prevStatus = useRef<WaStatus | undefined>();
  useEffect(() => {
    if (prevStatus.current === 'conectando' && status === 'conectado') toast.success('WhatsApp conectado! 🎉');
    prevStatus.current = status;
  }, [status]);

  const refresh = () => { refetch(); qc.invalidateQueries({ queryKey: ['wa-admin'] }); };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><MessageSquare className="h-6 w-6 text-green-600" />WhatsApp</h1>
            <p className="text-muted-foreground">Converse com clientes pelo seu próprio número, direto do CRM</p>
          </div>
          {st?.configured && (
            <Badge className={cn('w-fit', STATUS[status][1])}>{status === 'conectado' ? <Wifi className="h-3 w-3 mr-1" /> : <WifiOff className="h-3 w-3 mr-1" />}{STATUS[status][0]}</Badge>
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : !st?.configured ? (
          isAdmin ? (
            <div className="space-y-4">
              <Card className="border-amber-300 bg-amber-50/60 dark:bg-amber-950/20">
                <CardContent className="pt-6 text-sm">Para liberar o WhatsApp para a equipe, informe o servidor da <strong>Evolution API</strong> abaixo. Depois disso, cada usuário entra aqui e conecta o próprio celular pelo QR Code.</CardContent>
              </Card>
              <ConfigServidor onSaved={refresh} />
            </div>
          ) : (
            <Card><CardContent className="pt-6 text-center py-12"><ServerCrash className="h-10 w-10 mx-auto mb-3 text-muted-foreground" /><p className="font-medium">O WhatsApp ainda não foi liberado</p><p className="text-sm text-muted-foreground">O administrador precisa configurar o servidor primeiro.</p></CardContent></Card>
          )
        ) : (
          <>
            {st.reachable === false && (
              <Card className="border-destructive/40"><CardContent className="pt-6 text-sm text-destructive flex items-center gap-2"><ServerCrash className="h-4 w-4" />O servidor do WhatsApp não está respondendo. {isAdmin ? 'Verifique se a Evolution API está no ar.' : 'Avise o administrador.'}</CardContent></Card>
            )}
            <Tabs value={status === 'conectado' ? aba : aba === 'conversas' ? 'celular' : aba} onValueChange={setAba}>
              <TabsList>
                {status === 'conectado' && <TabsTrigger value="conversas">Conversas</TabsTrigger>}
                <TabsTrigger value="celular">Meu celular</TabsTrigger>
                {isAdmin && <TabsTrigger value="equipe">Equipe</TabsTrigger>}
                {isAdmin && <TabsTrigger value="config">Servidor</TabsTrigger>}
              </TabsList>
              {status === 'conectado' && <TabsContent value="conversas"><Conversas /></TabsContent>}
              <TabsContent value="celular"><MeuCelular status={status} phone={st.phone} profile={st.profile_name} onChange={refresh} /></TabsContent>
              {isAdmin && <TabsContent value="equipe"><Equipe /></TabsContent>}
              {isAdmin && <TabsContent value="config"><ConfigServidor onSaved={refresh} /></TabsContent>}
            </Tabs>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
