import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { usePermissions } from '@/contexts/PermissionsContext';
import { Search, Building2, Users, FileText, AlertTriangle, DollarSign, Calendar, ArrowRight, Loader2, Home } from 'lucide-react';

type ResultType = 'imovel' | 'cliente' | 'contrato' | 'deal' | 'tarefa' | 'ocorrencia';
interface SearchResult { id: string; type: ResultType; title: string; subtitle: string; route: string; badge?: string }

const iconClass = 'h-4 w-4 text-muted-foreground';
const typeConfig: Record<ResultType, { icon: JSX.Element; color: string; label: string }> = {
  imovel: { icon: <Building2 className={iconClass} />, color: 'bg-blue-100 text-blue-800', label: 'Imóvel' },
  cliente: { icon: <Users className={iconClass} />, color: 'bg-green-100 text-green-800', label: 'Cliente' },
  contrato: { icon: <FileText className={iconClass} />, color: 'bg-purple-100 text-purple-800', label: 'Contrato' },
  deal: { icon: <DollarSign className={iconClass} />, color: 'bg-orange-100 text-orange-800', label: 'Negociação' },
  tarefa: { icon: <Calendar className={iconClass} />, color: 'bg-yellow-100 text-yellow-800', label: 'Tarefa' },
  ocorrencia: { icon: <AlertTriangle className={iconClass} />, color: 'bg-red-100 text-red-800', label: 'Ocorrência' },
};

// Remove caracteres que quebram o filtro "or" do PostgREST
const sanitize = (term: string) => term.replace(/[,()%*\\]/g, ' ').trim().slice(0, 60);

export const GlobalSearch = ({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) => {
  const navigate = useNavigate();
  const { canRead } = usePermissions();
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);

  const performSearch = useCallback(async (raw: string) => {
    const term = sanitize(raw);
    if (term.length < 2) {
      setResults([]);
      return;
    }
    const id = ++requestId.current;
    setLoading(true);
    const like = `%${term}%`;
    const empty = Promise.resolve({ data: [] as any[] });

    const [imoveis, clientes, contratos, deals, ocorrencias] = await Promise.all([
      canRead('imoveis')
        ? supabase.from('properties').select('id, codigo, titulo, endereco, bairro, cidade, status')
            .or(`codigo.ilike.${like},titulo.ilike.${like},endereco.ilike.${like},bairro.ilike.${like}`).limit(5)
        : empty,
      canRead('clientes')
        ? supabase.from('clients').select('id, nome, tipo, email, whatsapp')
            .or(`nome.ilike.${like},email.ilike.${like},whatsapp.ilike.${like},cpf_cnpj.ilike.${like}`).limit(5)
        : empty,
      canRead('contratos')
        ? supabase.from('contracts').select('id, codigo, tipo, endereco_imovel, cliente:clients!contracts_cliente_id_fkey(nome)')
            .or(`codigo.ilike.${like},endereco_imovel.ilike.${like}`).limit(5)
        : empty,
      canRead('funil')
        ? supabase.from('deals').select('id, titulo, etapa, cliente:clients(nome)').ilike('titulo', like).limit(5)
        : empty,
      canRead('ocorrencias')
        ? supabase.from('property_incidents').select('id, numero, tipo, status, descricao')
            .or(`numero.ilike.${like},descricao.ilike.${like}`).limit(5)
        : empty,
    ]);

    if (id !== requestId.current) return; // resposta antiga, ignora

    const all: SearchResult[] = [];
    (imoveis.data || []).forEach((i: any) => all.push({ id: i.id, type: 'imovel', title: `${i.codigo} - ${i.titulo}`, subtitle: `${i.endereco}, ${i.bairro} - ${i.cidade}`, route: '/imoveis', badge: i.status }));
    (clientes.data || []).forEach((c: any) => all.push({ id: c.id, type: 'cliente', title: c.nome, subtitle: c.email || c.whatsapp || 'Sem contato', route: '/clientes', badge: c.tipo }));
    (contratos.data || []).forEach((c: any) => all.push({ id: c.id, type: 'contrato', title: `Contrato ${c.codigo}`, subtitle: c.cliente?.nome || c.endereco_imovel || 'Sem endereço', route: '/contratos', badge: c.tipo }));
    (deals.data || []).forEach((d: any) => all.push({ id: d.id, type: 'deal', title: d.titulo, subtitle: d.cliente?.nome || 'Cliente não definido', route: '/funil', badge: d.etapa }));
    (ocorrencias.data || []).forEach((o: any) => all.push({ id: o.id, type: 'ocorrencia', title: `Ocorrência #${o.numero}`, subtitle: o.descricao || o.tipo, route: '/ocorrencias', badge: o.status }));

    setResults(all);
    setSelectedIndex(0);
    setLoading(false);
  }, [canRead]);

  useEffect(() => {
    const t = setTimeout(() => performSearch(search), 300);
    return () => clearTimeout(t);
  }, [search, performSearch]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
    else {
      setSearch('');
      setResults([]);
    }
  }, [open]);

  const handleSelect = (r: SearchResult) => {
    navigate(r.route);
    onOpenChange(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((p) => Math.min(p + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((p) => Math.max(p - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      handleSelect(results[selectedIndex]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 gap-0">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="sr-only">Busca Global</DialogTitle>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              placeholder="Buscar imóveis, clientes, contratos..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              maxLength={60}
              className="pl-10 h-12 text-base border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            />
            {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
        </DialogHeader>

        <div className="border-t">
          {search.trim().length < 2 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Home className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Digite pelo menos 2 caracteres para buscar</p>
              <p className="text-xs mt-1">Use ⌘K ou Ctrl+K para abrir rapidamente</p>
            </div>
          ) : results.length === 0 && !loading ? (
            <div className="p-8 text-center text-muted-foreground">
              <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Nenhum resultado encontrado para "{search}"</p>
            </div>
          ) : (
            <ScrollArea className="max-h-[400px]">
              <div className="p-2">
                {results.map((r, index) => (
                  <button
                    key={`${r.type}-${r.id}`}
                    onClick={() => handleSelect(r)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors ${index === selectedIndex ? 'bg-muted' : 'hover:bg-muted'}`}
                  >
                    <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">{typeConfig[r.type].icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{r.title}</span>
                        <Badge variant="outline" className={`text-[10px] ${typeConfig[r.type].color}`}>{typeConfig[r.type].label}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{r.subtitle}</p>
                    </div>
                    {r.badge && <Badge variant="secondary" className="text-xs">{r.badge}</Badge>}
                    <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        <div className="border-t p-2 hidden sm:flex items-center justify-between text-xs text-muted-foreground bg-muted/50">
          <div className="flex items-center gap-4">
            <span>↑↓ para navegar</span>
            <span>↵ para selecionar</span>
            <span>ESC para fechar</span>
          </div>
          <span>Busca unificada</span>
        </div>
      </DialogContent>
    </Dialog>
  );
};
