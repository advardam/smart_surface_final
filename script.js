// script.js - Dashboard interactivity, AJAX, radar canvas, chart, conclusion modal

// ---------- Config ----------
const ACCURACY_K = 0.8;   // temperature sensitivity factor
const ACCURACY_MIN = 80;  // minimum accuracy percent
const MAX_CHART_POINTS = 10;

// ---------- DOM elements ----------
const dotUltra = document.getElementById('dot-ultra');
const dotColor = document.getElementById('dot-color');
const dotTemp = document.getElementById('dot-temp');
const dotBtn = document.getElementById('dot-btn');
const dotOled = document.getElementById('dot-oled');
const dotBuzz = document.getElementById('dot-buzz');

const liveDistance = document.getElementById('live-distance');
const liveColor = document.getElementById('live-color');
const liveObj = document.getElementById('live-obj');
const liveAmb = document.getElementById('live-amb');
const liveSpeed = document.getElementById('live-speed');
const liveAccuracy = document.getElementById('live-accuracy');

const btnDistance = document.getElementById('btn-distance');
const btnShape = document.getElementById('btn-shape');
const btnMaterial = document.getElementById('btn-material');
const btnConclusion = document.getElementById('btn-conclusion');

const modalBackdrop = document.getElementById('modalBackdrop');
const modalClose = document.getElementById('modalClose');
const modalOk = document.getElementById('modalOk');
const modalBody = document.getElementById('modalBody');

// ---------- Global state ----------
let lastResults = {
  distance: null, readings: [], shape: null, material: null,
  rgb: null, objTemp: null, ambTemp: null, speed: null
};

// ---------- Chart setup (Chart.js) ----------
const chartCtx = document.getElementById('chartCanvas').getContext('2d');
const chart = new Chart(chartCtx, {
  type: 'line',
  data: {
    labels: Array(MAX_CHART_POINTS).fill(''),
    datasets: [{
      label: 'Distance (cm)',
      data: Array(MAX_CHART_POINTS).fill(null),
      borderColor: '#000000',
      backgroundColor: 'rgba(0,0,0,0.06)',
      tension: 0.25,
      pointRadius: 3
    }]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: { display: true, title: { display: true, text: 'Reading #' } },
      y: { display: true, beginAtZero: true, title: { display: true, text: 'Distance (cm)' } }
    },
    plugins: { legend: { display: false } }
  }
});

function pushChartValue(v) {
  const data = chart.data.datasets[0].data;
  data.push(v);
  if (data.length > MAX_CHART_POINTS) data.shift();
  chart.update();
}

// ---------- Radar canvas ----------
const radarCanvas = document.getElementById('radarCanvas');
const rctx = radarCanvas.getContext('2d');
let radarW, radarH, cx, cy, maxR;
let sweepAngle = 0;
let sweepSpeed = 0.035;
let blips = []; // array of {x,y,r,alpha,ttl}

// resize radar to device pixel ratio for crispness
function resizeRadar() {
  const dpr = window.devicePixelRatio || 1;
  radarW = radarCanvas.clientWidth;
  radarH = radarCanvas.clientHeight;
  radarCanvas.width = Math.floor(radarW * dpr);
  radarCanvas.height = Math.floor(radarH * dpr);
  rctx.setTransform(dpr,0,0,dpr,0,0);
  cx = radarW / 2;
  cy = radarH / 2;
  maxR = Math.min(radarW, radarH) / 2 - 8;
}
resizeRadar();
window.addEventListener('resize', resizeRadar);

// add blip from reading (distance in cm -> radius)
function addBlipFromDistance(distance) {
  // map distance to radius (assume 0..200 cm)
  const norm = Math.max(0, Math.min(1, distance / 200));
  const r = norm * maxR;
  // choose an angle near sweepAngle for realism
  const angle = sweepAngle + (Math.random() - 0.5) * 0.6;
  const x = cx + Math.cos(angle) * r;
  const y = cy + Math.sin(angle) * r;
  blips.push({x, y, r: 5 + Math.random()*3, alpha: 1.0, ttl: 60 + Math.random()*40});
}

// radar draw loop
function drawRadar() {
  rctx.clearRect(0, 0, radarW, radarH);

  // background grid
  rctx.save();
  rctx.translate(cx, cy);
  // rings
  rctx.strokeStyle = 'rgba(80,220,120,0.12)';
  rctx.lineWidth = 1;
  for (let i=1;i<=4;i++) {
    rctx.beginPath();
    rctx.arc(0,0,(i/4)*maxR,0,Math.PI*2);
    rctx.stroke();
  }
  // radial lines
  for (let a=0;a<360;a+=30) {
    const rad = a * Math.PI/180;
    rctx.beginPath();
    rctx.moveTo(0,0);
    rctx.lineTo(Math.cos(rad)*maxR, Math.sin(rad)*maxR);
    rctx.strokeStyle = 'rgba(80,220,120,0.06)';
    rctx.stroke();
  }

  // blips
  for (let i = blips.length-1; i>=0; i--) {
    const b = blips[i];
    rctx.beginPath();
    rctx.fillStyle = `rgba(0,255,140,${b.alpha})`;
    rctx.arc(b.x - cx, b.y - cy, b.r, 0, Math.PI*2);
    rctx.fill();
    // halo
    rctx.fillStyle = `rgba(0,255,140,${Math.max(0, b.alpha*0.12)})`;
    rctx.beginPath();
    rctx.arc(b.x - cx, b.y - cy, b.r*3, 0, Math.PI*2);
    rctx.fill();
    b.ttl -= 1;
    b.alpha *= 0.985;
    if (b.ttl <= 0 || b.alpha < 0.02) blips.splice(i,1);
  }

  // sweeping beam
  rctx.save();
  rctx.rotate(sweepAngle);
  const beamGrad = rctx.createRadialGradient(0,0,0,0,0,maxR);
  beamGrad.addColorStop(0, 'rgba(80,255,140,0.12)');
  beamGrad.addColorStop(0.6, 'rgba(80,255,140,0.04)');
  beamGrad.addColorStop(1, 'rgba(80,255,140,0)');
  rctx.fillStyle = beamGrad;
  rctx.beginPath();
  rctx.moveTo(0,0);
  rctx.arc(0,0, maxR, -0.06, 0.06);
  rctx.closePath();
  rctx.fill();
  rctx.restore();

  // center dot
  rctx.fillStyle = '#e6ffe8';
  rctx.beginPath(); rctx.arc(0,0,4,0,Math.PI*2); rctx.fill();

  rctx.restore();

  // advance sweep
  sweepAngle += sweepSpeed;
  if (sweepAngle > Math.PI*2) sweepAngle -= Math.PI*2;
  requestAnimationFrame(drawRadar);
}
requestAnimationFrame(drawRadar);

// ---------- AJAX helpers ----------
async function fetchStatus() {
  try {
    const res = await fetch('/status');
    if (!res.ok) throw new Error('status fetch failed');
    const s = await res.json();
    // set dots (backend should provide booleans)
    setDot(dotUltra, s.ultrasonic !== false);
    setDot(dotColor, s.color !== false);
    setDot(dotTemp, s.temperature !== false);
    setDot(dotBtn, s.button !== false);
    setDot(dotOled, s.oled !== false);
    setDot(dotBuzz, s.buzzer !== false);
    // optional populate live temps if provided
    if (s.ambient_temp !== undefined) {
      liveAmb.textContent = s.ambient_temp + ' °C';
    }
    if (s.object_temp !== undefined) {
      liveObj.textContent = s.object_temp + ' °C';
    }
  } catch (err) {
    console.warn('status error', err);
    // mark all red
    setDot(dotUltra, false); setDot(dotColor, false); setDot(dotTemp, false);
    setDot(dotBtn, false); setDot(dotOled, false); setDot(dotBuzz, false);
  }
}

function setDot(el, ok) {
  if (!el) return;
  el.classList.toggle('ok', !!ok);
  el.style.background = ok ? 'limegreen' : '#ff5a5a';
}

// compute standard deviation
function stddev(arr) {
  if (!arr || arr.length === 0) return 0;
  const mean = arr.reduce((a,b)=>a+b,0)/arr.length;
  const s = Math.sqrt(arr.reduce((acc,v)=>acc+(v-mean)*(v-mean),0)/arr.length);
  return s;
}

// compute accuracy
function computeAccuracy(amb, obj, sigma) {
  const deltaT = Math.abs((obj||0) - (amb||0));
  let acc = 100 - (ACCURACY_K * deltaT + 2 * (sigma||0));
  if (acc < ACCURACY_MIN) acc = ACCURACY_MIN;
  return Math.round(acc * 100)/100;
}

// ---------- Interaction: measure endpoints ----------
async function runMeasurement(type) {
  // Visual feedback
  const btn = (type === 'distance') ? btnDistance : (type === 'shape') ? btnShape : btnMaterial;
  btn.style.boxShadow = '0 0 28px rgba(255,220,50,0.9)';
  btn.disabled = true;

  try {
    const res = await fetch(`/measure_${type}`);
    if (!res.ok) throw new Error('measurement failed');
    const data = await res.json();

    // Update state & UI depending on type
    if (type === 'distance') {
      const d = data.distance !== undefined ? data.distance : data;
      lastResults.distance = d;
      lastResults.speed = data.speed || lastResults.speed;
      lastResults.ambTemp = data.ambient_temp !== undefined ? data.ambient_temp : lastResults.ambTemp;
      // push to chart & radar
      pushChartValue(d);
      addBlipFromDistance(d);
      liveDistance.textContent = (d === null ? '—' : d + ' cm');
      if (data.speed) liveSpeed.textContent = data.speed + ' m/s';
      if (data.ambient_temp) liveAmb.textContent = data.ambient_temp + ' °C';
    } else if (type === 'shape') {
      lastResults.readings = data.readings || lastResults.readings;
      lastResults.shape = data.shape || lastResults.shape;
      // add all readings to chart and radar
      if (Array.isArray(lastResults.readings)) {
        lastResults.readings.forEach(v=>{ if (v !== null) { pushChartValue(v); addBlipFromDistance(v); }});
      }
      liveDistance.textContent = (lastResults.readings.length ? (lastResults.readings[lastResults.readings.length-1] + ' cm') : '—');
    } else if (type === 'material') {
      lastResults.material = data.material || lastResults.material;
      lastResults.rgb = data.rgb || lastResults.rgb;
      lastResults.objTemp = data.object_temp !== undefined ? data.object_temp : lastResults.objTemp;
      lastResults.ambTemp = data.ambient_temp !== undefined ? data.ambient_temp : lastResults.ambTemp;
      // small radar flash for material
      addBlipFromDistance(lastResults.distance || 30);
      if (lastResults.objTemp) liveObj.textContent = lastResults.objTemp + ' °C';
      if (lastResults.ambTemp) liveAmb.textContent = lastResults.ambTemp + ' °C';
      if (data.rgb) liveColor.textContent = `RGB(${data.rgb.r || data.rgb[0]}, ${data.rgb.g || data.rgb[1]}, ${data.rgb.b || data.rgb[2]})`;
    }

    // Recompute accuracy using available data
    const recentReadings = lastResults.readings.length ? lastResults.readings : (chart.data.datasets[0].data.filter(v=>v!==null));
    const s = stddev(recentReadings);
    const acc = computeAccuracy(lastResults.ambTemp || parseFloat(liveAmb.textContent) || 25, lastResults.objTemp || parseFloat(liveObj.textContent) || (lastResults.ambTemp||25), s);
    lastResults.accuracy = acc;
    liveAccuracy.textContent = acc + ' %';

    // If accuracy low, request buzzer via backend
    if (acc < 90) {
      try { await fetch('/buzzer', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({count:2})}); }
      catch(e){ console.warn('buzzer call failed', e); }
    }

  } catch (err) {
    console.error('measurement error', err);
    // show error in liveDistance
    liveDistance.textContent = 'Error';
  } finally {
    btn.style.boxShadow = '';
    btn.disabled = false;
  }
}

// ---------- Conclusion modal ----------
function openConclusionModal() {
  // Build dynamic content
  const d = lastResults.distance ?? '—';
  const color = lastResults.rgb ? `RGB(${lastResults.rgb.r||lastResults.rgb[0]}, ${lastResults.rgb.g||lastResults.rgb[1]}, ${lastResults.rgb.b||lastResults.rgb[2]})` : liveColor.textContent;
  const shape = lastResults.shape || lastResults.material || '—';
  const objT = lastResults.objTemp ?? liveObj.textContent.replace(' °C','') || '—';
  const ambT = lastResults.ambTemp ?? liveAmb.textContent.replace(' °C','') || '—';
  const readings = lastResults.readings && lastResults.readings.length ? lastResults.readings : chart.data.datasets[0].data.filter(v=>v!==null);
  const s = stddev(readings);
  const acc = lastResults.accuracy ?? computeAccuracy(ambT, objT, s);

  // Compose explanation
  const explanation = computeExplanation(parseFloat(ambT), parseFloat(objT), s, acc);

  modalBody.innerHTML = `
    <div><strong>Distance:</strong> ${d} cm</div>
    <div><strong>Color Detected:</strong> ${color}</div>
    <div><strong>Shape / Material:</strong> ${shape}</div>
    <div><strong>Object Temp:</strong> ${objT} °C</div>
    <div><strong>Ambient Temp:</strong> ${ambT} °C</div>
    <div><strong>Std Dev (σ):</strong> ${s.toFixed(2)} cm</div>
    <div style="margin-top:8px;"><strong>Computed Accuracy:</strong> ${acc} %</div>
    <hr/>
    <div style="font-size:0.95rem; margin-top:6px;">${explanation}</div>
  `;

  modalBackdrop.classList.add('show');
  modalBackdrop.setAttribute('aria-hidden','false');
}

function computeExplanation(amb, obj, sigma, acc) {
  const dt = Math.abs((obj||0) - (amb||0));
  let reason = '';
  if (dt > 3) reason += `Temperature difference is ${dt.toFixed(2)} °C — this shifts sound speed and can reduce accuracy. `;
  if (sigma > 1.5) reason += `High reading variance (σ=${sigma.toFixed(2)} cm) suggests shape irregularity or absorbing material. `;
  if (!reason) reason = 'Conditions are favorable: low temperature difference and stable readings.';
  reason += ` Overall estimated accuracy is ${acc}%.`;
  return reason;
}

// ---------- Event listeners ----------
btnDistance.addEventListener('click', ()=> runMeasurement('distance'));
btnShape.addEventListener('click', ()=> runMeasurement('shape'));
btnMaterial.addEventListener('click', ()=> runMeasurement('material'));
btnConclusion.addEventListener('click', openConclusionModal);
modalClose.addEventListener('click', ()=> { modalBackdrop.classList.remove('show'); modalBackdrop.setAttribute('aria-hidden','true'); });
modalOk.addEventListener('click', ()=> { modalBackdrop.classList.remove('show'); modalBackdrop.setAttribute('aria-hidden','true'); });

// ---------- Poll status periodically ----------
fetchStatus();
setInterval(fetchStatus, 4000);
