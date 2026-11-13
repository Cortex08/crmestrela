import { lazy, Suspense } from 'react';
import { Toaster } from 'sonner';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { PermissionsProvider } from '@/contexts/PermissionsContext';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { FullScreenLoader } from '@/components/ui/loading';
import Login from './pages/Login';
import Index from './pages/Index';

// Cada tela carrega só quando é aberta (sistema abre mais rápido)
const Imoveis = lazy(() => import('./pages/Imoveis'));
const Clientes = lazy(() => import('./pages/Clientes'));
const Funil = lazy(() => import('./pages/Funil'));
const Contratos = lazy(() => import('./pages/Contratos'));
const Perfil = lazy(() => import('./pages/Perfil'));
const Usuarios = lazy(() => import('./pages/admin/Usuarios'));
const Agenda = lazy(() => import('./pages/Agenda'));
const Alertas = lazy(() => import('./pages/Alertas'));
const Chaves = lazy(() => import('./pages/Chaves'));
const Ocorrencias = lazy(() => import('./pages/Ocorrencias'));
const Documentos = lazy(() => import('./pages/Documentos'));
const Prospeccao = lazy(() => import('./pages/Prospeccao'));
const ProspeccaoAguardando = lazy(() => import('./pages/ProspeccaoAguardando'));
const RelatorioProspeccao = lazy(() => import('./pages/RelatorioProspeccao'));
const ImoveisAlugadosVendidos = lazy(() => import('./pages/ImoveisAlugadosVendidos'));
const Financeiro = lazy(() => import('./pages/Financeiro'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const ContasPagar = lazy(() => import('./pages/ContasPagar'));
const ControlePagamentos = lazy(() => import('./pages/ControlePagamentos'));
const Funcionarios = lazy(() => import('./pages/Funcionarios'));
const Ponto = lazy(() => import('./pages/Ponto'));
const PontoQuiosque = lazy(() => import('./pages/PontoQuiosque'));
const RelatorioPonto = lazy(() => import('./pages/RelatorioPonto'));
const BancoHoras = lazy(() => import('./pages/BancoHoras'));
const FolhaPagamento = lazy(() => import('./pages/FolhaPagamento'));
const WhatsApp = lazy(() => import('./pages/WhatsApp'));
const SiteHome = lazy(() => import('./site/SiteHome'));
const SiteBusca = lazy(() => import('./site/SiteBusca'));
const SiteImovel = lazy(() => import('./site/SiteImovel'));
const SiteAnunciar = lazy(() => import('./site/SiteFormPagina').then((m) => ({ default: m.SiteAnunciar })));
const SiteContato = lazy(() => import('./site/SiteFormPagina').then((m) => ({ default: m.SiteContato })));
const SiteAdmin = lazy(() => import('./pages/SiteAdmin'));
const AcessoComputador = lazy(() => import('./pages/AcessoComputador'));
const Localizacao = lazy(() => import('./pages/Localizacao'));
const PortalClientes = lazy(() => import('./pages/PortalClientes'));
const PortalCliente = lazy(() => import('./portal/Portal'));
const Suporte = lazy(() => import('./pages/Suporte'));
const EmBreve = lazy(() => import('./pages/EmBreve'));
const NotFound = lazy(() => import('./pages/NotFound'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 60 * 1000, gcTime: 10 * 60 * 1000 },
    mutations: { retry: 0 },
  },
});

const page = (el: JSX.Element, module?: string) => (
  <ProtectedRoute module={module}>
    <ErrorBoundary>{el}</ErrorBoundary>
  </ProtectedRoute>
);

const proximaEtapa: [string, string | undefined][] = [
];

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <Toaster richColors position="top-right" />
      <BrowserRouter>
        <AuthProvider>
          <PermissionsProvider>
            <Suspense fallback={<FullScreenLoader />}>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/site" element={<ErrorBoundary><SiteHome /></ErrorBoundary>} />
                <Route path="/site/imoveis" element={<ErrorBoundary><SiteBusca /></ErrorBoundary>} />
                <Route path="/site/imovel/:codigo" element={<ErrorBoundary><SiteImovel /></ErrorBoundary>} />
                <Route path="/site/anunciar" element={<ErrorBoundary><SiteAnunciar /></ErrorBoundary>} />
                <Route path="/site/contato" element={<ErrorBoundary><SiteContato /></ErrorBoundary>} />
                <Route path="/site-preview" element={page(<SiteAdmin />)} />
                <Route path="/" element={page(<Index />, 'dashboard')} />
                <Route path="/imoveis" element={page(<Imoveis />, 'imoveis')} />
                <Route path="/clientes" element={page(<Clientes />, 'clientes')} />
                <Route path="/funil" element={page(<Funil />, 'funil')} />
                <Route path="/contratos" element={page(<Contratos />, 'contratos')} />
                <Route path="/agenda" element={page(<Agenda />, 'dashboard')} />
                <Route path="/alertas" element={page(<Alertas />, 'dashboard')} />
                <Route path="/chaves" element={page(<Chaves />, 'chaves')} />
                <Route path="/ocorrencias" element={page(<Ocorrencias />, 'ocorrencias')} />
                <Route path="/documentos" element={page(<Documentos />, 'documentos')} />
                <Route path="/prospeccao" element={page(<Prospeccao />, 'prospeccao')} />
                <Route path="/prospeccao-aguardando" element={page(<ProspeccaoAguardando />, 'prospeccao')} />
                <Route path="/relatorio-prospeccao" element={page(<RelatorioProspeccao />, 'prospeccao')} />
                <Route path="/imoveis-alugados-vendidos" element={page(<ImoveisAlugadosVendidos />, 'imoveis')} />
                <Route path="/dashboard" element={page(<Dashboard />, 'financeiro')} />
                <Route path="/financeiro" element={page(<Financeiro />, 'financeiro')} />
                <Route path="/contas-pagar" element={page(<ContasPagar />, 'contas_pagar')} />
                <Route path="/controle-pagamentos" element={page(<ControlePagamentos />, 'financeiro')} />
                <Route path="/funcionarios" element={page(<Funcionarios />, 'funcionarios')} />
                <Route path="/ponto" element={page(<Ponto />)} />
                <Route path="/quiosque" element={page(<PontoQuiosque />)} />
                <Route path="/relatorio-ponto" element={page(<RelatorioPonto />, 'funcionarios')} />
                <Route path="/banco-horas" element={page(<BancoHoras />, 'banco_horas')} />
                <Route path="/folha-pagamento" element={page(<FolhaPagamento />, 'folha_pagamento')} />
                <Route path="/whatsapp" element={page(<WhatsApp />, 'whatsapp')} />
                <Route path="/portal" element={<ErrorBoundary><PortalCliente /></ErrorBoundary>} />
                <Route path="/portal-clientes" element={page(<PortalClientes />, 'clientes')} />
                <Route path="/acesso-computador" element={page(<AcessoComputador />)} />
                <Route path="/localizacao" element={page(<Localizacao />)} />
                <Route path="/suporte" element={page(<Suporte />)} />
                <Route path="/perfil" element={page(<Perfil />)} />
                <Route path="/admin/usuarios" element={page(<Usuarios />, 'usuarios')} />
                {proximaEtapa.map(([path, module]) => (
                  <Route key={path} path={path} element={page(<EmBreve />, module)} />
                ))}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </PermissionsProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
