// @ts-nocheck
// Reconhecimento facial no navegador (a imagem nunca sai do aparelho; só 128 números são enviados).
// A biblioteca e os modelos só são baixados quando alguém abre a câmera.
let carregando: Promise<any> | null = null;

export function carregarFaceApi(): Promise<any> {
  if (!carregando) {
    carregando = (async () => {
      const faceapi: any = await import('@vladmandic/face-api');
      try { await faceapi.tf.setBackend('webgl'); } catch { /* usa o padrão */ }
      await faceapi.tf.ready();
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri('./models'),
        faceapi.nets.faceLandmark68Net.loadFromUri('./models'),
        faceapi.nets.faceRecognitionNet.loadFromUri('./models'),
      ]);
      // aquecimento: a primeira inferência é lenta (compila a GPU). Fazemos agora, antes de a pessoa precisar.
      try {
        const c = document.createElement('canvas'); c.width = c.height = 160;
        await faceapi.detectSingleFace(c, new faceapi.TinyFaceDetectorOptions({ inputSize: 160 })).withFaceLandmarks().withFaceDescriptor();
      } catch { /* sem rosto na imagem em branco: esperado */ }
      return faceapi;
    })().catch((e) => { carregando = null; throw e; });
  }
  return carregando;
}

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));
const dist2 = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const euclid = (a: ArrayLike<number>, b: ArrayLike<number>) => { let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2; return Math.sqrt(s); };

/** O que a tela mostra para a pessoa a cada instante. */
export interface EstadoRosto {
  /** posicionar: enquadrar o rosto · lendo: coletando o rosto */
  fase: 'posicionar' | 'lendo';
  /** true = rosto bem enquadrado (moldura verde) */
  ok: boolean;
  dica: string;
  /** leituras já feitas (só na fase "lendo"), de 0 a AMOSTRAS */
  leituras: number;
}

/** Brilho médio (0–255) da região central do vídeo. */
function brilho(video: HTMLVideoElement, canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return 128;
  canvas.width = 48; canvas.height = 36;
  ctx.drawImage(video, 0, 0, 48, 36);
  const d = ctx.getImageData(12, 6, 24, 24).data;
  let s = 0;
  for (let i = 0; i < d.length; i += 4) s += d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
  return s / (d.length / 4);
}

/**
 * Confere o enquadramento do rosto em relação à moldura (oval no centro do vídeo mostrado na tela).
 * Devolve null se está tudo certo, ou a dica do que ajustar.
 */
function conferirEnquadramento(video: HTMLVideoElement, det: any): string | null {
  const vw = video.videoWidth, vh = video.videoHeight;
  const cw = video.clientWidth || vw, ch = video.clientHeight || vh;
  // o vídeo é exibido com object-cover: só parte dele aparece
  const escala = Math.max(cw / vw, ch / vh);
  const visW = cw / escala, visH = ch / escala;
  const b = det.detection.box;
  const largura = b.width / visW;
  const dx = (b.x + b.width / 2 - vw / 2) / visW;
  const dy = (b.y + b.height / 2 - vh / 2) / visH + 0.02; // a moldura fica um pouco acima do meio

  if (largura < 0.26) return 'Chegue mais perto da câmera';
  if (largura > 0.7) return 'Afaste um pouco o rosto';
  if (Math.abs(dx) > 0.2 || Math.abs(dy) > 0.22) return 'Centralize o rosto dentro da moldura';

  const p = det.landmarks.positions;
  const meio = (p[0].x + p[16].x) / 2;
  const lado = (p[30].x - meio) / (p[16].x - p[0].x);
  if (Math.abs(lado) > 0.2) return 'Olhe de frente para a câmera';
  return null;
}

export const AMOSTRAS = 5;

/**
 * Enquadra o rosto, coleta várias leituras nítidas e devolve o descritor médio (mais estável que uma leitura só).
 * Sem prova de vida por piscada: o rosto é lido assim que fica bem enquadrado.
 */
export async function lerRosto(video: HTMLVideoElement, onEstado: (e: EstadoRosto) => void, cancelado: () => boolean, limiteMs = 40000): Promise<number[]> {
  const faceapi = await carregarFaceApi();
  const rapido = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.4 });
  const preciso = new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 });
  const canvas = document.createElement('canvas');
  const ini = Date.now();
  let bons = 0, quadro = 0, ultimaDica = 'Coloque o rosto no centro da moldura';
  const amostras: Float32Array[] = [];
  const emitir = (fase: EstadoRosto['fase'], ok: boolean, dica: string) => { ultimaDica = dica; onEstado({ fase, ok, dica, leituras: amostras.length }); };

  while (Date.now() - ini < limiteMs && amostras.length < AMOSTRAS) {
    if (cancelado()) throw new Error('cancelado');
    if (video.readyState < 2 || !video.videoWidth) { await pausa(60); continue; }
    quadro++;

    const lendo = bons >= 2;
    const det = await faceapi.detectSingleFace(video, lendo ? preciso : rapido).withFaceLandmarks();
    if (!det) { bons = 0; amostras.length = 0; emitir('posicionar', false, 'Não encontrei seu rosto. Olhe para a câmera'); await pausa(80); continue; }

    if (quadro % 8 === 1) {
      const l = brilho(video, canvas);
      if (l < 45) { bons = 0; amostras.length = 0; emitir('posicionar', false, 'Está escuro. Vá para um lugar mais iluminado'); await pausa(150); continue; }
      if (l > 235) { bons = 0; amostras.length = 0; emitir('posicionar', false, 'Luz forte demais. Evite ficar contra a janela'); await pausa(150); continue; }
    }

    const ajuste = conferirEnquadramento(video, det);
    if (ajuste) { bons = 0; amostras.length = 0; emitir('posicionar', false, ajuste); await pausa(40); continue; }
    bons++;
    if (bons < 2) { emitir('posicionar', true, 'Perfeito, fique assim…'); continue; }

    // leitura nítida: só usa quadros em que o detector tem confiança alta
    const full = await faceapi.detectSingleFace(video, preciso).withFaceLandmarks().withFaceDescriptor();
    if (!full || full.detection.score < 0.7) { await pausa(30); continue; }
    amostras.push(full.descriptor);
    emitir('lendo', true, amostras.length >= AMOSTRAS ? 'Pronto!' : 'Lendo seu rosto, fique parado…');
    await pausa(40);
  }

  if (amostras.length < AMOSTRAS) throw new Error(`Não consegui ler seu rosto com clareza. ${ultimaDica}. Tente de novo.`);

  // descarta leituras discrepantes (borrão, movimento): fica com as mais próximas da mediana
  const media = (xs: Float32Array[]) => Float32Array.from({ length: 128 }, (_, i) => xs.reduce((t, a) => t + a[i], 0) / xs.length);
  const centro = media(amostras);
  const ordenadas = [...amostras].sort((a, b) => euclid(a, centro) - euclid(b, centro));
  const boas = ordenadas.slice(0, 4);
  if (euclid(boas[0], boas[boas.length - 1]) > 0.5) throw new Error('A leitura ficou instável. Fique parado, olhando para a câmera, e tente de novo.');
  return Array.from(media(boas));
}
