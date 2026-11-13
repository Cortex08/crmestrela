import { useLocation, Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Hammer } from 'lucide-react';

const titles: Record<string, string> = {
  '/alertas': 'Alertas', '/agenda': 'Agenda', '/prospeccao': 'Prospecção (Placas)',
  '/prospeccao-aguardando': 'Aguardando Dados', '/relatorio-prospeccao': 'Relatório Prospecção', '/ocorrencias': 'Ocorrências',
  '/whatsapp': 'WhatsApp', '/documentos': 'Documentos', '/chaves': 'Chaves', '/imoveis-alugados-vendidos': 'Alugados/Vendidos',
  '/dashboard': 'Dashboard Financeiro', '/financeiro': 'Financeiro', '/contas-pagar': 'Contas a Pagar',
  '/controle-pagamentos': 'Controle de Pagamentos', '/funcionarios': 'Funcionários', '/ponto': 'Ponto',
  '/relatorio-ponto': 'Relatório de Ponto', '/banco-horas': 'Banco de Horas', '/folha-pagamento': 'Folha de Pagamento',
  '/site-preview': 'Site Público', '/suporte': 'Suporte',
};

/** Telas da próxima etapa da migração: o banco e as permissões já estão prontos */
const EmBreve = () => {
  const { pathname } = useLocation();
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">{titles[pathname] || 'Em construção'}</h1>
        <Card className="card-premium">
          <CardContent className="py-16 text-center space-y-4">
            <Hammer className="mx-auto h-12 w-12 text-muted-foreground" />
            <div>
              <p className="font-medium">Esta tela está sendo migrada para o sistema novo.</p>
              <p className="text-sm text-muted-foreground">Ela chega na próxima etapa. Enquanto isso, use as telas já disponíveis.</p>
            </div>
            <Link to="/"><Button variant="outline">Voltar ao início</Button></Link>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default EmBreve;
