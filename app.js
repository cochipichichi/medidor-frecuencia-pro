let audioCtx, analyser, dataArray, source, stream;
let running = false;
let frozen = false;
let maxFreq = 0;
let samples = [];

const btnStart = document.getElementById("btn-start");
const btnStop = document.getElementById("btn-stop");
const btnFreeze = document.getElementById("btn-freeze");
const btnExport = document.getElementById("btn-export");

const freqValueEl = document.getElementById("freq-value");
const freqMaxEl = document.getElementById("freq-max");

const canvas2d = document.getElementById("freqCanvas");
const ctx2d = canvas2d.getContext("2d");

const canvas3d = document.getElementById("freqCanvas3d");
const ctx3d = canvas3d.getContext("2d");

// historial para el falso 3D
const HISTORY = 60;
const BINS = 64;
let historyData = [];

btnStart.addEventListener("click", async () => {
  if (running) return;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.8;

    source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);

    dataArray = new Uint8Array(analyser.frequencyBinCount);

    running = true;
    btnStart.disabled = true;
    btnStop.disabled = false;
    btnFreeze.disabled = false;
    btnExport.disabled = false;

    draw();
  } catch (err) {
    alert("No se pudo acceder al micrófono");
    console.error(err);
  }
});

btnStop.addEventListener("click", () => {
  running = false;
  btnStart.disabled = false;
  btnStop.disabled = true;
  btnFreeze.disabled = true;
  freqValueEl.textContent = "-- Hz";
});

btnFreeze.addEventListener("click", () => {
  frozen = !frozen;
  btnFreeze.textContent = frozen ? "🧊 Descongelar" : "🧊 Congelar máx.";
});

btnExport.addEventListener("click", () => {
  if (samples.length === 0) {
    alert("No hay datos para exportar.");
    return;
  }
  const csv = ["timestamp_ms,frecuencia_hz,frecuencia_max_congelada_hz"]
    .concat(samples.map(s => `${s.time},${s.freq.toFixed(2)},${s.frozenMax.toFixed(2)}`))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "frecuencias_offline.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

function draw() {
  if (!running) return;
  requestAnimationFrame(draw);

  analyser.getByteFrequencyData(dataArray);

  // 2D
  draw2D(dataArray);

  // detectar pico
  let maxVal = -1, maxIndex = -1;
  for (let i=0; i<dataArray.length; i++) {
    if (dataArray[i] > maxVal) {
      maxVal = dataArray[i];
      maxIndex = i;
    }
  }
  const freq = indexToFrequency(maxIndex, audioCtx.sampleRate, analyser.fftSize);
  if (!isNaN(freq) && freq > 0) {
    freqValueEl.textContent = freq.toFixed(1) + " Hz";
    if (!frozen && freq > maxFreq) maxFreq = freq;
    freqMaxEl.textContent = maxFreq.toFixed(1) + " Hz";
    samples.push({
      time: performance.now().toFixed(0),
      freq,
      frozenMax: maxFreq
    });
  }

  // 3D fake
  pushHistory(Array.from(dataArray).slice(0, BINS));
  drawFake3D();
}

function draw2D(arr) {
  ctx2d.fillStyle = "#020617";
  ctx2d.fillRect(0,0,canvas2d.width, canvas2d.height);

  const w = canvas2d.width;
  const h = canvas2d.height;
  const barW = (w / arr.length) * 2.1;
  let x = 0;
  for (let i=0;i<arr.length;i++) {
    const v = arr[i];
    const barH = (v/255) * h;
    ctx2d.fillStyle = "rgba(56,189,248,0.9)";
    ctx2d.fillRect(x, h - barH, barW, barH);
    x += barW + 1;
  }
}

// guarda historial
function pushHistory(slice) {
  historyData.unshift(slice);
  if (historyData.length > HISTORY) historyData.pop();
}

// dibuja perspectiva
function drawFake3D() {
  const w = canvas3d.width;
  const h = canvas3d.height;
  ctx3d.fillStyle = "#020617";
  ctx3d.fillRect(0,0,w,h);

  // centro de fuga
  const fx = w * 0.15;
  const fy = h * 0.1;

  for (let z=0; z<historyData.length; z++) {
    const row = historyData[z];
    const depth = z / HISTORY; // 0..1
    const scale = 1 - depth * 0.7; // más lejos = más chico
    const offsetX = fx + depth * (w * 0.65);
    const baseY = fy + depth * (h * 0.65);

    if (!row) continue;

    const barW = (w * 0.7 / row.length) * scale;

    for (let i=0; i<row.length; i++) {
      const v = row[i];
      const barH = (v / 255) * 80 * scale;
      const x = offsetX + i * barW;
      const y = baseY;

      // color según intensidad
      const t = v/255;
      const col = heatColor(t);
      ctx3d.fillStyle = col;
      ctx3d.fillRect(x, y - barH, barW, barH);
    }
  }

  ctx3d.fillStyle = "rgba(255,255,255,0.3)";
  ctx3d.fillText("Tiempo →", w - 80, h - 10);
  ctx3d.fillText("Frecuencia ↑", 10, 15);
}

function heatColor(t) {
  if (t < 0.25) return "rgba(14,165,233,0.85)";
  if (t < 0.5) return "rgba(34,197,94,0.85)";
  if (t < 0.75) return "rgba(234,179,8,0.85)";
  return "rgba(239,68,68,0.85)";
}

function indexToFrequency(index, sampleRate, fftSize) {
  return (index * sampleRate) / fftSize;
}
