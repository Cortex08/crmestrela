import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, RefreshCw, Battery, Settings2 } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { LoadingCard } from '@/components/ui/loading';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { friendlyError } from '@/lib/utils';

const rpc = async (nome: string, args?: Record<string, unknown>) => {
  const { data, error } = await supabase.rpc(nome as any, args as any);
  if (error) throw new Error(friendlyError(error, 'Não foi possível concluir a ação'));
  return data as any;
};

interface Ultima { user_id: string; dispositivo: string; lat: number; lng: number; precisao: number | null; bateria: number | null; registrado_em: string; ao_vivo: boolean }
interface Ponto { lat: number; lng: number; bateria: number | null; registrado_em: string }
const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

function Mapa({ ultimas, trajeto, foco }: { ultimas: Ultima[]; trajeto: Ponto[]; foco: string | null }) {
  const el = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const camada = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!el.current || mapa.current) return;
    mapa.current = L.map(el.current).setView([-14.2, -51.9], 4);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(mapa.current);
    camada.current = L.layerGroup().addTo(mapa.current);
    return () => { mapa.current?.remove(); mapa.current = null; };
  }, []);

  useEffect(() => {
    const m = mapa.current, g = camada.current;
    if (!m || !g) return;
    g.clearLayers();
    const bounds: L.LatLngTuple[] = [];
    if (trajeto.length) {
      const pts = trajeto.map(p => [p.lat, p.lng] as L.LatLngTuple);
      L.polyline(pts, { color: '#2563eb', weight: 4, opacity: 0.8 }).addTo(g);
      trajeto.forEach(p => L.circleMarker([p.lat, p.lng], { radius: 3, color: '#1d4ed8', fillOpacity: 1 })
        .bindTooltip(format(new Date(p.registrado_em), 'HH:mm')).addTo(g));
      bounds.push(...pts);
    }
    ultimas.forEach(u => {
      const cor = u.ao_vivo ? '#16a34a' : '#6b7280';
      L.circleMarker([u.lat, u.lng], { radius: 10, color: '#fff', weight: 3, fillColor: cor, fillOpacity: 1 })
        .bindTooltip(`${u.dispositivo} · ${formatDistanceToNow(new Date(u.registrado_em), { addSuffix: true, locale: ptBR })}`, { permanent: true, direction: 'top', offset: [0, -8] })
        .addTo(g);
      if (!trajeto.length || foco === u.user_id) bounds.push([u.lat, u.lng]);
    });
    if (bounds.length) m.fitBounds(L.latLngBounds(bounds), { padding: [50, 50], maxZoom: 17 });
  }, [ultimas, trajeto, foco]);

  return <div ref={el} className="h-[520px] w-full rounded-lg border overflow-hidden z-0" />;
}

function Configuracao() {
  const qc = useQueryClient();
  const { data: cfg } = useQuery({ queryKey: ['loc-config'], queryFn: () => rpc('loc_config_ler') });
  const [f, setF] = useState<any>(null);
  useEffect(() => { if (cfg) setF({ ativo: cfg.ativo, dias: cfg.dias, inicio: cfg.inicio, fim: cfg.fim, intervalo_s: cfg.intervalo_s }); }, [cfg]);
  const salvar = useMutation({
    mutationFn: () => rpc('loc_config_salvar', { _ativo: f.ativo, _dias: f.dias, _inicio: f.inicio, _fim: f.fim, _intervalo_s: Number(f.intervalo_s) }),
    onSuccess: () => { toast.success('Horário salvo'); qc.invalidateQueries({ queryKey: ['loc-config'] }); },
    onError: (e: any) => toast.error(e.message),
  });
  if (!f) return null;
  return (
    <Card><CardContent className="p-4 space-y-3">
      <p className="font-semibold flex items-center gap-2"><Settings2 className="h-4 w-4" />Horário de rastreamento</p>
      <p className="text-xs text-muted-foreground">O celular só envia a localização dentro deste horário (fuso de Brasília). Fora dele nada é gravado.</p>
      <div className="flex items-center gap-2"><Switch checked={f.ativo} onCheckedChange={v => setF({ ...f, ativo: v })} /><Label>Rastreamento ligado</Label></div>
      <div className="flex flex-wrap gap-1">
        {DIAS.map((d, i) => {
          const n = i + 1, on = f.dias.includes(n);
          return <Button key={d} type="button" size="sm" variant={on ? 'default' : 'outline'}
            onClick={() => setF({ ...f, dias: on ? f.dias.filter((x: number) => x !== n) : [...f.dias, n].sort() })}>{d}</Button>;
        })}
      </div>
      <div className="flex flex-wrap gap-3 items-end">
        <div><Label className="text-xs">Início</Label><Input type="time" value={f.inicio} onChange={e => setF({ ...f, inicio: e.target.value })} className="w-32" /></div>
        <div><Label className="text-xs">Fim</Label><Input type="time" value={f.fim} onChange={e => setF({ ...f, fim: e.target.value })} className="w-32" /></div>
        <div><Label className="text-xs">Atualizar a cada (segundos)</Label><Input type="number" min={15} max={600} value={f.intervalo_s} onChange={e => setF({ ...f, intervalo_s: e.target.value })} className="w-40" /></div>
        <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>Salvar</Button>
      </div>
    </CardContent></Card>
  );
}

export default function Localizacao() {
  const { roles } = useAuth();
  const [foco, setFoco] = useState<string | null>(null);
  const [dia, setDia] = useState(format(new Date(), 'yyyy-MM-dd'));
  const admin = roles.includes('admin');

  const ultimas = useQuery({ queryKey: ['loc-ultimas'], enabled: admin, refetchInterval: 30_000, queryFn: () => rpc('loc_ultimas') as Promise<Ultima[]> });
  const nomes = useQuery({ queryKey: ['loc-nomes'], enabled: admin, queryFn: async () => {
    const { data } = await supabase.from('profiles').select('id, nome'); return Object.fromEntries((data ?? []).map((p: any) => [p.id, p.nome])) as Record<string, string>; } });
  const trajeto = useQuery({ queryKey: ['loc-trajeto', foco, dia], enabled: admin && !!foco, queryFn: () => rpc('loc_trajeto', { _user: foco, _dia: dia }) as Promise<Ponto[]> });

  if (!admin) return <Navigate to="/" replace />;
  const lista = (ultimas.data ?? []).map(u => ({ ...u, dispositivo: nomes.data?.[u.user_id] ? `${nomes.data[u.user_id]} (${u.dispositivo})` : u.dispositivo }));

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div><h1 className="text-2xl font-bold flex items-center gap-2"><MapPin className="h-6 w-6" />Localização dos celulares</h1>
            <p className="text-sm text-muted-foreground">Celulares da empresa, somente no horário de trabalho. Cada consulta fica registrada.</p></div>
          <Button variant="outline" onClick={() => { ultimas.refetch(); trajeto.refetch(); }}><RefreshCw className="h-4 w-4 mr-2" />Atualizar</Button>
        </div>
        {ultimas.isLoading ? <LoadingCard /> : (
          <div className="grid lg:grid-cols-[1fr_300px] gap-4">
            <Mapa ultimas={lista} trajeto={foco ? trajeto.data ?? [] : []} foco={foco} />
            <div className="space-y-2">
              {ultimas.error && <p className="text-sm text-destructive">{(ultimas.error as Error).message}</p>}
              {!lista.length && <Card><CardContent className="p-4 text-sm text-muted-foreground">Nenhum celular enviou localização nos últimos 7 dias. Instale o app no celular da empresa e entre com o login dele.</CardContent></Card>}
              {lista.map(u => (
                <Card key={u.user_id} className={`cursor-pointer ${foco === u.user_id ? 'ring-2 ring-primary' : ''}`} onClick={() => setFoco(foco === u.user_id ? null : u.user_id)}>
                  <CardContent className="p-3 space-y-1">
                    <div className="flex items-center justify-between gap-2"><p className="font-medium text-sm">{u.dispositivo}</p>
                      <Badge variant={u.ao_vivo ? 'default' : 'secondary'}>{u.ao_vivo ? 'ao vivo' : 'parado/offline'}</Badge></div>
                    <p className="text-xs text-muted-foreground">Última posição {formatDistanceToNow(new Date(u.registrado_em), { addSuffix: true, locale: ptBR })} ({format(new Date(u.registrado_em), 'dd/MM HH:mm')})</p>
                    {u.bateria != null && <p className="text-xs flex items-center gap-1"><Battery className="h-3 w-3" />{u.bateria}%</p>}
                  </CardContent>
                </Card>
              ))}
              {foco && <div><Label className="text-xs">Trajeto do dia</Label><Input type="date" value={dia} onChange={e => setDia(e.target.value)} />
                <p className="text-xs text-muted-foreground mt-1">{trajeto.isLoading ? 'Carregando…' : `${trajeto.data?.length ?? 0} pontos neste dia`}</p></div>}
            </div>
          </div>
        )}
        <Configuracao />
      </div>
    </DashboardLayout>
  );
}
