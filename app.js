// === Audio + UI ===
let audioCtx, analyser, dataArray, source;
let running = false;
let frozen = false;
let maxFreq = 0;
let samples = [];
let modeDocente = false;
let currentLang = "es";

const canvas = document.getElementById("freqCanvas");
const ctx2d = canvas.getContext("2d");

const freqValueEl = document.getElementById("freq-value");
const freqMaxEl = document.getElementById("freq-max");
const freqSamplesEl = document.getElementById("freq-samples");
const historyBody = document.getElementById("history-body");

const btnStart = document.getElementById("btn-start");
const btnStop = document.getElementById("btn-stop");
const btnFreeze = document.getElementById("btn-freeze");
const btnExport = document.getElementById("btn-export");
const btnMode = document.getElementById("btn-mode");
const btnToggle3d = document.getElementById("btn-toggle-3d");

const btnHome = document.getElementById("btn-home");
const btnVoz = document.getElementById("btn-voz");
const btnTheme = document.getElementById("btn-theme");
const btnPlus = document.getElementById("btn-plus");
const btnMinus = document.getElementById("btn-minus");
const btnLang = document.getElementById("btn-lang");
const btnFocus = document.getElementById("btn-focus");
const btnSearch = document.getElementById("btn-search");
const searchOverlay = document.getElementById("search-overlay");
const searchClose = document.getElementById("search-close");

const FFT_SIZE = 2048;
let smoothing = 0.8;

// === 3D vars ===
let scene, camera, renderer, controls, geometry, mesh;
const SPECTRUM_SIZE = 96;
const HISTORY_DEPTH = 80;
let heightData = [];
let show3D = true;

// ===== init 3D =====
function init3D() {
  const container = document.getElementById("scene3d");
  if (!container || !window.THREE) return;

  scene = new THREE.Scene();
  const w = container.clientWidth;
  const h = container.clientHeight;

  camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
  camera.position.set(-40, 35, 70);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(w, h);
  container.appendChild(renderer.domElement);

  // geometry with color attribute
  geometry = new THREE.PlaneGeometry(60, 40, HISTORY_DEPTH - 1, SPECTRUM_SIZE - 1);
  geometry.rotateX(-Math.PI / 2);

  const colors = [];
  for (let i = 0; i < geometry.attributes.position.count; i++) {
    colors.push(0, 0.5, 1); // default bluish
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

  const material = new THREE.MeshPhongMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    shininess: 30
  });

  mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  const light = new THREE.DirectionalLight(0xffffff, 1.2);
  light.position.set(10, 40, 30);
  scene.add(light);
  scene.add(new THREE.AmbientLight(0x404040, 0.6));

  // orbit controls
  if (THREE.OrbitControls) {
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
  }

  animate3D();
}

function animate3D() {
  requestAnimationFrame(animate3D);
  if (renderer && scene && camera && show3D) {
    if (controls) controls.update();
    renderer.render(scene, camera);
  }
}

init3D();

// ===== audio events =====
btnStart.addEventListener("click", async () => {
  if (running) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = smoothing;

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
    alert("No se pudo acceder al micrófono.");
    console.error(err);
  }
});

btnStop.addEventListener("click", () => {
  if (!running) return;
  running = false;
  btnStart.disabled = false;
  btnStop.disabled = true;
  btnFreeze.disabled = true;
  clearCanvas2D();
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
  const csvContent = ["timestamp_ms,frecuencia_hz,frecuencia_max_congelada_hz"].concat(
    samples.map(s => `${s.time},${s.freq.toFixed(2)},${s.frozenMax.toFixed(2)}`)
  ).join("\n");

  const blob = new Blob([csvContent], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const now = new Date();
  a.href = url;
  a.download = `frecuencias_${now.toISOString().replace(/[:.]/g, "-")}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

btnMode.addEventListener("click", () => {
  modeDocente = !modeDocente;
  document.getElementById("history-card").style.display = modeDocente ? "none" : "block";
  btnMode.textContent = modeDocente ? "🧑‍🎓 Modo estudiante" : "👨‍🏫 Modo docente";
});

btnToggle3d.addEventListener("click", () => {
  show3D = !show3D;
  document.getElementById("card-3d").style.display = show3D ? "block" : "none";
});

// top controls
btnHome.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
btnTheme.addEventListener("click", () => document.body.classList.toggle("theme-light"));
btnPlus.addEventListener("click", () => {
  const c = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--font-base"));
  document.documentElement.style.setProperty("--font-base", Math.min(c + 1, 22) + "px");
});
btnMinus.addEventListener("click", () => {
  const c = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--font-base"));
  document.documentElement.style.setProperty("--font-base", Math.max(c - 1, 12) + "px");
});
btnFocus.addEventListener("click", () => document.body.classList.toggle("focus-mode"));
btnSearch.addEventListener("click", () => searchOverlay.classList.add("show"));
if (searchClose) {
  searchClose.addEventListener("click", () => searchOverlay.classList.remove("show"));
  searchOverlay.addEventListener("click", (e) => {
    if (e.target === searchOverlay) searchOverlay.classList.remove("show");
  });
}

btnLang.addEventListener("click", () => {
  currentLang = currentLang === "es" ? "en" : "es";
  applyLang();
});

btnVoz.addEventListener("click", () => {
  const t = `La frecuencia actual es ${freqValueEl.textContent}`;
  if ("speechSynthesis" in window) {
    const u = new SpeechSynthesisUtterance(t);
    u.lang = currentLang === "es" ? "es-ES" : "en-US";
    window.speechSynthesis.speak(u);
  }
});

function applyLang() {
  const dict = {
    es: {
      title: "📡 Medidor de frecuencia de sonido",
      subtitle: "Versión con espectro 2D + espectro 3D en tiempo real con colores e interacción.",
      start: "🎙️ Iniciar medición",
      stop: "⏹️ Detener"
    },
    en: {
      title: "📡 Sound frequency meter",
      subtitle: "2D + realtime 3D spectrum with colors and interaction.",
      start: "🎙️ Start measuring",
      stop: "⏹️ Stop"
    }
  };
  const t = dict[currentLang];
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    if (t[key]) el.textContent = t[key];
  });
}

// ===== draw loop =====
function draw() {
  if (!running) return;
  requestAnimationFrame(draw);

  analyser.getByteFrequencyData(dataArray);
  draw2D(dataArray);

  // peak calc
  let maxVal = -1, maxIndex = -1;
  for (let i = 0; i < dataArray.length; i++) {
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

    const sample = { time: performance.now().toFixed(0), freq, frozenMax: maxFreq };
    samples.push(sample);
    freqSamplesEl.textContent = samples.length;
    updateHistory();

    // feed 3d
    push3DData(Array.from(dataArray));
  }
}

function draw2D(arr) {
  clearCanvas2D();
  const width = canvas.width;
  const height = canvas.height;
  const barWidth = (width / arr.length) * 2.1;
  let x = 0;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    const barHeight = (v / 255) * height;
    ctx2d.fillStyle = "rgba(56,189,248,0.9)";
    ctx2d.fillRect(x, height - barHeight, barWidth, barHeight);
    x += barWidth + 1;
  }
}

function clearCanvas2D() {
  ctx2d.fillStyle = "#020617";
  ctx2d.fillRect(0, 0, canvas.width, canvas.height);
}

function updateHistory() {
  const last = samples.slice(-10).reverse();
  historyBody.innerHTML = last.map((s, idx) => `<tr>
    <td>${idx + 1}</td>
    <td>${s.time}</td>
    <td>${s.freq.toFixed(1)}</td>
    <td>${s.frozenMax.toFixed(1)}</td>
  </tr>`).join("");
}

// ===== 3D data push + color =====
function push3DData(arr) {
  if (!geometry) return;
  const slice = arr.slice(0, SPECTRUM_SIZE);
  heightData.unshift(slice);
  if (heightData.length > HISTORY_DEPTH) heightData.pop();

  const pos = geometry.attributes.position;
  const colAttr = geometry.attributes.color;

  for (let z = 0; z < HISTORY_DEPTH; z++) {
    const col = heightData[z];
    for (let y = 0; y < SPECTRUM_SIZE; y++) {
      const idx = z * SPECTRUM_SIZE + y;
      let h = 0;
      if (col && typeof col[y] !== "undefined") {
        h = (col[y] / 255) * 4.0;
      }
      const x = pos.getX(idx);
      const zz = pos.getZ(idx);
      pos.setXYZ(idx, x, h, zz);

      // heatmap: azul -> verde -> amarillo -> rojo
      const intensity = col ? col[y] / 255 : 0;
      const color = heatColor(intensity);
      colAttr.setXYZ(idx, color.r, color.g, color.b);
    }
  }
  pos.needsUpdate = true;
  colAttr.needsUpdate = true;
}

function heatColor(t) {
  // t: 0..1
  if (t < 0.25) {
    return { r: 0, g: t * 4, b: 1 }; // azul a cian
  } else if (t < 0.5) {
    return { r: 0, g: 1, b: 1 - (t - 0.25) * 4 }; // cian a verde
  } else if (t < 0.75) {
    return { r: (t - 0.5) * 4, g: 1, b: 0 }; // verde a amarillo
  } else {
    return { r: 1, g: 1 - (t - 0.75) * 4, b: 0 }; // amarillo a rojo
  }
}

function indexToFrequency(index, sampleRate, fftSize) {
  return (index * sampleRate) / fftSize;
}
