import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ExternalLink } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { usePermissions } from '@/contexts/PermissionsContext';
import { configPadrao, type SiteConfig } from '@/site/api';

const campos: [keyof SiteConfig, string, string][] = [
  ['nome', 'Nome da imobiliária', 'Grupo Estrela de Davi'],
  ['slogan', 'Frase de apresentação (aparece no topo do site)', 'Compra, venda e locação com atendimento próximo'],
  ['whatsapp', 'WhatsApp de atendimento', '(11) 90000-0000'],
  ['telefone', 'Telefone', '(11) 0000-0000'],
  ['email', 'E-mail', 'contato@suaimobiliaria.com.br'],
  ['endereco', 'Endereço do escritório', 'Rua, número, bairro, cidade'],
  ['creci', 'CRECI', 'Número do CRECI'],
  ['instagram', 'Link do Instagram', 'https://instagram.com/...'],
  ['facebook', 'Link do Facebook', 'https://facebook.com/...'],
];

export default function SiteAdmin() {
  const { hasAccess } = usePermissions();
  const isAdmin = hasAccess('usuarios');
  const qc = useQueryClient();
  const [f, setF] = useState<SiteConfig>(configPadrao);
  const [salvando, setSalvando] = useState(false);

  const { data } = useQuery({
    queryKey: ['site-config-admin'],
    queryFn: async () => (await supabase.from('site_settings' as any).select('*').eq('id', 1).maybeSingle()).data as any,
  });
  const { data: pub } = useQuery({
    queryKey: ['site-publicados'],
    queryFn: async () => {
      const { count } = await supabase.from('properties').select('id', { count: 'exact', head: true }).eq('published_on_website', true).eq('status', 'disponivel');
      return count ?? 0;
    },
  });
  useEffect(() => { if (data) setF({ ...configPadrao, ...data }); }, [data]);

  async function salvar() {
    setSalvando(true);
    const { id, updated_at, ...resto } = f as any;
    const { error } = await supabase.from('site_settings' as any).update({ ...resto, updated_at: new Date().toISOString() }).eq('id', 1);
    setSalvando(false);
    if (error) return toast.error('Não foi possível salvar. Só administradores podem editar o site.');
    toast.success('Site atualizado!');
    qc.invalidateQueries({ queryKey: ['site-config'] });
  }

  const url = `${window.location.origin}/site`;
  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-3xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Site Público</h1>
            <p className="text-muted-foreground">Vitrine de imóveis para os clientes. Os imóveis aparecem quando estão disponíveis e publicados no site.</p>
          </div>
          <Button asChild variant="outline"><a href="/site" target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4 mr-2" />Abrir o site</a></Button>
        </div>

        <Card className="card-premium">
          <CardContent className="pt-6 space-y-1 text-sm">
            <p><b>{pub ?? 0}</b> {pub === 1 ? 'imóvel publicado' : 'imóveis publicados'} agora.</p>
            <p className="text-muted-foreground">Endereço do site: <span className="font-mono">{url}</span></p>
            <p className="text-muted-foreground">Para publicar ou retirar um imóvel, use os botões do cartão dele em Imóveis. Os contatos recebidos pelo site entram em Clientes como “interessado”, com origem Site.</p>
          </CardContent>
        </Card>

        <Card className="card-premium">
          <CardHeader>
            <CardTitle>Dados da imobiliária</CardTitle>
            <CardDescription>Aparecem no topo e no rodapé do site. Campos vazios não são exibidos.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {campos.map(([k, label, ph]) => (
              <div key={k} className="space-y-1.5">
                <Label htmlFor={`s-${k}`}>{label}</Label>
                <Input id={`s-${k}`} value={f[k]} placeholder={ph} maxLength={200} disabled={!isAdmin} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
              </div>
            ))}
            <div className="space-y-1.5">
              <Label htmlFor="s-sobre">Sobre a imobiliária (aparece na página inicial)</Label>
              <Textarea id="s-sobre" rows={6} value={f.sobre} maxLength={2000} disabled={!isAdmin} placeholder="Conte a história, a região de atuação e o jeito de atender." onChange={(e) => setF({ ...f, sobre: e.target.value })} />
            </div>
            {isAdmin ? <Button onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar alterações'}</Button> : <p className="text-sm text-muted-foreground">Somente administradores podem editar.</p>}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
