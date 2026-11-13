import {
  Home, Users, Building2, TrendingUp, Calendar, DollarSign, FileText, FolderOpen,
  Key, MessageSquare, UserCog, Receipt, UsersRound, AlertCircle, Calculator, ShieldCheck, Globe, Clock,
  Bell, BarChart3, ClipboardList, MapPin, FileWarning, FileBarChart, Headphones, Wallet, Monitor,
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from '@/components/ui/sidebar';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import { Logo } from '@/components/Logo';

type MenuItem = { title: string; url: string; icon: React.ComponentType<{ className?: string }>; module?: string; roles?: string[] };
type MenuSection = { label: string; icon: React.ComponentType<{ className?: string }>; items: MenuItem[] };

const menuSections: MenuSection[] = [
  {
    label: 'Geral', icon: Home, items: [
      { title: 'Início', url: '/', icon: Home, module: 'dashboard' },
      { title: 'Alertas', url: '/alertas', icon: Bell, module: 'dashboard', roles: ['financeiro'] },
      { title: 'Agenda', url: '/agenda', icon: Calendar, module: 'dashboard' },
    ],
  },
  {
    label: 'Prospecção', icon: MapPin, items: [
      { title: 'Prospecção (Placas)', url: '/prospeccao', icon: MapPin, module: 'prospeccao' },
      { title: 'Aguardando Dados', url: '/prospeccao-aguardando', icon: FileWarning, module: 'prospeccao' },
      { title: 'Relatório Prospecção', url: '/relatorio-prospeccao', icon: FileBarChart, module: 'prospeccao' },
    ],
  },
  {
    label: 'Atendimento', icon: Users, items: [
      { title: 'Imóveis', url: '/imoveis', icon: Building2, module: 'imoveis' },
      { title: 'Clientes', url: '/clientes', icon: Users, module: 'clientes' },
      { title: 'Portal do Cliente', url: '/portal-clientes', icon: Globe, module: 'clientes' },
      { title: 'Funil', url: '/funil', icon: TrendingUp, module: 'funil' },
      { title: 'Ocorrências', url: '/ocorrencias', icon: AlertCircle, module: 'ocorrencias' },
      { title: 'WhatsApp', url: '/whatsapp', icon: MessageSquare, module: 'whatsapp' },
    ],
  },
  {
    label: 'Documentação', icon: FileText, items: [
      { title: 'Contratos', url: '/contratos', icon: FileText, module: 'contratos' },
      { title: 'Documentos', url: '/documentos', icon: FolderOpen, module: 'documentos' },
      { title: 'Chaves', url: '/chaves', icon: Key, module: 'chaves' },
      { title: 'Alugados/Vendidos', url: '/imoveis-alugados-vendidos', icon: Home, module: 'imoveis' },
    ],
  },
  {
    label: 'Financeiro', icon: Calculator, items: [
      { title: 'Dashboard', url: '/dashboard', icon: BarChart3, module: 'financeiro' },
      { title: 'Financeiro', url: '/financeiro', icon: DollarSign, module: 'financeiro' },
      { title: 'Contas a Pagar', url: '/contas-pagar', icon: Receipt, module: 'contas_pagar' },
      { title: 'Controle Pagamentos', url: '/controle-pagamentos', icon: Users, module: 'financeiro' },
    ],
  },
  {
    label: 'RH', icon: UsersRound, items: [
      { title: 'Funcionários', url: '/funcionarios', icon: UsersRound, module: 'funcionarios' },
      { title: 'Ponto', url: '/ponto', icon: Clock },
      { title: 'Relatório Ponto', url: '/relatorio-ponto', icon: ClipboardList, module: 'funcionarios' },
      { title: 'Banco de Horas', url: '/banco-horas', icon: Wallet, module: 'banco_horas' },
      { title: 'Folha Pagamento', url: '/folha-pagamento', icon: DollarSign, module: 'folha_pagamento' },
    ],
  },
  {
    label: 'Administração', icon: ShieldCheck, items: [
      { title: 'Usuários', url: '/admin/usuarios', icon: UserCog, module: 'usuarios' },
      { title: 'Acesso ao Computador', url: '/acesso-computador', icon: Monitor, module: 'usuarios' },
    ],
  },
  {
    label: 'Site', icon: Globe, items: [{ title: 'Site Público', url: '/site-preview', icon: Globe }],
  },
  {
    label: 'Ajuda', icon: Headphones, items: [{ title: 'Suporte', url: '/suporte', icon: Headphones }],
  },
];

export function AppSidebar() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const { roles } = useAuth();
  const { hasAccess } = usePermissions();
  const collapsed = state === 'collapsed' && !isMobile;
  const isAdmin = roles.includes('admin');

  const visibleSections = menuSections
    .map((s) => ({ ...s, items: s.items.filter((i) => (isAdmin || !i.module || hasAccess(i.module)) && (!i.roles || isAdmin || i.roles.some((r) => roles.includes(r as any)))) }))
    .filter((s) => s.items.length > 0);

  return (
    <Sidebar>
      <SidebarContent>
        <div className="px-4 py-4 border-b flex items-center gap-3 bg-transparent">
          <Logo className={collapsed ? 'w-8 h-8' : 'w-12 h-12'} />
          {!collapsed && (
            <div>
              <h1 className="text-base font-bold text-primary leading-tight">Estrela de Davi</h1>
              <p className="text-xs text-muted-foreground">Grupo Imobiliário</p>
            </div>
          )}
        </div>

        {visibleSections.map((section) => (
          <SidebarGroup key={section.label}>
            {!collapsed && (
              <SidebarGroupLabel className="flex items-center gap-2">
                <section.icon className="h-3.5 w-3.5" />
                {section.label}
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => (
                  <SidebarMenuItem key={`${section.label}-${item.url}`}>
                    <SidebarMenuButton asChild title={collapsed ? item.title : undefined}>
                      <NavLink
                        to={item.url}
                        end={item.url === '/'}
                        onClick={() => isMobile && setOpenMobile(false)}
                        className="hover:bg-muted/50"
                        activeClassName="bg-primary text-primary-foreground font-medium hover:bg-primary"
                      >
                        <item.icon className="h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}
