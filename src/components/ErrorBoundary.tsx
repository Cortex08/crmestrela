import { Component, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('Erro na tela:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
          <AlertTriangle className="h-12 w-12 text-warning" />
          <div>
            <h2 className="text-xl font-semibold">Algo deu errado nesta tela</h2>
            <p className="text-muted-foreground">Recarregue a página. Se continuar, fale com o suporte.</p>
          </div>
          <Button onClick={() => window.location.reload()}>Recarregar</Button>
        </div>
      );
    }
    return this.props.children;
  }
}
