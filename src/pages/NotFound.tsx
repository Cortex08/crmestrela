import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const NotFound = () => (
  <div className="min-h-screen flex items-center justify-center bg-background p-6">
    <div className="text-center space-y-4">
      <h1 className="text-5xl font-bold text-primary">404</h1>
      <p className="text-muted-foreground">Página não encontrada</p>
      <Link to="/"><Button>Voltar ao início</Button></Link>
    </div>
  </div>
);

export default NotFound;
