import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, addDays, differenceInDays, parseISO } from 'date-fns';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';
import { usePermissions } from '@/contexts/PermissionsContext';
import { useAuth } from '@/contexts/AuthContext';
import { Bell, FileText, DollarSign, Calendar, AlertTriangle, Clock, CheckCircle2, X, ExternalLink } from 'lucide-react';

interface Notification {
  id: string;
  type: 'contrato' | 'pagamento' | 'conta';
  title: string;
  description: string;
  urgency: 'critical' | 'warning' | 'info';
  link: string;
}

const DISMISSED_KEY = 'dismissed_notifications';

export const NotificationCenter = () => {
  const { user, roles } = useAuth();
  const { canRead } = usePermissions();
  const podeVer = roles.includes('financeiro') || roles.includes('admin');
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(DISMISSED_KEY);
      if (saved) setDismissed(JSON.parse(saved));
    } catch {
      setDismissed([]);
    }
  }, []);

  const { data: all = [] } = useQuery({
    queryKey: ['notifications', user?.id],
    enabled: !!user && podeVer,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    queryFn: async () => {
      const today = new Date();
      const todayStr = format(today, 'yyyy-MM-dd');
      const list: Notification[] = [];
      const empty = Promise.resolve({ data: [] as any[] });

      const [contracts, payments, bills] = await Promise.all([
        canRead('contratos')
          ? supabase.from('contracts').select('id, codigo, data_fim, cliente:clients!contracts_cliente_id_fkey(nome)')
              .eq('status', 'ativo').eq('arquivado', false).not('data_fim', 'is', null)
              .lte('data_fim', format(addDays(today, 30), 'yyyy-MM-dd')).gte('data_fim', todayStr)
          : empty,
        canRead('financeiro')
          ? supabase.from('owner_payments').select('id, data_vencimento, valor_aluguel, inquilino:clients!owner_payments_inquilino_id_fkey(nome)')
              .eq('inquilino_pagou', false).not('data_vencimento', 'is', null).lt('data_vencimento', todayStr)
          : empty,
        canRead('contas_pagar')
          ? supabase.from('bills').select('id, descricao, data_vencimento, valor').neq('status', 'pago')
              .lte('data_vencimento', format(addDays(today, 7), 'yyyy-MM-dd'))
          : empty,
      ]);

      (contracts.data || []).forEach((c: any) => {
        const dias = differenceInDays(parseISO(c.data_fim), today);
        list.push({
          id: `contrato-${c.id}`, type: 'contrato',
          title: `Contrato ${c.codigo} vence ${dias <= 0 ? 'hoje' : dias === 1 ? 'amanhã' : `em ${dias} dias`}`,
          description: c.cliente?.nome || 'Cliente',
          urgency: dias <= 7 ? 'critical' : dias <= 15 ? 'warning' : 'info', link: '/contratos',
        });
      });
      (payments.data || []).forEach((p: any) => {
        const dias = Math.abs(differenceInDays(parseISO(p.data_vencimento), today));
        list.push({
          id: `pagamento-${p.id}`, type: 'pagamento', title: `Aluguel em atraso há ${dias} dias`,
          description: `${p.inquilino?.nome || 'Inquilino'} - R$ ${Number(p.valor_aluguel || 0).toLocaleString('pt-BR')}`,
          urgency: dias > 10 ? 'critical' : dias > 5 ? 'warning' : 'info', link: '/controle-pagamentos',
        });
      });
      (bills.data || []).forEach((b: any) => {
        const dias = differenceInDays(parseISO(b.data_vencimento), today);
        list.push({
          id: `conta-${b.id}`, type: 'conta',
          title: dias < 0 ? `Conta vencida há ${Math.abs(dias)} dias` : dias === 0 ? 'Conta vence hoje' : `Conta vence ${dias === 1 ? 'amanhã' : `em ${dias} dias`}`,
          description: `${b.descricao} - R$ ${Number(b.valor || 0).toLocaleString('pt-BR')}`,
          urgency: dias < 0 ? 'critical' : dias <= 2 ? 'warning' : 'info', link: '/contas-pagar',
        });
      });

      const order = { critical: 0, warning: 1, info: 2 };
      return list.sort((a, b) => order[a.urgency] - order[b.urgency]);
    },
  });

  const notifications = all.filter((n) => !dismissed.includes(n.id));

  const dismiss = (id: string) => {
    const next = [...dismissed, id].slice(-300);
    setDismissed(next);
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const restore = () => {
    setDismissed([]);
    try {
      localStorage.removeItem(DISMISSED_KEY);
    } catch {
      /* ignore */
    }
  };

  const icon = (t: string) =>
    t === 'contrato' ? <FileText className="h-4 w-4" /> : t === 'pagamento' ? <DollarSign className="h-4 w-4" /> :
    t === 'conta' ? <Calendar className="h-4 w-4" /> : t === 'tarefa' ? <Clock className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />;

  const color = (u: string) =>
    u === 'critical' ? 'bg-destructive/10 border-destructive/30 text-destructive' :
    u === 'warning' ? 'bg-warning/10 border-warning/30 text-warning' : 'bg-muted border-border';

  const critical = notifications.filter((n) => n.urgency === 'critical').length;

  if (!podeVer) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notificações">
          <Bell className="h-5 w-5" />
          {notifications.length > 0 && (
            <span className={`absolute -top-1 -right-1 h-5 w-5 rounded-full text-[10px] font-bold flex items-center justify-center ${critical > 0 ? 'bg-destructive text-destructive-foreground animate-pulse' : 'bg-primary text-primary-foreground'}`}>
              {notifications.length > 9 ? '9+' : notifications.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold">Notificações</h3>
          {dismissed.length > 0 && (
            <Button variant="ghost" size="sm" onClick={restore} className="text-xs">Restaurar</Button>
          )}
        </div>
        {notifications.length === 0 ? (
          <div className="p-8 text-center">
            <CheckCircle2 className="h-12 w-12 text-success mx-auto mb-3" />
            <p className="text-muted-foreground">Tudo em dia!</p>
            <p className="text-xs text-muted-foreground mt-1">Nenhuma pendência no momento</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[400px]">
            <div className="p-2 space-y-2">
              {notifications.slice(0, 10).map((n) => (
                <div key={n.id} className={`flex items-start gap-3 p-3 rounded-lg border ${color(n.urgency)}`}>
                  <div className="mt-0.5">{icon(n.type)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{n.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{n.description}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Link to={n.link} onClick={() => setOpen(false)}>
                      <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Abrir"><ExternalLink className="h-3 w-3" /></Button>
                    </Link>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => dismiss(n.id)} aria-label="Dispensar">
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
};
