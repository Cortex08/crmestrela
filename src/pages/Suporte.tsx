import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { LifeBuoy, Plus, MessageSquareReply, Clock, CheckCircle2, Loader2 } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LoadingCard } from '@/components/ui/loading';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { friendlyError } from '@/lib/utils';

const CATEGORIAS: Record<string, string> = { duvida: 'Dúvida', problema: 'Problema', sugestao: 'Sugestão', acesso: 'Acesso e senha' };
const STATUS: Record<string, { label: string; cls: string }> = {
  aberto: { label: 'Aberto', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  em_andamento: { label: 'Em andamento', cls: 'bg-blue-100 text-blue-800 border-blue-200' },
  resolvido: { label: 'Resolvido', cls: 'bg-green-100 text-green-800 border-green-200' },
};

const FAQ: { titulo: string; itens: [string, string][] }[] = [
  {
    titulo: 'Acesso e conta',
    itens: [
      ['Esqueci minha senha. O que faço?', 'Peça a um administrador para redefinir sua senha em Usuários. Depois de entrar, você pode trocar a senha em Meu perfil.'],
      ['Não consigo abrir uma tela do menu.', 'Cada pessoa vê só os módulos liberados para o seu cargo. Se precisa de uma tela que não aparece, abra um chamado de acesso e diga qual tela e por quê.'],
    ],
  },
  {
    titulo: 'Imóveis e site',
    itens: [
      ['Como faço um imóvel aparecer no site?', 'Em Imóveis, clique em “Publicar no site” no cartão do imóvel. Ele só aparece enquanto o status for Disponível. Para tirar do ar, use “Remover do site”.'],
      ['Como vinculo um inquilino ou comprador a um imóvel?', 'Abra o imóvel e use a opção de vincular. O sistema cria o contrato, muda o status do imóvel e, no aluguel, gera os repasses do proprietário.'],
      ['Onde edito telefone, WhatsApp e texto “Sobre” do site?', 'Em Site Público, no menu. Só administradores podem salvar essas alterações.'],
    ],
  },
  {
    titulo: 'Clientes e contratos',
    itens: [
      ['Como vejo todos os inquilinos de um proprietário?', 'Em Clientes, clique no proprietário. O painel mostra os inquilinos, os contratos de cada um e o botão “Ler contrato”.'],
      ['Os contatos que chegam pelo site vão para onde?', 'Para Clientes, como “interessado” (ou proprietário, quando pedem para anunciar), com origem Site.'],
    ],
  },
  {
    titulo: 'Ponto e equipe',
    itens: [
      ['Como bato o ponto com reconhecimento facial?', 'Em Ponto, toque no botão de bater ponto, olhe de frente para a câmera e fique parado por um instante. A imagem não é gravada; só um código numérico do rosto é comparado.'],
      ['A câmera não abre ou o rosto não é reconhecido.', 'Libere o acesso à câmera nas permissões do navegador, procure um local com boa luz e tente de novo. Se não funcionar, você pode bater o ponto sem reconhecimento, e o RH vê a marcação como “sem rosto”.'],
      ['Meu usuário não aparece em Ponto.', 'Seu usuário precisa estar vinculado a um funcionário ativo. Peça ao RH ou a um administrador em Funcionários.'],
    ],
  },
  {
    titulo: 'WhatsApp',
    itens: [
      ['Como conecto meu WhatsApp?', 'Em WhatsApp, gere o QR code e escaneie pelo aparelho em Aparelhos conectados. Cada pessoa conecta o próprio número. O administrador precisa ter configurado o servidor antes, na aba Servidor.'],
    ],
  },
];

type Ticket = {
  id: string; user_id: string; categoria: string; assunto: string; mensagem: string; status: string;
  resposta: string | null; respondido_em: string | null; created_at: string;
};

const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

function TicketCard({ t, autor, onResponder }: { t: Ticket; autor?: string; onResponder?: () => void }) {
  const s = STATUS[t.status] || STATUS.aberto;
  return (
    <Card className="card-premium">
      <CardContent className="pt-5 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold break-words">{t.assunto}</p>
            <p className="text-xs text-muted-foreground">
              {CATEGORIAS[t.categoria] || t.categoria} · {quando(t.created_at)}{autor ? ` · ${autor}` : ''}
            </p>
          </div>
          <Badge variant="outline" className={s.cls}>{s.label}</Badge>
        </div>
        <p className="text-sm whitespace-pre-wrap break-words">{t.mensagem}</p>
        {t.resposta && (
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <p className="text-xs font-medium text-muted-foreground mb-1">Resposta da equipe{t.respondido_em ? ` · ${quando(t.respondido_em)}` : ''}</p>
            <p className="whitespace-pre-wrap break-words">{t.resposta}</p>
          </div>
        )}
        {onResponder && (
          <Button size="sm" variant="outline" onClick={onResponder}><MessageSquareReply className="h-4 w-4 mr-2" />{t.resposta ? 'Editar resposta' : 'Responder'}</Button>
        )}
      </CardContent>
    </Card>
  );
}

const Suporte = () => {
  const { user, roles } = useAuth() as any;
  const isAdmin = (roles || []).includes('admin');
  const qc = useQueryClient();

  const [novoOpen, setNovoOpen] = useState(false);
  const [cat, setCat] = useState('duvida');
  const [assunto, setAssunto] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [enviando, setEnviando] = useState(false);

  const [respondendo, setRespondendo] = useState<Ticket | null>(null);
  const [texto, setTexto] = useState('');
  const [novoStatus, setNovoStatus] = useState('resolvido');
  const [salvando, setSalvando] = useState(false);
  const [filtro, setFiltro] = useState('abertos');

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ['support-tickets'],
    queryFn: async () => {
      const { data, error } = await supabase.from('support_tickets' as any)
        .select('id, user_id, categoria, assunto, mensagem, status, resposta, respondido_em, created_at')
        .order('created_at', { ascending: false }).limit(300);
      if (error) throw error;
      return (data || []) as unknown as Ticket[];
    },
  });

  const { data: nomes = {} } = useQuery({
    queryKey: ['support-nomes'],
    enabled: isAdmin,
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, nome');
      return Object.fromEntries((data || []).map((p: any) => [p.id, p.nome])) as Record<string, string>;
    },
  });

  const meus = tickets.filter((t) => t.user_id === user?.id);
  const todosFiltrados = useMemo(
    () => tickets.filter((t) => filtro === 'todos' || (filtro === 'abertos' ? t.status !== 'resolvido' : t.status === 'resolvido')),
    [tickets, filtro],
  );
  const pendentes = tickets.filter((t) => t.status !== 'resolvido').length;

  async function enviar() {
    if (assunto.trim().length < 3) return toast.error('Escreva um assunto com pelo menos 3 letras.');
    if (mensagem.trim().length < 5) return toast.error('Descreva o que aconteceu ou o que você precisa.');
    setEnviando(true);
    const { error } = await supabase.from('support_tickets' as any).insert({ categoria: cat, assunto: assunto.trim(), mensagem: mensagem.trim() });
    setEnviando(false);
    if (error) return toast.error(friendlyError(error, 'Não foi possível enviar o chamado'));
    toast.success('Chamado enviado! Você acompanha a resposta aqui.');
    setNovoOpen(false); setAssunto(''); setMensagem(''); setCat('duvida');
    qc.invalidateQueries({ queryKey: ['support-tickets'] });
  }

  function abrirResposta(t: Ticket) {
    setRespondendo(t); setTexto(t.resposta || ''); setNovoStatus(t.status === 'aberto' ? 'resolvido' : t.status);
  }

  async function salvarResposta() {
    if (!respondendo) return;
    if (novoStatus === 'resolvido' && !texto.trim()) return toast.error('Escreva uma resposta antes de marcar como resolvido.');
    setSalvando(true);
    const { error } = await supabase.from('support_tickets' as any).update({
      status: novoStatus, resposta: texto.trim() || null, respondido_por: user?.id, respondido_em: new Date().toISOString(),
    }).eq('id', respondendo.id);
    setSalvando(false);
    if (error) return toast.error(friendlyError(error, 'Não foi possível salvar a resposta'));
    toast.success('Resposta salva!');
    setRespondendo(null);
    qc.invalidateQueries({ queryKey: ['support-tickets'] });
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2"><LifeBuoy className="h-7 w-7" />Suporte</h1>
            <p className="text-muted-foreground">Tire dúvidas, relate um problema ou sugira melhorias. A equipe responde por aqui.</p>
          </div>
          <Button onClick={() => setNovoOpen(true)}><Plus className="h-4 w-4 mr-2" />Novo chamado</Button>
        </div>

        <Tabs defaultValue="ajuda">
          <TabsList>
            <TabsTrigger value="ajuda">Ajuda rápida</TabsTrigger>
            <TabsTrigger value="meus">Meus chamados{meus.length ? ` (${meus.length})` : ''}</TabsTrigger>
            {isAdmin && <TabsTrigger value="todos">Todos{pendentes ? ` · ${pendentes} pendente${pendentes > 1 ? 's' : ''}` : ''}</TabsTrigger>}
          </TabsList>

          <TabsContent value="ajuda" className="space-y-6 mt-4">
            {FAQ.map((g) => (
              <section key={g.titulo} className="space-y-2">
                <h2 className="text-lg font-semibold">{g.titulo}</h2>
                <div className="rounded-lg border divide-y">
                  {g.itens.map(([p, r]) => (
                    <details key={p} className="group p-4">
                      <summary className="cursor-pointer font-medium list-none flex items-center justify-between gap-3">
                        {p}<span className="text-muted-foreground transition-transform group-open:rotate-45 text-xl leading-none">+</span>
                      </summary>
                      <p className="mt-2 text-sm text-muted-foreground">{r}</p>
                    </details>
                  ))}
                </div>
              </section>
            ))}
            <p className="text-sm text-muted-foreground">Não achou o que precisa? Abra um chamado e a equipe responde por aqui.</p>
          </TabsContent>

          <TabsContent value="meus" className="space-y-3 mt-4">
            {isLoading ? <LoadingCard /> : meus.length === 0 ? (
              <Card className="card-premium"><CardContent className="py-12 text-center text-muted-foreground">
                Você ainda não abriu nenhum chamado.
              </CardContent></Card>
            ) : meus.map((t) => <TicketCard key={t.id} t={t} />)}
          </TabsContent>

          {isAdmin && (
            <TabsContent value="todos" className="space-y-3 mt-4">
              <div className="flex gap-2 flex-wrap">
                {[['abertos', 'Pendentes'], ['resolvidos', 'Resolvidos'], ['todos', 'Todos']].map(([v, l]) => (
                  <Button key={v} size="sm" variant={filtro === v ? 'default' : 'outline'} onClick={() => setFiltro(v)}>{l}</Button>
                ))}
              </div>
              {isLoading ? <LoadingCard /> : todosFiltrados.length === 0 ? (
                <Card className="card-premium"><CardContent className="py-12 text-center text-muted-foreground flex flex-col items-center gap-2">
                  <CheckCircle2 className="h-8 w-8" />Nenhum chamado nesta lista.
                </CardContent></Card>
              ) : todosFiltrados.map((t) => <TicketCard key={t.id} t={t} autor={(nomes as any)[t.user_id] || 'Usuário'} onResponder={() => abrirResposta(t)} />)}
            </TabsContent>
          )}
        </Tabs>
      </div>

      <Dialog open={novoOpen} onOpenChange={(o) => !enviando && setNovoOpen(o)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo chamado</DialogTitle>
            <DialogDescription>Quanto mais detalhes, mais rápido conseguimos ajudar. Diga em qual tela estava e o que esperava acontecer.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={cat} onValueChange={setCat}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(CATEGORIAS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sup-assunto">Assunto</Label>
              <Input id="sup-assunto" value={assunto} maxLength={120} onChange={(e) => setAssunto(e.target.value)} placeholder="Ex.: Não consigo publicar um imóvel no site" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sup-msg">Mensagem</Label>
              <Textarea id="sup-msg" rows={6} value={mensagem} maxLength={3000} onChange={(e) => setMensagem(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">Não envie senhas nem dados de cartão neste chamado.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={enviando} onClick={() => setNovoOpen(false)}>Cancelar</Button>
            <Button disabled={enviando} onClick={enviar}>{enviando ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enviando…</> : 'Enviar chamado'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!respondendo} onOpenChange={(o) => !salvando && !o && setRespondendo(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Responder chamado</DialogTitle>
            <DialogDescription className="break-words">{respondendo?.assunto}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm whitespace-pre-wrap rounded-md border bg-muted/40 p-3 break-words">{respondendo?.mensagem}</p>
            <div className="space-y-1.5">
              <Label htmlFor="sup-resp">Resposta</Label>
              <Textarea id="sup-resp" rows={5} value={texto} maxLength={3000} onChange={(e) => setTexto(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Situação</Label>
              <Select value={novoStatus} onValueChange={setNovoStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(STATUS).map(([v, s]) => <SelectItem key={v} value={v}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={salvando} onClick={() => setRespondendo(null)}>Cancelar</Button>
            <Button disabled={salvando} onClick={salvarResposta}>{salvando ? <><Clock className="h-4 w-4 mr-2" />Salvando…</> : 'Salvar resposta'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Suporte;
