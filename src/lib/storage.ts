import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const PRIVATE_BUCKET = 'contratos';
const ALLOWED_DOC_TYPES = [
  'application/pdf', 'image/png', 'image/jpeg', 'image/webp',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const ALLOWED_PHOTO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

const safeExt = (name: string) => (name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5);
const randomName = (file: File) => `${Date.now()}_${crypto.randomUUID()}.${safeExt(file.name)}`;

/** Envia documento para o bucket privado. Retorna o caminho interno (não é link público). */
export async function uploadPrivateFile(file: File, folder: string): Promise<string> {
  if (!ALLOWED_DOC_TYPES.includes(file.type)) throw new Error('Tipo de arquivo não permitido (use PDF, imagem ou Word)');
  if (file.size > 20 * 1024 * 1024) throw new Error('Arquivo maior que 20 MB');
  const path = `${folder.replace(/[^a-zA-Z0-9/_-]/g, '')}/${randomName(file)}`;
  const { error } = await supabase.storage.from(PRIVATE_BUCKET).upload(path, file, { contentType: file.type });
  if (error) throw error;
  return path;
}

/** Envia foto de imóvel (bucket público, usado no site). Retorna URL pública. */
export async function uploadPropertyPhoto(file: File): Promise<string> {
  if (!ALLOWED_PHOTO_TYPES.includes(file.type)) throw new Error('Use fotos PNG, JPG ou WEBP');
  if (file.size > 10 * 1024 * 1024) throw new Error('Foto maior que 10 MB');
  const path = randomName(file);
  const { error } = await supabase.storage.from('property-photos').upload(path, file, { contentType: file.type });
  if (error) throw error;
  return supabase.storage.from('property-photos').getPublicUrl(path).data.publicUrl;
}

/** Foto de prospecção (bucket de fotos, pasta prospeccao/). Retorna URL pública. */
export async function uploadProspectPhoto(file: File): Promise<string> {
  if (!ALLOWED_PHOTO_TYPES.includes(file.type)) throw new Error('Use fotos PNG, JPG ou WEBP');
  if (file.size > 10 * 1024 * 1024) throw new Error('Foto maior que 10 MB');
  const path = `prospeccao/${randomName(file)}`;
  const { error } = await supabase.storage.from('property-photos').upload(path, file, { contentType: file.type });
  if (error) throw error;
  return supabase.storage.from('property-photos').getPublicUrl(path).data.publicUrl;
}

/** Abre um arquivo guardado. Arquivos privados ganham um link temporário de 5 minutos. */
export async function openStoredFile(value: string | null | undefined) {
  if (!value) return;
  // Abre a janela antes do await para não ser bloqueada pelo navegador
  const win = window.open('', '_blank');
  try {
    let url = value;
    if (!/^https?:\/\//i.test(value)) {
      const { data, error } = await supabase.storage.from(PRIVATE_BUCKET).createSignedUrl(value, 300);
      if (error || !data) throw error || new Error('sem link');
      url = data.signedUrl;
    }
    if (win) {
      win.opener = null;
      win.location.href = url;
    } else {
      window.open(url, '_blank', 'noopener');
    }
  } catch (e) {
    win?.close();
    toast.error('Não foi possível abrir o arquivo');
  }
}

/** Remove arquivo privado (ignora links externos) */
export async function removePrivateFile(value: string | null | undefined) {
  if (!value || /^https?:\/\//i.test(value)) return;
  await supabase.storage.from(PRIVATE_BUCKET).remove([value]);
}
