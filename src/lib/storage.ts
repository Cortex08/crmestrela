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

/** Menor lado maior aceito para foto de imóvel: abaixo disso é miniatura/print e fica borrada no site. */
export const FOTO_LADO_MINIMO = 800;
/** Fotos maiores que isso (celulares tiram ~4000px) são reduzidas: o site fica rápido e a foto continua nítida. */
const FOTO_LADO_MAXIMO = 2000;

export class FotoPequenaError extends Error {}

async function prepararFotoImovel(file: File): Promise<File> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    return file; // navegador não conseguiu ler: envia como está
  }
  const { width: w, height: h } = bmp;
  const maior = Math.max(w, h);
  if (maior < FOTO_LADO_MINIMO) {
    bmp.close();
    throw new FotoPequenaError(`"${file.name}" é pequena demais (${w}×${h} pixels)`);
  }
  if (maior <= FOTO_LADO_MAXIMO) { bmp.close(); return file; }
  const escala = FOTO_LADO_MAXIMO / maior;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * escala);
  canvas.height = Math.round(h * escala);
  const ctx = canvas.getContext('2d');
  if (!ctx) { bmp.close(); return file; }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.88));
  if (!blob || blob.size >= file.size) return file;
  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
}

/** Envia foto de imóvel (bucket público, usado no site). Retorna URL pública. */
export async function uploadPropertyPhoto(original: File): Promise<string> {
  if (!ALLOWED_PHOTO_TYPES.includes(original.type)) throw new Error('Use fotos PNG, JPG ou WEBP');
  if (original.size > 20 * 1024 * 1024) throw new Error('Foto maior que 20 MB');
  const file = await prepararFotoImovel(original);
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
