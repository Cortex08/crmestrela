import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { friendlyError } from '@/lib/utils';
import { RESULTADO_CONTATO } from '@/lib/prospeccao';

interface Props {
  prospectId: string;
  profiles: { id: string; nome?: string }[];
  onSuccess: () => void;
}

export default function ProspectContactForm({ prospectId, profiles, onSuccess }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState('nao_atendeu');
  const [observacoes, setObservacoes] = useState('');
  const [quem, setQuem] = useState(user?.id || '');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.rpc('registrar_contato_prospeccao', {
      _prospect_id: prospectId, _resultado: resultado, _observacoes: observacoes || null, _quem_ligou: quem || null,
    });
    setLoading(false);
    if (error) return toast.error(error.code === 'P0001' ? error.message : friendlyError(error, 'Erro ao registrar contato'));
    toast.success('Contato registrado!');
    onSuccess();
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label>Quem Ligou</Label>
        <Select value={quem} onValueChange={setQuem}>
          <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
          <SelectContent>{profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Resultado da Ligação *</Label>
        <Select value={resultado} onValueChange={setResultado}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(RESULTADO_CONTATO).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Observações da Ligação</Label>
        <Textarea rows={4} placeholder="Detalhes sobre a conversa, retorno, etc..." value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={loading}>{loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Registrar Contato</Button>
      </div>
    </form>
  );
}
