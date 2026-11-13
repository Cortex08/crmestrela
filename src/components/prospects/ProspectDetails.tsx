import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Phone, MessageSquare, Edit, Plus, MapPin, User, Clock, History, Image as ImageIcon, Trash2 } from 'lucide-react';
import { openWhatsapp } from '@/lib/whatsapp';
import {
  STATUS_PROSPECT, STATUS_PROSPECT_COLOR, TIPO_IMOVEL_PROSPECT, TIPO_CAPTACAO, PROXIMA_ACAO, RESULTADO_CONTATO, RESULTADO_COLOR, fmtDate,
} from '@/lib/prospeccao';

interface Props {
  prospect: any;
  onEdit?: () => void;
  onAddContact?: () => void;
  onDelete?: () => void;
}

export default function ProspectDetails({ prospect, onEdit, onAddContact, onDelete }: Props) {
  const { data: contacts = [] } = useQuery({
    queryKey: ['prospect-contacts', prospect.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('prospect_contacts')
        .select('*, quem_ligou:profiles!prospect_contacts_quem_ligou_id_fkey(nome)')
        .eq('prospect_id', prospect.id)
        .order('data_contato', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
  const { data: history = [] } = useQuery({
    queryKey: ['prospect-history', prospect.id, prospect.updated_at],
    queryFn: async () => {
      const { data, error } = await supabase.from('prospect_history').select('*').eq('prospect_id', prospect.id).order('created_at', { ascending: false }).limit(200);
      if (error) throw error;
      return data || [];
    },
  });

  const photos: any[] = Array.isArray(prospect.fotos) ? prospect.fotos : [];
  const tel = prospect.proprietario_telefone;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <Badge className={STATUS_PROSPECT_COLOR[prospect.status]}>{STATUS_PROSPECT[prospect.status] || prospect.status}</Badge>
            <Badge variant="outline">{TIPO_IMOVEL_PROSPECT[prospect.tipo_imovel] || prospect.tipo_imovel}</Badge>
            <Badge variant="secondary">{TIPO_CAPTACAO[prospect.tipo_captacao] || prospect.tipo_captacao}</Badge>
          </div>
          <h2 className="text-xl font-semibold flex items-center gap-2"><MapPin className="h-5 w-5 text-muted-foreground shrink-0" />{prospect.endereco}{prospect.numero ? `, ${prospect.numero}` : ''}</h2>
          <p className="text-muted-foreground">{prospect.bairro}, {prospect.cidade} - {prospect.estado}</p>
          {prospect.ponto_referencia && <p className="text-sm text-muted-foreground mt-1">Ref: {prospect.ponto_referencia}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {onEdit && <Button variant="outline" size="sm" onClick={onEdit}><Edit className="h-4 w-4 mr-1" />Editar</Button>}
          {onAddContact && <Button size="sm" onClick={onAddContact}><Plus className="h-4 w-4 mr-1" />Novo Contato</Button>}
          {onDelete && <Button variant="destructive" size="sm" onClick={onDelete}><Trash2 className="h-4 w-4 mr-1" />Excluir</Button>}
        </div>
      </div>

      <Tabs defaultValue="info" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="info">Informações</TabsTrigger>
          <TabsTrigger value="contacts">Contatos ({contacts.length})</TabsTrigger>
          <TabsTrigger value="photos">Fotos ({photos.length})</TabsTrigger>
          <TabsTrigger value="history">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><User className="h-4 w-4" />Proprietário</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div><p className="text-xs text-muted-foreground">Nome</p><p className="font-medium">{prospect.proprietario_nome || '-'}</p></div>
                <div><p className="text-xs text-muted-foreground">Melhor Horário</p><p className="font-medium">{prospect.proprietario_melhor_horario || '-'}</p></div>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">Telefone Principal</p>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{tel || '-'}</p>
                    {prospect.proprietario_whatsapp && <Badge variant="outline" className="text-green-600 border-green-600">WhatsApp</Badge>}
                  </div>
                </div>
                {tel && (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" asChild><a href={`tel:${tel.replace(/[^\d+]/g, '')}`}><Phone className="h-4 w-4" /></a></Button>
                    {prospect.proprietario_whatsapp && <Button variant="outline" size="sm" onClick={() => openWhatsapp(tel)}><MessageSquare className="h-4 w-4 text-green-600" /></Button>}
                  </div>
                )}
              </div>
              {prospect.proprietario_telefone2 && <div><p className="text-xs text-muted-foreground">Telefone Secundário</p><p className="font-medium">{prospect.proprietario_telefone2}</p></div>}
              {prospect.proprietario_observacoes && <div><p className="text-xs text-muted-foreground">Observações</p><p className="text-sm whitespace-pre-wrap">{prospect.proprietario_observacoes}</p></div>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Clock className="h-4 w-4" />Próxima Ação</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div><p className="text-xs text-muted-foreground">Ação</p><p className="font-medium">{prospect.proxima_acao ? PROXIMA_ACAO[prospect.proxima_acao] : '-'}</p></div>
                <div><p className="text-xs text-muted-foreground">Data</p><p className="font-medium">{fmtDate(prospect.data_proxima_acao)}</p></div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Responsáveis</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div><p className="text-xs text-muted-foreground">Prospecção</p><p className="font-medium">{prospect.responsavel_prospeccao?.nome || '-'}</p></div>
                <div><p className="text-xs text-muted-foreground">Contato</p><p className="font-medium">{prospect.responsavel_contato?.nome || '-'}</p></div>
              </div>
            </CardContent>
          </Card>
          {prospect.observacoes && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Observações Gerais</CardTitle></CardHeader>
              <CardContent><p className="text-sm whitespace-pre-wrap">{prospect.observacoes}</p></CardContent>
            </Card>
          )}
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span>Cadastrado em: {fmtDate(prospect.created_at, true)}</span>
            <span>Atualizado em: {fmtDate(prospect.updated_at, true)}</span>
          </div>
        </TabsContent>

        <TabsContent value="contacts">
          <Card>
            <CardContent className="p-4">
              {contacts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Phone className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>Nenhum contato registrado</p>
                  {onAddContact && <Button variant="outline" size="sm" className="mt-2" onClick={onAddContact}>Registrar primeiro contato</Button>}
                </div>
              ) : (
                <ScrollArea className="h-[400px]">
                  <div className="space-y-4">
                    {contacts.map((c: any, i: number) => (
                      <div key={c.id}>
                        <div className="flex items-start gap-3">
                          <div className={`w-3 h-3 rounded-full mt-1.5 ${RESULTADO_COLOR[c.resultado] || 'bg-gray-500'}`} />
                          <div className="flex-1">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <Badge variant="outline">{RESULTADO_CONTATO[c.resultado] || c.resultado}</Badge>
                              <span className="text-xs text-muted-foreground">{fmtDate(c.data_contato, true)}</span>
                            </div>
                            <p className="text-sm text-muted-foreground">Por: {c.quem_ligou?.nome || 'Não informado'}</p>
                            {c.observacoes && <p className="text-sm mt-1 whitespace-pre-wrap">{c.observacoes}</p>}
                          </div>
                        </div>
                        {i < contacts.length - 1 && <Separator className="my-4" />}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="photos">
          <Card>
            <CardContent className="p-4">
              {photos.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground"><ImageIcon className="h-8 w-8 mx-auto mb-2 opacity-50" /><p>Nenhuma foto cadastrada</p></div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {photos.map((ph, i) => (
                    <div key={i} className="space-y-1">
                      <a href={ph.url} target="_blank" rel="noopener noreferrer">
                        <img src={ph.url} alt={ph.legenda || `Foto ${i + 1}`} loading="lazy" className="w-full h-40 object-cover rounded-md hover:opacity-90 transition-opacity" />
                      </a>
                      {ph.legenda && <p className="text-xs text-muted-foreground text-center">{ph.legenda}</p>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardContent className="p-4">
              {history.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground"><History className="h-8 w-8 mx-auto mb-2 opacity-50" /><p>Nenhuma alteração registrada</p></div>
              ) : (
                <ScrollArea className="h-[400px]">
                  <div className="space-y-3">
                    {history.map((h: any) => (
                      <div key={h.id} className="text-sm border-l-2 border-muted pl-3 py-1">
                        <div className="flex items-center gap-2 text-muted-foreground"><span>{fmtDate(h.created_at, true)}</span><span>•</span><span>{h.user_name || 'Sistema'}</span></div>
                        <p>
                          <span className="font-medium">{h.campo_alterado}</span>
                          {h.valor_anterior && <span className="text-muted-foreground">: {STATUS_PROSPECT[h.valor_anterior] || PROXIMA_ACAO[h.valor_anterior] || h.valor_anterior}</span>}
                          {h.valor_novo && <span> → <span className="text-primary">{STATUS_PROSPECT[h.valor_novo] || PROXIMA_ACAO[h.valor_novo] || h.valor_novo}</span></span>}
                        </p>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
