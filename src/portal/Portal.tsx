import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Building2, FileText, Wallet, FolderOpen, UserRound, LogOut, Upload, Download, Plus, Loader2, KeyRound, ShieldCheck, Home } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatCurrency, formatDateBR } from '@/lib/utils';
import { abrirArquivo, chamar, enviarArquivo, getToken, setToken, PortalErro } from './api';

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Não foi possível concluir. Tente novamente.');
const mesAno = (v?: string | null) => (v ? `${v.slice(5, 7)}/${v.slice(0, 4)}` : '—');
const cpfMask = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 14);
  if (d.length <= 11) return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
};

const STATUS_IMOVEL: Record<string, { t: string; c: string }> = {
  disponivel: { t: 'Disponível', c: 'bg-green-100 text-green-800 border-green-200' },
  alugado: { t: 'Alugado', c: 'bg-blue-100 text-blue-800 border-blue-200' },
  reservado: { t: 'Reservado', c: 'bg-amber-100 text-amber-800 border-amber-200' },
  vendido: { t: 'Vendido', c: 'bg-slate-100 text-slate-700 border-slate-200' },
};
const STATUS_CONTRATO: Record<string, string> = { ativo: 'Ativo', encerrado: 'Encerrado', rascunho: 'Em preparação' };
const STATUS_ENVIO: Record<string, string> = {
  novo: 'Recebido', em_contato: 'Em contato', interessado: 'Em análise', em_negociacao: 'Em negociação',
  captado: 'Aceito', perdido: 'Encerrado', nao_interessado: 'Encerrado',
};

/* ---------- casca ---------- */
function Casca({ children, onSair, nome }: { children: React.ReactNode; onSair?: () => void; nome?: string }) {
  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-primary text-primary-foreground">
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center gap-3">
          <Logo className="w-10 h-10 p-0.5" />
          <div className="leading-tight">
            <p className="font-semibold">Portal do Cliente</p>
            <p className="text-xs opacity-80">Grupo Estrela de Davi</p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {nome && <span className="hidden sm:block text-sm opacity-90">{nome}</span>}
            {onSair && (
              <Button size="sm" variant="secondary" onClick={onSair}><LogOut className="h-4 w-4 mr-1" />Sair</Button>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}

/* ---------- login ---------- */
function Login({ onEntrou }: { onEntrou: () => void }) {
  const [cpf, setCpf] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro('');
    if (cpf.replace(/\D/g, '').length < 11 || !senha) return setErro('Informe o CPF e a senha.');
    setLoading(true);
    try {
      const r = await chamar<any>('login', { cpf, senha });
      setToken(r.token);
      onEntrou();
    } catch (err) {
      setToken(null);
      if (err instanceof PortalErro && err.motivo === 'credenciais') setErro('CPF ou senha incorretos.');
      else if (err instanceof PortalErro && err.motivo === 'muitas_tentativas') {
        const min = Math.max(1, Math.ceil((err.espera || 60) / 60));
        setErro(`Muitas tentativas. Tente novamente em ${min} minuto${min > 1 ? 's' : ''}.`);
      } else if (err instanceof PortalErro && err.motivo === 'senha_expirada') setErro('Sua senha provisória expirou. Peça uma nova à imobiliária.');
      else setErro(msg(err));
    } finally { setLoading(false); }
  };

  return (
    <Casca>
      <Card className="mx-auto max-w-md">
        <CardContent className="p-6">
          <h1 className="text-xl font-semibold mb-1">Entrar</h1>
          <p className="text-sm text-muted-foreground mb-5">Use o seu CPF e a senha que a imobiliária enviou. No primeiro acesso você escolhe uma senha nova.</p>
          <form onSubmit={entrar} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cpf">CPF</Label>
              <Input id="cpf" inputMode="numeric" autoComplete="username" placeholder="000.000.000-00" value={cpf} onChange={(e) => setCpf(cpfMask(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="senha">Senha</Label>
              <Input id="senha" type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} />
            </div>
            {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
            <Button type="submit" className="w-full" disabled={loading}>{loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Entrar</Button>
          </form>
        </CardContent>
      </Card>
    </Casca>
  );
}

/* ---------- troca de senha ---------- */
function TrocarSenha({ obrigatoria, onFeito, onSair, nome }: { obrigatoria: boolean; onFeito: () => void; onSair: () => void; nome?: string }) {
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [conf, setConf] = useState('');
  const m = useMutation({
    mutationFn: () => chamar('trocar_senha', { atual, nova }),
    onSuccess: () => { toast.success('Senha alterada!'); onFeito(); },
    onError: (e) => toast.error(msg(e)),
  });
  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (nova.length < 8) return toast.error('A nova senha precisa ter pelo menos 8 caracteres');
    if (!/[A-Za-z]/.test(nova) || !/[0-9]/.test(nova)) return toast.error('Use letras e números na nova senha');
    if (nova !== conf) return toast.error('A confirmação não é igual à nova senha');
    m.mutate();
  };
  const form = (
    <form onSubmit={enviar} className="space-y-4">
      <div className="space-y-1.5"><Label>{obrigatoria ? 'Senha provisória (a que você recebeu)' : 'Senha atual'}</Label>
        <Input type="password" autoComplete="current-password" value={atual} onChange={(e) => setAtual(e.target.value)} /></div>
      <div className="space-y-1.5"><Label>Nova senha</Label>
        <Input type="password" autoComplete="new-password" value={nova} onChange={(e) => setNova(e.target.value)} />
        <p className="text-xs text-muted-foreground">Mínimo de 8 caracteres, com letras e números.</p></div>
      <div className="space-y-1.5"><Label>Repita a nova senha</Label>
        <Input type="password" autoComplete="new-password" value={conf} onChange={(e) => setConf(e.target.value)} /></div>
      <Button type="submit" className="w-full" disabled={m.isPending}>{m.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Salvar nova senha</Button>
    </form>
  );
  if (!obrigatoria) return form;
  return (
    <Casca nome={nome} onSair={onSair}>
      <Card className="mx-auto max-w-md"><CardContent className="p-6">
        <div className="flex items-center gap-2 mb-1"><ShieldCheck className="h-5 w-5 text-primary" /><h1 className="text-xl font-semibold">Escolha a sua senha</h1></div>
        <p className="text-sm text-muted-foreground mb-5">Por segurança, troque a senha provisória antes de continuar.</p>
        {form}
      </CardContent></Card>
    </Casca>
  );
}

/* ---------- abas ---------- */
const Vazio = ({ texto }: { texto: string }) => <p className="text-sm text-muted-foreground py-10 text-center">{texto}</p>;
const Linha = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <div className="flex justify-between gap-4 py-1.5 text-sm border-b last:border-0"><span className="text-muted-foreground">{k}</span><span className="text-right font-medium">{v ?? '—'}</span></div>
);

function Dados({ me }: { me: any }) {
  const qc = useQueryClient();
  const campos = ['telefone', 'whatsapp', 'email', 'endereco', 'rg', 'data_nascimento', 'estado_civil', 'profissao', 'renda_mensal', 'contato_emergencia'] as const;
  const [f, setF] = useState<Record<string, string>>({});
  useEffect(() => {
    const n: Record<string, string> = {};
    campos.forEach((c) => { n[c] = me?.[c] == null ? '' : String(me[c]); });
    setF(n);
  }, [me]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  const salvar = useMutation({
    mutationFn: () => chamar('salvar_dados', { dados: f }),
    onSuccess: () => { toast.success('Dados salvos!'); qc.invalidateQueries({ queryKey: ['portal-me'] }); },
    onError: (e) => toast.error(msg(e)),
  });
  const [senhaAberta, setSenhaAberta] = useState(false);
  const Campo = ({ k, label, tipo = 'text', cls = '' }: { k: string; label: string; tipo?: string; cls?: string }) => (
    <div className={`space-y-1.5 ${cls}`}><Label>{label}</Label><Input type={tipo} value={f[k] ?? ''} onChange={(e) => set(k, e.target.value)} /></div>
  );
  return (
    <div className="space-y-4">
      <Card><CardContent className="p-5">
        <div className="grid sm:grid-cols-2 gap-x-6">
          <Linha k="Nome" v={me?.nome} />
          <Linha k="CPF" v={me?.cpf_final ? `•••.•••.•••-${me.cpf_final.slice(-2)}` : '—'} />
        </div>
        <p className="text-xs text-muted-foreground mt-2">Nome e CPF não podem ser alterados aqui. Se algo estiver errado, fale com a imobiliária.</p>
      </CardContent></Card>
      <Card><CardContent className="p-5">
        <h2 className="font-semibold mb-4">Suas informações</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <Campo k="telefone" label="Telefone" /><Campo k="whatsapp" label="WhatsApp" />
          <Campo k="email" label="E-mail" tipo="email" /><Campo k="data_nascimento" label="Data de nascimento" tipo="date" />
          <Campo k="rg" label="RG" /><Campo k="estado_civil" label="Estado civil" />
          <Campo k="profissao" label="Profissão" /><Campo k="renda_mensal" label="Renda mensal (R$)" tipo="number" />
          <Campo k="endereco" label="Endereço" cls="sm:col-span-2" />
          <Campo k="contato_emergencia" label="Contato de emergência (nome e telefone)" cls="sm:col-span-2" />
        </div>
        <Button className="mt-5" onClick={() => salvar.mutate()} disabled={salvar.isPending}>{salvar.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Salvar informações</Button>
      </CardContent></Card>
      <Card><CardContent className="p-5 flex items-center justify-between gap-3">
        <div><h2 className="font-semibold">Senha</h2><p className="text-sm text-muted-foreground">Troque sua senha quando quiser.</p></div>
        <Button variant="outline" onClick={() => setSenhaAberta(true)}><KeyRound className="h-4 w-4 mr-2" />Trocar senha</Button>
      </CardContent></Card>
      <Dialog open={senhaAberta} onOpenChange={setSenhaAberta}>
        <DialogContent><DialogHeader><DialogTitle>Trocar senha</DialogTitle><DialogDescription>Você continuará conectado neste aparelho.</DialogDescription></DialogHeader>
          <TrocarSenha obrigatoria={false} onFeito={() => setSenhaAberta(false)} onSair={() => {}} /></DialogContent>
      </Dialog>
    </div>
  );
}

function Contratos() {
  const q = useQuery({ queryKey: ['portal-contratos'], queryFn: () => chamar<any>('contratos') });
  if (q.isLoading) return <Vazio texto="Carregando..." />;
  const lista: any[] = q.data?.dados || [];
  if (!lista.length) return <Vazio texto="Você ainda não tem contratos por aqui." />;
  return (
    <div className="space-y-3">
      {lista.map((c) => (
        <Card key={c.id}><CardContent className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div><p className="font-semibold">{c.endereco_imovel || 'Contrato'}{c.numero_unidade ? ` • ${c.numero_unidade}` : ''}</p>
              <p className="text-xs text-muted-foreground">Contrato {c.codigo} • {c.categoria === 'proprietario' ? 'Administração de imóvel' : 'Locação'}</p></div>
            <Badge variant="outline">{STATUS_CONTRATO[c.status] || c.status}</Badge>
          </div>
          <div className="grid sm:grid-cols-2 gap-x-8 mt-3">
            <Linha k="Início" v={formatDateBR(c.data_inicio)} /><Linha k="Fim" v={formatDateBR(c.data_fim)} />
            <Linha k="Valor" v={formatCurrency(c.valor)} /><Linha k="Dia do pagamento" v={c.dia_pagamento} />
          </div>
          {c.tem_arquivo && (
            <Button size="sm" variant="outline" className="mt-3" onClick={() => abrirArquivo('contrato', c.id).catch((e) => toast.error(msg(e)))}>
              <Download className="h-4 w-4 mr-2" />Abrir contrato
            </Button>
          )}
        </CardContent></Card>
      ))}
    </div>
  );
}

function Contas({ me }: { me: any }) {
  const q = useQuery({ queryKey: ['portal-contas'], queryFn: () => chamar<any>('contas') });
  if (q.isLoading) return <Vazio texto="Carregando..." />;
  const inq: any[] = q.data?.dados?.como_inquilino || [];
  const prop: any[] = q.data?.dados?.como_proprietario || [];
  if (!inq.length && !prop.length) return <Vazio texto="Não há contas lançadas para você ainda." />;
  return (
    <div className="space-y-6">
      {inq.length > 0 && (
        <section>
          <h2 className="font-semibold mb-2">Meus aluguéis</h2>
          <div className="space-y-2">
            {inq.map((o) => (
              <Card key={o.id}><CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div><p className="font-medium">{mesAno(o.mes_referencia)}</p><p className="text-xs text-muted-foreground">Vence em {formatDateBR(o.data_vencimento)}</p></div>
                <div className="text-sm text-muted-foreground hidden md:block">
                  Aluguel {formatCurrency(o.valor_aluguel)}{o.encargos_extras ? ` + encargos ${formatCurrency(o.encargos_extras)}` : ''}{o.juros || o.multa ? ` + juros/multa ${formatCurrency((o.juros || 0) + (o.multa || 0))}` : ''}
                </div>
                <div className="text-right"><p className="font-semibold">{formatCurrency(o.valor_total)}</p>
                  {o.pago ? <Badge className="bg-green-100 text-green-800 border-green-200" variant="outline">Pago {o.data_pagamento ? `em ${formatDateBR(o.data_pagamento)}` : ''}</Badge>
                    : o.atrasado ? <Badge className="bg-red-100 text-red-800 border-red-200" variant="outline">Em atraso</Badge>
                    : <Badge variant="outline">A vencer</Badge>}</div>
              </CardContent></Card>
            ))}
          </div>
        </section>
      )}
      {prop.length > 0 && (
        <section>
          <h2 className="font-semibold mb-2">Repasses dos meus imóveis</h2>
          <div className="space-y-2">
            {prop.map((o) => (
              <Card key={o.id}><CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div><p className="font-medium">{mesAno(o.mes_referencia)}</p>
                  <p className="text-xs text-muted-foreground">Aluguel {o.inquilino_pagou ? 'recebido' : 'ainda não pago pelo inquilino'}</p></div>
                <div className="text-sm text-muted-foreground hidden md:block">Aluguel {formatCurrency(o.valor_total)}{o.percentual_comissao ? ` • taxa de administração ${o.percentual_comissao}%` : ''}</div>
                <div className="text-right"><p className="font-semibold">{formatCurrency(o.valor_repasse)}</p>
                  {o.recebeu ? <Badge className="bg-green-100 text-green-800 border-green-200" variant="outline">Repassado {o.data_repasse ? `em ${formatDateBR(o.data_repasse)}` : ''}</Badge>
                    : <Badge variant="outline">{o.data_repasse_prevista ? `Previsto ${formatDateBR(o.data_repasse_prevista)}` : 'Aguardando'}</Badge>}</div>
              </CardContent></Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Documentos() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['portal-docs'], queryFn: () => chamar<any>('documentos') });
  const input = useRef<HTMLInputElement>(null);
  const [nome, setNome] = useState('');
  const [enviando, setEnviando] = useState(false);
  const enviar = async (file?: File | null) => {
    if (!file) return;
    setEnviando(true);
    try {
      const { path } = await enviarArquivo(file, 'documento');
      await chamar('registrar_documento', { path, nome: nome.trim() || file.name, tipo_arquivo: file.type });
      toast.success('Documento enviado!');
      setNome('');
      qc.invalidateQueries({ queryKey: ['portal-docs'] });
    } catch (e) { toast.error(msg(e)); } finally { setEnviando(false); if (input.current) input.current.value = ''; }
  };
  const lista: any[] = q.data?.dados || [];
  return (
    <div className="space-y-4">
      <Card><CardContent className="p-5">
        <h2 className="font-semibold mb-1">Enviar um documento</h2>
        <p className="text-sm text-muted-foreground mb-3">RG, CPF, comprovante de renda ou de residência. PDF, foto ou Word, até 20 MB.</p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Input placeholder="Nome do documento (ex.: RG frente e verso)" value={nome} onChange={(e) => setNome(e.target.value)} />
          <input ref={input} type="file" hidden accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx" onChange={(e) => enviar(e.target.files?.[0])} />
          <Button onClick={() => input.current?.click()} disabled={enviando}>{enviando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}Escolher arquivo</Button>
        </div>
      </CardContent></Card>
      {q.isLoading ? <Vazio texto="Carregando..." /> : !lista.length ? <Vazio texto="Nenhum documento por aqui ainda." /> : (
        <div className="space-y-2">
          {lista.map((d) => (
            <Card key={d.id}><CardContent className="p-4 flex items-center justify-between gap-3">
              <div className="min-w-0"><p className="font-medium truncate">{d.nome}</p>
                <p className="text-xs text-muted-foreground">{d.origem === 'portal' ? 'Enviado por você' : 'Da imobiliária'} • {formatDateBR(d.created_at)}</p></div>
              <Button size="sm" variant="outline" onClick={() => abrirArquivo('documento', d.id).catch((e) => toast.error(msg(e)))}><Download className="h-4 w-4 mr-1" />Abrir</Button>
            </CardContent></Card>
          ))}
        </div>
      )}
    </div>
  );
}

function EnviarImovel({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const qc = useQueryClient();
  const vazio = { tipo_captacao: 'aluguel', tipo_imovel: 'casa', endereco: '', numero: '', bairro: '', cidade: '', estado: 'SP', ponto_referencia: '', observacoes: '' };
  const [f, setF] = useState(vazio);
  const [fotos, setFotos] = useState<string[]>([]);
  const [subindo, setSubindo] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const set = (k: keyof typeof vazio, v: string) => setF((s) => ({ ...s, [k]: v }));
  const subir = async (files: FileList | null) => {
    if (!files?.length) return;
    setSubindo(true);
    try {
      for (const file of Array.from(files).slice(0, 15 - fotos.length)) {
        const r = await enviarArquivo(file, 'foto');
        if (r.url) setFotos((p) => [...p, r.url!]);
      }
    } catch (e) { toast.error(msg(e)); } finally { setSubindo(false); if (input.current) input.current.value = ''; }
  };
  const enviar = useMutation({
    mutationFn: () => chamar('enviar_imovel', { dados: { ...f, fotos } }),
    onSuccess: () => { toast.success('Imóvel enviado! Nossa equipe vai entrar em contato.'); setF(vazio); setFotos([]); qc.invalidateQueries({ queryKey: ['portal-envios'] }); onFechar(); },
    onError: (e) => toast.error(msg(e)),
  });
  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Enviar um imóvel</DialogTitle><DialogDescription>Conte sobre o imóvel que você quer colocar com a gente.</DialogDescription></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Quero</Label>
            <Select value={f.tipo_captacao} onValueChange={(v) => set('tipo_captacao', v)}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="aluguel">Alugar</SelectItem><SelectItem value="venda">Vender</SelectItem><SelectItem value="ambos">Alugar ou vender</SelectItem></SelectContent></Select></div>
          <div className="space-y-1.5"><Label>Tipo</Label>
            <Select value={f.tipo_imovel} onValueChange={(v) => set('tipo_imovel', v)}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="casa">Casa</SelectItem><SelectItem value="apartamento">Apartamento</SelectItem><SelectItem value="comercial">Comercial</SelectItem><SelectItem value="terreno">Terreno</SelectItem><SelectItem value="outro">Outro</SelectItem></SelectContent></Select></div>
          <div className="space-y-1.5 col-span-2 sm:col-span-1"><Label>Endereço *</Label><Input value={f.endereco} onChange={(e) => set('endereco', e.target.value)} /></div>
          <div className="space-y-1.5 col-span-2 sm:col-span-1"><Label>Número</Label><Input value={f.numero} onChange={(e) => set('numero', e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Bairro *</Label><Input value={f.bairro} onChange={(e) => set('bairro', e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Cidade *</Label><Input value={f.cidade} onChange={(e) => set('cidade', e.target.value)} /></div>
          <div className="space-y-1.5"><Label>UF</Label><Input maxLength={2} value={f.estado} onChange={(e) => set('estado', e.target.value.toUpperCase())} /></div>
          <div className="space-y-1.5"><Label>Ponto de referência</Label><Input value={f.ponto_referencia} onChange={(e) => set('ponto_referencia', e.target.value)} /></div>
          <div className="space-y-1.5 col-span-2"><Label>Detalhes (quartos, vagas, valor pretendido...)</Label><Textarea rows={3} value={f.observacoes} onChange={(e) => set('observacoes', e.target.value)} /></div>
          <div className="col-span-2 space-y-2"><Label>Fotos</Label>
            <input ref={input} type="file" hidden multiple accept=".png,.jpg,.jpeg,.webp" onChange={(e) => subir(e.target.files)} />
            <div className="flex flex-wrap gap-2">
              {fotos.map((u) => (<img key={u} src={u} alt="" className="h-16 w-16 object-cover rounded border" />))}
              <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()} disabled={subindo || fotos.length >= 15}>{subindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}Adicionar fotos</Button>
            </div></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button onClick={() => enviar.mutate()} disabled={enviar.isPending || subindo}>{enviar.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Enviar imóvel</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Imoveis() {
  const q = useQuery({ queryKey: ['portal-imoveis'], queryFn: () => chamar<any>('imoveis') });
  const envios = useQuery({ queryKey: ['portal-envios'], queryFn: () => chamar<any>('envios') });
  const [novo, setNovo] = useState(false);
  const lista: any[] = q.data?.dados || [];
  const cont = (s: string) => lista.filter((i) => i.status === s).length;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-sm">
          <Badge variant="outline">{lista.length} imóveis</Badge>
          <Badge variant="outline" className={STATUS_IMOVEL.disponivel.c}>{cont('disponivel')} disponíveis</Badge>
          <Badge variant="outline" className={STATUS_IMOVEL.alugado.c}>{cont('alugado')} alugados</Badge>
        </div>
        <Button onClick={() => setNovo(true)}><Plus className="h-4 w-4 mr-1" />Enviar um imóvel</Button>
      </div>
      {q.isLoading ? <Vazio texto="Carregando..." /> : !lista.length ? <Vazio texto="Você ainda não tem imóveis cadastrados conosco." /> : (
        <div className="grid sm:grid-cols-2 gap-3">
          {lista.map((i) => {
            const st = STATUS_IMOVEL[i.status] || { t: i.status, c: '' };
            return (
              <Card key={i.id} className="overflow-hidden">
                {i.foto ? <img src={i.foto} alt="" className="h-36 w-full object-cover" loading="lazy" /> : <div className="h-36 bg-muted flex items-center justify-center"><Home className="h-8 w-8 text-muted-foreground" /></div>}
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2"><p className="font-semibold leading-tight">{i.titulo}</p><Badge variant="outline" className={st.c}>{st.t}</Badge></div>
                  <p className="text-sm text-muted-foreground">{i.endereco}{i.numero ? `, ${i.numero}` : ''} — {i.bairro}, {i.cidade}/{i.estado}</p>
                  <p className="text-xs text-muted-foreground">Código {i.codigo}{i.quartos ? ` • ${i.quartos} quartos` : ''}{i.area_util ? ` • ${i.area_util} m²` : ''}</p>
                  <div className="text-sm">{i.tipo === 'venda' ? <>Venda: <b>{formatCurrency(i.valor_venda)}</b></> : <>Aluguel: <b>{formatCurrency(i.valor_aluguel)}</b></>}</div>
                  {i.status === 'alugado' && i.contrato && <p className="text-xs text-muted-foreground">Contrato {i.contrato.codigo}: até {formatDateBR(i.contrato.data_fim)} • {formatCurrency(i.contrato.valor)}</p>}
                  {i.status === 'disponivel' && <p className="text-xs text-muted-foreground">{i.no_site ? 'Anunciado no site da imobiliária.' : 'Ainda não anunciado no site.'}</p>}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      {(envios.data?.dados || []).length > 0 && (
        <section>
          <h2 className="font-semibold mb-2">Imóveis que você enviou</h2>
          <div className="space-y-2">
            {(envios.data.dados as any[]).map((e) => (
              <Card key={e.id}><CardContent className="p-3 flex items-center justify-between gap-3 text-sm">
                <span>{e.endereco}{e.numero ? `, ${e.numero}` : ''} — {e.bairro}</span>
                <Badge variant="outline">{STATUS_ENVIO[e.status] || 'Recebido'}</Badge>
              </CardContent></Card>
            ))}
          </div>
        </section>
      )}
      <EnviarImovel aberto={novo} onFechar={() => setNovo(false)} />
    </div>
  );
}

/* ---------- painel ---------- */
function Painel({ me, onSair }: { me: any; onSair: () => void }) {
  const inicial = me.e_proprietario ? 'imoveis' : 'contratos';
  return (
    <Casca nome={me.nome} onSair={onSair}>
      <h1 className="text-xl font-semibold mb-4">Olá, {String(me.nome || '').split(' ')[0]}!</h1>
      <Tabs defaultValue={inicial}>
        <TabsList className="flex flex-wrap h-auto justify-start">
          {me.e_proprietario && <TabsTrigger value="imoveis"><Building2 className="h-4 w-4 mr-1.5" />Meus imóveis</TabsTrigger>}
          <TabsTrigger value="contratos"><FileText className="h-4 w-4 mr-1.5" />Contratos</TabsTrigger>
          <TabsTrigger value="contas"><Wallet className="h-4 w-4 mr-1.5" />{me.e_proprietario && !me.e_inquilino ? 'Repasses' : 'Contas'}</TabsTrigger>
          <TabsTrigger value="docs"><FolderOpen className="h-4 w-4 mr-1.5" />Documentos</TabsTrigger>
          <TabsTrigger value="dados"><UserRound className="h-4 w-4 mr-1.5" />Meus dados</TabsTrigger>
        </TabsList>
        {me.e_proprietario && <TabsContent value="imoveis" className="mt-4"><Imoveis /></TabsContent>}
        <TabsContent value="contratos" className="mt-4"><Contratos /></TabsContent>
        <TabsContent value="contas" className="mt-4"><Contas me={me} /></TabsContent>
        <TabsContent value="docs" className="mt-4"><Documentos /></TabsContent>
        <TabsContent value="dados" className="mt-4"><Dados me={me} /></TabsContent>
      </Tabs>
    </Casca>
  );
}

export default function Portal() {
  const qc = useQueryClient();
  const [logado, setLogado] = useState<boolean>(!!getToken());
  const me = useQuery({
    queryKey: ['portal-me'],
    enabled: logado,
    retry: false,
    queryFn: () => chamar<any>('me'),
  });
  useEffect(() => {
    if (me.error instanceof PortalErro && me.error.sessaoExpirada) { setLogado(false); toast.error('Sua sessão expirou. Entre novamente.'); }
  }, [me.error]);
  useEffect(() => { document.title = 'Portal do Cliente | Estrela de Davi'; }, []);

  const sair = async () => {
    try { await chamar('sair'); } catch { /* já expirou */ }
    setToken(null); qc.clear(); setLogado(false);
  };

  if (!logado) return <Login onEntrou={() => { qc.clear(); setLogado(true); }} />;
  if (me.isLoading) return <Casca><p className="text-center py-20 text-muted-foreground">Carregando...</p></Casca>;
  if (me.error || !me.data) return <Casca onSair={sair}><p className="text-center py-20 text-muted-foreground">Não foi possível carregar seus dados. Tente sair e entrar de novo.</p></Casca>;
  if (me.data.deve_trocar) return <TrocarSenha obrigatoria nome={me.data.nome} onSair={sair} onFeito={() => qc.invalidateQueries({ queryKey: ['portal-me'] })} />;
  return <Painel me={me.data} onSair={sair} />;
}
