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
      // aquecimento REAL das 3 redes (a primeira inferência compila a GPU e é lenta; fazemos antes de a pessoa chegar).
      // Antes só o detector era aquecido (imagem em branco não tem rosto), e as redes de pontos e de reconhecimento
      // compilavam com a pessoa já parada na frente da câmera.
      try {
        const ruido = (n: number) => {
          const c = document.createElement('canvas'); c.width = c.height = n;
          const x = c.getContext('2d')!; const im = x.createImageData(n, n);
          for (let i = 0; i < im.data.length; i += 4) { im.data[i] = im.data[i + 1] = im.data[i + 2] = (Math.random() * 255) | 0; im.data[i + 3] = 255; }
          x.putImageData(im, 0, 0); return c;
        };
        await faceapi.detectSingleFace(ruido(192), new faceapi.TinyFaceDetectorOptions({ inputSize: 192 }));
        await faceapi.nets.faceLandmark68Net.detectLandmarks(ruido(112));
        await faceapi.nets.faceRecognitionNet.computeFaceDescriptor(ruido(150));
      } catch { /* aquecimento é opcional */ }
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

  if (largura < 0.22) return 'Chegue mais perto da câmera';
  if (largura > 0.95) return 'Afaste um pouco o rosto';
  if (Math.abs(dx) > 0.25 || Math.abs(dy) > 0.27) return 'Centralize o rosto dentro da moldura';

  const p = det.landmarks.positions;
  const meio = (p[0].x + p[16].x) / 2;
  const lado = (p[30].x - meio) / (p[16].x - p[0].x);
  if (Math.abs(lado) > 0.25) return 'Olhe de frente para a câmera';
  return null;
}

export const AMOSTRAS = 2;

/**
 * Enquadra o rosto, coleta poucas leituras nítidas e devolve o descritor médio.
 * Otimizado para celulares fracos: 1 detecção leve para checar o enquadramento + 1 leitura completa por amostra
 * (antes eram 2 detecções pesadas por amostra), tolerando quadros ruins sem recomeçar do zero.
 */
export async function lerRosto(video: HTMLVideoElement, onEstado: (e: EstadoRosto) => void, cancelado: () => boolean, limiteMs = 15000, aceitar?: (descritor: number[]) => boolean): Promise<number[]> {
  const faceapi = await carregarFaceApi();
  const leve = new faceapi.TinyFaceDetectorOptions({ inputSize: 192, scoreThreshold: 0.4 });
  const leitura = new faceapi.TinyFaceDetectorOptions({ inputSize: 256, scoreThreshold: 0.5 });
  const canvas = document.createElement('canvas');
  const ini = Date.now();
  let pronto = false, quadro = 0, falhas = 0, ultimaDica = 'Coloque o rosto no centro da moldura';
  const amostras: Float32Array[] = [];
  let aceito: Float32Array | null = null;
  const emitir = (fase: EstadoRosto['fase'], ok: boolean, dica: string) => { ultimaDica = dica; onEstado({ fase, ok, dica, leituras: amostras.length }); };
  // um quadro ruim isolado não zera o progresso; só 3 seguidos
  const ruim = (dica: string, espera = 40) => { falhas++; if (falhas >= 3) { pronto = false; amostras.length = 0; } emitir('posicionar', false, dica); return pausa(espera); };

  // Meta: terminar em poucos segundos. Passou de 4,5 s com ao menos 1 leitura boa, usa o que já tem.
  const TEMPO_MAX_LEITURA = 4500;
  while (Date.now() - ini < limiteMs && amostras.length < AMOSTRAS) {
    if (amostras.length >= 1 && Date.now() - ini > TEMPO_MAX_LEITURA) break;
    if (cancelado()) throw new Error('cancelado');
    if (video.readyState < 2 || !video.videoWidth) { await pausa(60); continue; }
    quadro++;

    if (!pronto) {
      // fase 1: detecção leve só para conferir o enquadramento
      const det = await faceapi.detectSingleFace(video, leve).withFaceLandmarks();
      if (!det) { await ruim('Não encontrei seu rosto. Olhe para a câmera', 60); continue; }
      if (quadro % 6 === 1) {
        const l = brilho(video, canvas);
        if (l < 45) { await ruim('Está escuro. Vá para um lugar mais iluminado', 150); continue; }
        if (l > 235) { await ruim('Luz forte demais. Evite ficar contra a janela', 150); continue; }
      }
      const ajuste = conferirEnquadramento(video, det);
      if (ajuste) { await ruim(ajuste); continue; }
      falhas = 0; pronto = true;
      emitir('lendo', true, 'Lendo seu rosto, fique parado…');
    }

    // fase 2: uma única leitura completa por amostra
    const full = await faceapi.detectSingleFace(video, leitura).withFaceLandmarks().withFaceDescriptor();
    if (!full || full.detection.score < 0.6) { falhas++; if (falhas >= 3) { pronto = false; amostras.length = 0; } continue; }
    falhas = 0;
    amostras.push(full.descriptor);
    // leitura já confiável (o chamador decide): não precisa coletar mais amostras
    if (aceitar && aceitar(Array.from(full.descriptor))) { aceito = full.descriptor; emitir('lendo', true, 'Pronto!'); break; }
    emitir('lendo', true, amostras.length >= AMOSTRAS ? 'Pronto!' : 'Lendo seu rosto, fique parado…');
  }

  if (aceito) return Array.from(aceito);
  if (amostras.length < 1) throw new Error(`Não consegui ler seu rosto com clareza. ${ultimaDica}. Tente de novo.`);

  const media = (xs: Float32Array[]) => Float32Array.from({ length: 128 }, (_, i) => xs.reduce((t, a) => t + a[i], 0) / xs.length);
  if (amostras.length > 1 && euclid(amostras[0], amostras[amostras.length - 1]) > 0.55) {
    throw new Error('A leitura ficou instável. Fique parado, olhando para a câmera, e tente de novo.');
  }
  return Array.from(media(amostras));
}
