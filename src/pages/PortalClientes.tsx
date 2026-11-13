import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Copy, KeyRound, Search, UserCheck, UserX, Eye, MessageCircle, Loader2, ExternalLink } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LoadingCard } from '@/components/ui/loading';
import { supabase } from '@/integrations/supabase/client';
import { friendlyError, formatCurrency } from '@/lib/utils';
import { openStoredFile } from '@/lib/storage';

const PORTAL_URL = 'https://crm-estrela-de-davi.vercel.app/portal';
const rpc = async (nome: string, args?: Record<string, unknown>) => {
  const { data, error } = await supabase.rpc(nome as any, args as any);
  if (error) throw new Error(friendlyError(error, 'Não foi possível concluir a ação'));
  return data as any;
};
const dh = (v?: string | null) => (v ? format(new Date(v), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : '—');
const TIPO: Record<string, string> = { proprietario: 'Proprietário', inquilino: 'Inquilino', interessado: 'Interessado' };
const EVENTO: Record<string, string> = {
  acesso_liberado: 'Acesso liberado', acesso_desativado: 'Acesso desativado', acesso_reativado: 'Acesso reativado',
  login_correto: 'Login correto', login_falhou: 'Login falhou', senha_trocada: 'Senha trocada', dados_atualizados: 'Dados atualizados',
  documento_enviado: 'Documento enviado', imovel_enviado: 'Imóvel enviado', upload_url: 'Upload iniciado',
};

export default function PortalClientes() {
  const qc = useQueryClient();
  const [busca, setBusca] = useState('');
  const [liberar, setLiberar] = useState<any>(null);
  const [senhaCustom, setSenhaCustom] = useState('');
  const [resultado, setResultado] = useState<{ nome: string; senha: string; whatsapp: string } | null>(null);
  const [detalhe, setDetalhe] = useState<any>(null);

  const lista = useQuery({ queryKey: ['portal-admin-lista'], queryFn: () => rpc('portal_admin_listar') });
  const det = useQuery({ queryKey: ['portal-admin-detalhe', detalhe?.id], enabled: !!detalhe, queryFn: () => rpc('portal_admin_detalhe', { _client: detalhe.id }) });

  const gerar = useMutation({
    mutationFn: (c: any) => rpc('portal_admin_liberar', { _client: c.id, _senha: senhaCustom.trim() || null }),
    onSuccess: (r, c) => {
      setResultado({ nome: r.nome, senha: r.senha, whatsapp: String(c.whatsapp || c.telefone || '').replace(/\D/g, '') });
      setLiberar(null); setSenhaCustom('');
      qc.invalidateQueries({ queryKey: ['portal-admin-lista'] });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const ativo = useMutation({
    mutationFn: ({ id, a }: { id: string; a: boolean }) => rpc('portal_admin_ativo', { _client: id, _ativo: a }),
    onSuccess: () => { toast.success('Acesso atualizado'); qc.invalidateQueries({ queryKey: ['portal-admin-lista'] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const filtrada = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const l: any[] = lista.data || [];
    return t ? l.filter((c) => (c.nome || '').toLowerCase().includes(t)) : l;
  }, [lista.data, busca]);

  const mensagem = (r: { nome: string; senha: string }) =>
    `Olá, ${r.nome.split(' ')[0]}! Seu acesso ao Portal do Cliente da Estrela de Davi está liberado.\n\nEndereço: ${PORTAL_URL}\nUsuário: seu CPF\nSenha provisória: ${r.senha}\n\nNo primeiro acesso você escolhe uma senha nova. A senha provisória vale por 7 dias.`;

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold">Portal do Cliente</h1>
          <p className="text-sm text-muted-foreground">Libere o acesso de clientes e proprietários. Eles entram com o CPF, veem contratos, contas e imóveis, e enviam documentos e dados.</p>
        </div>
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar cliente" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        {lista.isLoading ? <LoadingCard /> : !filtrada.length ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Nenhum cliente encontrado.</p>
        ) : (
          <div className="space-y-2">
            {filtrada.map((c) => (
              <Card key={c.id}><CardContent className="p-4 flex flex-wrap items-center gap-3 justify-between">
                <div className="min-w-0">
                  <p className="font-medium truncate">{c.nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {TIPO[c.tipo] || c.tipo}
                    {c.acesso ? ` • último acesso ${dh(c.ultimo_acesso)}` : ''}
                    {c.docs_enviados ? ` • ${c.docs_enviados} doc(s) enviados` : ''}
                    {c.imoveis_enviados ? ` • ${c.imoveis_enviados} imóvel(is) enviados` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {!c.tem_cpf ? <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200">Sem CPF cadastrado</Badge>
                    : !c.acesso ? <Badge variant="outline">Sem acesso</Badge>
                    : !c.ativo ? <Badge variant="outline" className="bg-red-50 text-red-800 border-red-200">Desativado</Badge>
                    : c.deve_trocar ? <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200">Aguardando 1º acesso</Badge>
                    : <Badge variant="outline" className="bg-green-50 text-green-800 border-green-200">Ativo</Badge>}
                  {c.tem_cpf && (
                    <Button size="sm" onClick={() => { setLiberar(c); setSenhaCustom(''); }}>
                      <KeyRound className="h-4 w-4 mr-1" />{c.acesso ? 'Nova senha provisória' : 'Liberar acesso'}
                    </Button>
                  )}
                  {c.acesso && (
                    <Button size="sm" variant="outline" onClick={() => ativo.mutate({ id: c.id, a: !c.ativo })} disabled={ativo.isPending}>
                      {c.ativo ? <><UserX className="h-4 w-4 mr-1" />Desativar</> : <><UserCheck className="h-4 w-4 mr-1" />Reativar</>}
                    </Button>
                  )}
                  {c.acesso && <Button size="sm" variant="ghost" onClick={() => setDetalhe(c)}><Eye className="h-4 w-4 mr-1" />Ver envios</Button>}
                </div>
              </CardContent></Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!liberar} onOpenChange={(o) => !o && setLiberar(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{liberar?.acesso ? 'Nova senha provisória' : 'Liberar acesso ao portal'}</DialogTitle>
            <DialogDescription>{liberar?.nome}. O cliente entra com o CPF e esta senha, e é obrigado a trocá-la no primeiro acesso. Ela vale por 7 dias.</DialogDescription></DialogHeader>
          <div className="space-y-1.5">
            <Label>Senha provisória (opcional)</Label>
            <Input placeholder="Deixe em branco para gerar uma senha aleatória" value={senhaCustom} onChange={(e) => setSenhaCustom(e.target.value)} />
            <p className="text-xs text-muted-foreground">Recomendado: deixar o sistema gerar. Uma senha igual para todos deixa qualquer um entrar na conta de outra pessoa que ainda não trocou a senha.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLiberar(null)}>Cancelar</Button>
            <Button onClick={() => gerar.mutate(liberar)} disabled={gerar.isPending}>{gerar.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resultado} onOpenChange={(o) => !o && setResultado(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Acesso liberado</DialogTitle>
            <DialogDescription>Copie agora: esta senha não aparece de novo (o sistema guarda só o hash).</DialogDescription></DialogHeader>
          {resultado && (
            <div className="space-y-3">
              <div className="rounded-md border bg-muted/40 p-3 text-center">
                <p className="text-xs text-muted-foreground">{resultado.nome}</p>
                <p className="text-2xl font-mono font-semibold tracking-wider select-all">{resultado.senha}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => { navigator.clipboard.writeText(mensagem(resultado)); toast.success('Mensagem copiada'); }}><Copy className="h-4 w-4 mr-1" />Copiar mensagem</Button>
                {resultado.whatsapp.length >= 10 && (
                  <Button variant="outline" asChild>
                    <a target="_blank" rel="noopener noreferrer" href={`https://wa.me/${resultado.whatsapp.startsWith('55') ? resultado.whatsapp : '55' + resultado.whatsapp}?text=${encodeURIComponent(mensagem(resultado))}`}><MessageCircle className="h-4 w-4 mr-1" />Abrir no WhatsApp</a>
                  </Button>
                )}
              </div>
            </div>
          )}
          <DialogFooter><Button onClick={() => setResultado(null)}>Pronto</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detalhe} onOpenChange={(o) => !o && setDetalhe(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{detalhe?.nome}</DialogTitle><DialogDescription>O que o cliente enviou pelo portal.</DialogDescription></DialogHeader>
          {det.isLoading ? <LoadingCard /> : det.data && (
            <div className="space-y-5 text-sm">
              <section>
                <h3 className="font-semibold mb-2">Dados informados {det.data.dados?.atualizado_em ? `(${dh(det.data.dados.atualizado_em)})` : ''}</h3>
                <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
                  {[['E-mail', det.data.dados?.email], ['Telefone', det.data.dados?.telefone], ['WhatsApp', det.data.dados?.whatsapp], ['RG', det.data.dados?.rg],
                    ['Nascimento', det.data.dados?.data_nascimento], ['Estado civil', det.data.dados?.estado_civil], ['Profissão', det.data.dados?.profissao],
                    ['Renda mensal', det.data.dados?.renda_mensal != null ? formatCurrency(Number(det.data.dados.renda_mensal)) : null],
                    ['Endereço', det.data.dados?.endereco], ['Emergência', det.data.dados?.contato_emergencia]].map(([k, v]) => (
                    <div key={k as string} className="flex justify-between gap-3 border-b py-1"><span className="text-muted-foreground">{k}</span><span className="font-medium text-right">{(v as any) || '—'}</span></div>
                  ))}
                </div>
              </section>
              <section>
                <h3 className="font-semibold mb-2">Documentos enviados</h3>
                {!(det.data.documentos || []).length ? <p className="text-muted-foreground">Nenhum.</p> : (det.data.documentos as any[]).map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-3 py-1 border-b">
                    <span className="truncate">{d.nome} <span className="text-xs text-muted-foreground">• {dh(d.created_at)}</span></span>
                    <Button size="sm" variant="ghost" onClick={() => openStoredFile(d.url).catch(() => toast.error('Não foi possível abrir o arquivo'))}><ExternalLink className="h-4 w-4" /></Button>
                  </div>
                ))}
              </section>
              <section>
                <h3 className="font-semibold mb-2">Imóveis enviados</h3>
                {!(det.data.imoveis_enviados || []).length ? <p className="text-muted-foreground">Nenhum. Os enviados aparecem em Prospecção, com status “Novo”.</p> : (det.data.imoveis_enviados as any[]).map((i) => (
                  <div key={i.id} className="py-1 border-b">{i.endereco} — {i.bairro} <span className="text-xs text-muted-foreground">• {dh(i.created_at)}</span></div>
                ))}
              </section>
              <section>
                <h3 className="font-semibold mb-2">Atividade recente</h3>
                {(det.data.eventos as any[] || []).map((e, i) => (
                  <div key={i} className="flex justify-between py-0.5"><span>{EVENTO[e.evento] || e.evento}{e.detalhe && e.evento !== 'upload_url' ? ` — ${e.detalhe}` : ''}</span><span className="text-muted-foreground">{dh(e.criado_em)}</span></div>
                ))}
              </section>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
