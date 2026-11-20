const el = id => document.getElementById(id);
const status = message => { el('status').textContent = message; };
let recognizer;
async function readLink(value) {
  let url;
  try { url = new URL(value); } catch { throw Error('Pega un enlace de TikTok o elige un video de Fotos.'); }
  if (url.protocol !== 'https:' || !/(^|\.)tiktok\.com$/i.test(url.hostname)) throw Error('Usa un enlace HTTPS de TikTok.');
  try {
    const response = await fetch('https://www.tikwm.com/api/?url=' + encodeURIComponent(url.href));
    if (!response.ok) throw Error();
    const data = await response.json();
    if (data.code !== 0 || !data.data?.play) throw Error();
    const media = await fetch(new URL(data.data.play,'https://www.tikwm.com'));
    if (!media.ok) throw Error();
    return await media.arrayBuffer();
  } catch { throw Error('El enlace no se pudo abrir. Guarda el video desde TikTok y elígelo desde Fotos.'); }
}
async function samples(bytes, context) {
  let audio;
  try { audio = await context.decodeAudioData(bytes); } catch { throw Error('No se pudo leer el audio del video. Prueba con un MP4 con sonido.'); }
  const renderer = new OfflineAudioContext(1, Math.ceil(audio.duration * 16000), 16000);
  const source = renderer.createBufferSource();
  source.buffer = audio;
  source.connect(renderer.destination);
  source.start();
  return (await renderer.startRendering()).getChannelData(0);
}
document.querySelector('form').onsubmit = async event => {
  event.preventDefault();
  el('start').disabled = true;
  el('result').hidden = true;
  let context;
  try {
    context = new AudioContext();
    const file = el('file').files[0];
    status(file ? 'Leyendo el archivo…' : 'Abriendo el enlace…');
    const bytes = file ? await file.arrayBuffer() : await readLink(el('url').value.trim());
    const audio = await samples(bytes,context);
    if (!recognizer) {
      status('Descargando el modelo de voz. Mantén abierta esta página…');
      const {pipeline, env} = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js');
      env.allowLocalModels = false;
      env.backends.onnx.wasm.numThreads = 1;
      recognizer = await pipeline('automatic-speech-recognition','Xenova/whisper-tiny');
    }
    status('Transcribiendo en tu dispositivo…');
    const answer = await recognizer(audio,{language:'spanish',task:'transcribe',chunk_length_s:30,stride_length_s:5});
    el('out').value = answer.text.trim();
    el('result').hidden = !el('out').value;
    status(el('out').value ? 'Puedes corregir el texto antes de copiarlo.' : 'No se distinguieron palabras.');
  } catch(error) { status(error.message || 'No se pudo transcribir el video.'); }
  finally { el('start').disabled = false; if (context) await context.close().catch(()=>{}); }
};
el('file').onchange = () => { if (el('file').files.length) el('url').value = ''; };
el('url').oninput = () => { if (el('url').value) el('file').value = ''; };
el('copy').onclick = async () => {
  try { await navigator.clipboard.writeText(el('out').value); status('Texto copiado.'); }
  catch { el('out').select(); status('Texto seleccionado. Toca Copiar.'); }
};
el('save').onclick = () => {
  const url = URL.createObjectURL(new Blob([el('out').value],{type:'text/plain;charset=utf-8'}));
  const a = document.createElement('a'); a.href=url; a.download='transcripcion.txt'; a.click();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
};
