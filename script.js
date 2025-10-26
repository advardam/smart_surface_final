// final script.js - classic rotating arc radar + AJAX + dynamic conclusion

// ---------- Config ----------
const ACCURACY_K = 0.8;
const ACCURACY_MIN = 80.0;
const MAX_POINTS = 10;

// DOM
const dots = {
  ultra: document.getElementById('dot-ultra'),
  color: document.getElementById('dot-color'),
  temp: document.getElementById('dot-temp'),
  btn: document.getElementById('dot-btn'),
  oled: document.getElementById('dot-oled'),
  buzz: document.getElementById('dot-buzz')
};
const live = {
  distance: document.getElementById('live-distance'),
  color: document.getElementById('live-color'),
  obj: document.getElementById('live-obj'),
  amb: document.getElementById('live-amb'),
  speed: document.getElementById('live-speed'),
  accuracy: document.getElementById('live-accuracy')
};
const btnDistance = document.getElementById('btn-distance');
const btnShape = document.getElementById('btn-shape');
const btnMaterial = document.getElementById('btn-material');
const btnConclusion = document.getElementById('btn-conclusion');

const modalBackdrop = document.getElementById('modalBackdrop');
const modalClose = document.getElementById('modalClose');
const modalOk = document.getElementById('modalOk');
const modalBody = document.getElementById('modalBody');

let lastResults = { distance: null, readings: [], shape: null, material: null, rgb: null, objTemp: null, ambTemp: null, speed: null, accuracy: null };

// ---------- Chart setup ----------
const chartCtx = document.getElementById('chartCanvas').getContext('2d');
const chart = new Chart(chartCtx, {
  type: 'line',
  data: {
    labels: Array(MAX_POINTS).fill(''),
    datasets: [{ label:'Distance (cm)', data: Array(MAX_POINTS).fill(null), borderColor: '#000', backgroundColor: 'rgba(0,0,0,0.06)', tension:0.25 }]
  },
  options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ y:{ beginAtZero:true } } }
});
function pushChart(v){
  const d = chart.data.datasets[0].data;
  d.push(v);
  if(d.length>MAX_POINTS) d.shift();
  chart.update();
}

// ---------- Radar (classic rotating arc) ----------
const canvas = document.getElementById('radarCanvas');
const ctx = canvas.getContext('2d');
let DPR = window.devicePixelRatio || 1;
function resizeCanvas(){
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = Math.floor(w * DPR);
  canvas.height = Math.floor(h * DPR);
  ctx.setTransform(DPR,0,0,DPR,0,0);
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

let sweep = 0;
let sweepSpeed = 0.03;
let blips = []; // {r, angle, alpha, ttl}

function addBlip(distanceCm){
  const maxR = Math.min(canvas.clientWidth, canvas.clientHeight) / 2 - 12;
  const norm = Math.max(0, Math.min(1, distanceCm / 200));
  const r = norm * maxR;
  const angle = sweep + (Math.random()-0.5)*0.6;
  blips.push({r, angle, alpha:1.0, ttl: 70 + Math.random()*40});
}

function draw(){
  const W = canvas.clientWidth, H = canvas.clientHeight;
  const cx = W/2, cy = H/2;
  const maxR = Math.min(W,H)/2 - 12;

  ctx.clearRect(0,0,W,H);
  ctx.save();
  ctx.translate(cx, cy);

  // rings
  ctx.strokeStyle = 'rgba(80,220,120,0.12)';
  ctx.lineWidth = 1;
  for(let i=1;i<=4;i++){
    ctx.beginPath();
    ctx.arc(0,0,(i/4)*maxR,0,Math.PI*2);
    ctx.stroke();
  }

  // radial lines
  ctx.strokeStyle = 'rgba(80,220,120,0.06)';
  for(let a=0;a<360;a+=30){
    const rad = a * Math.PI/180;
    ctx.beginPath();
    ctx.moveTo(0,0);
    ctx.lineTo(Math.cos(rad)*maxR, Math.sin(rad)*maxR);
    ctx.stroke();
  }

  // blips
  for(let i=blips.length-1;i>=0;i--){
    const b = blips[i];
    const x = Math.cos(b.angle)*b.r;
    const y = Math.sin(b.angle)*b.r;
    // halo
    ctx.beginPath();
    ctx.fillStyle = `rgba(0,255,140,${0.12*b.alpha})`;
    ctx.arc(x,y,10,0,Math.PI*2); ctx.fill();
    // core
    ctx.beginPath();
    ctx.fillStyle = `rgba(0,255,140,${b.alpha})`;
    ctx.arc(x,y,4,0,Math.PI*2); ctx.fill();
    b.alpha *= 0.99; b.ttl -= 1;
    if(b.ttl<=0 || b.alpha < 0.02) blips.splice(i,1);
  }

  // sweep arm (classic arc)
  ctx.save();
  ctx.rotate(sweep);
  const grad = ctx.createRadialGradient(0,0,1,0,0,maxR);
  grad.addColorStop(0, 'rgba(80,255,140,0.16)');
  grad.addColorStop(0.6, 'rgba(80,255,140,0.06)');
  grad.addColorStop(1, 'rgba(80,255,140,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(0,0);
  ctx.arc(0,0,maxR, -0.06, 0.06);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // center hub
  ctx.beginPath(); ctx.fillStyle = '#e6ffe8'; ctx.arc(0,0,4,0,Math.PI*2); ctx.fill();

  ctx.restore();

  sweep += sweepSpeed;
  if(sweep > Math.PI*2) sweep -= Math.PI*2;
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);

// ---------- Helpers ----------
function setDot(el, state){
  if(!el) return;
  el.classList.remove('ok','fail');
  if(state === true) el.classList.add('ok'), el.style.background='limegreen';
  else if(state === false) el.classList.add('fail'), el.style.background='#ff5a5a';
  else el.style.background = 'var(--yellow)'; // neutral
}
function stddev(arr){ if(!arr || arr.length===0) return 0; const m=arr.reduce((a,b)=>a+b,0)/arr.length; return Math.sqrt(arr.reduce((s,v)=>s+(v-m)*(v-m),0)/arr.length); }
function computeAccuracy(amb, obj, sigma){ const dt = Math.abs((obj||0)-(amb||0)); let acc = 100 - (ACCURACY_K*dt + 2*sigma); if(acc < ACCURACY_MIN) acc = ACCURACY_MIN; return Math.round(acc*100)/100; }

// ---------- AJAX: status and calls ----------
async function fetchStatus(){
  try{
    const res = await fetch('/status');
    const s = await res.json();
    setDot(dots.ultra, s.ultrasonic !== false ? true : null);
    setDot(dots.color, s.color !== false ? true : null);
    setDot(dots.temp, s.temperature !== false ? true : null);
    setDot(dots.btn, s.button !== false ? true : null);
    setDot(dots.oled, s.oled !== false ? true : null);
    setDot(dots.buzz, s.buzzer !== false ? true : null);
    if(s.ambient_temp !== undefined) { live.amb.textContent = s.ambient_temp + ' °C'; lastResults.ambTemp = s.ambient_temp; }
    if(s.object_temp !== undefined) { live.obj.textContent = s.object_temp + ' °C'; lastResults.objTemp = s.object_temp; }
  }catch(e){
    // network error: set neutral yellow to show waiting
    setDot(dots.ultra, null); setDot(dots.color, null); setDot(dots.temp, null); setDot(dots.btn, null); setDot(dots.oled, null); setDot(dots.buzz, null);
    console.warn('status fetch failed', e);
  }
}

async function callMeasure(type){
  const btn = (type==='distance'?btnDistance:(type==='shape'?btnShape:btnMaterial));
  btn.disabled = true; btn.style.boxShadow = '0 0 28px rgba(255,220,50,0.9)';
  try{
    const res = await fetch(`/measure_${type}`);
    const data = await res.json();
    // handle responses
    if(type === 'distance'){
      const d = data.distance ?? data;
      lastResults.distance = d;
      if(data.speed) lastResults.speed = data.speed;
      if(data.ambient_temp) lastResults.ambTemp = data.ambient_temp;
      live.distance.textContent = (d===null?'—':d + ' cm');
      if(data.speed) live.speed.textContent = data.speed + ' m/s';
      if(data.ambient_temp) live.amb.textContent = data.ambient_temp + ' °C';
      pushChart(d); addBlip(d);
      lastResults.readings.push(d);
    } else if(type === 'shape'){
      const readings = data.readings || [];
      lastResults.readings = readings;
      lastResults.shape = data.shape || lastResults.shape;
      if(readings.length) {
        readings.forEach(v=>{ pushChart(v); addBlip(v); });
        live.distance.textContent = readings[readings.length-1] + ' cm';
      }
    } else if(type === 'material'){
      lastResults.material = data.material || lastResults.material;
      lastResults.rgb = data.rgb || lastResults.rgb;
      lastResults.objTemp = data.object_temp ?? lastResults.objTemp;
      lastResults.ambTemp = data.ambient_temp ?? lastResults.ambTemp;
      live.color.textContent = lastResults.rgb ? (`RGB(${lastResults.rgb.r}, ${lastResults.rgb.g}, ${lastResults.rgb.b})`) : live.color.textContent;
      if(lastResults.objTemp) live.obj.textContent = lastResults.objTemp + ' °C';
      if(lastResults.ambTemp) live.amb.textContent = lastResults.ambTemp + ' °C';
      addBlip(lastResults.distance || 30);
    }

    // recompute accuracy
    const s = stddev(lastResults.readings.length? lastResults.readings : chart.data.datasets[0].data.filter(v=>v!==null));
    const acc = computeAccuracy(lastResults.ambTemp || parseFloat(live.amb.textContent)||25, lastResults.objTemp || parseFloat(live.obj.textContent)|| (lastResults.ambTemp||25), s);
    lastResults.accuracy = acc;
    live.accuracy.textContent = acc + ' %';

    // if accuracy low -> call buzzer
    if(acc < 90){
      try{ await fetch('/buzzer', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({count:2})}); }catch(e){console.warn('buzzer failed',e);}
    }

  }catch(err){ console.error('measure error', err); }
  finally{ btn.disabled = false; btn.style.boxShadow = ''; }
}

// ---------- Conclusion modal ----------
function openConclusion(){
  // build dynamic modal content
  const d = lastResults.distance ?? '—';
  const color = lastResults.rgb ? `RGB(${lastResults.rgb.r},${lastResults.rgb.g},${lastResults.rgb.b})` : live.color.textContent;
  const shapeOrMaterial = lastResults.shape || lastResults.material || '—';
  const objT = (lastResults.objTemp !== null && lastResults.objTemp !== undefined) ? lastResults.objTemp : (live.obj.textContent.replace(' °C','')||'—');
  const ambT = (lastResults.ambTemp !== null && lastResults.ambTemp !== undefined) ? lastResults.ambTemp : (live.amb.textContent.replace(' °C','')||'—');
  const readings = lastResults.readings && lastResults.readings.length ? lastResults.readings : chart.data.datasets[0].data.filter(v=>v!==null);
  const s = stddev(readings);
  const acc = lastResults.accuracy ?? computeAccuracy(ambT, objT, s);

  const explanation = (() => {
    let txt = '';
    const dt = Math.abs((parseFloat(objT)||0) - (parseFloat(ambT)||0));
    if(dt > 3) txt += `Temperature difference ΔT=${dt.toFixed(2)}°C — expect reduced accuracy due to sound speed change. `;
    if(s > 1.5) txt += `High variance (σ=${s.toFixed(2)} cm) suggests shape irregularity or absorbing material. `;
    if(!txt) txt = 'Conditions favorable: low ΔT and stable readings.';
    txt += ` Estimated accuracy: ${acc}%.`;
    return txt;
  })();

  modalBody.innerHTML = `
    <div><strong>Distance:</strong> ${d} cm</div>
    <div><strong>Color:</strong> ${color}</div>
    <div><strong>Shape/Material:</strong> ${shapeOrMaterial}</div>
    <div><strong>Object Temp:</strong> ${objT} °C</div>
    <div><strong>Ambient Temp:</strong> ${ambT} °C</div>
    <div><strong>Std Dev (σ):</strong> ${s.toFixed(2)} cm</div>
    <div style="margin-top:8px;"><strong>Computed Accuracy:</strong> ${acc} %</div>
    <hr/>
    <div style="margin-top:8px;">${explanation}</div>
  `;

  modalBackdrop.classList.add('show'); modalBackdrop.setAttribute('aria-hidden','false');
}

// ---------- Events ----------
btnDistance.addEventListener('click', ()=> callMeasure('distance'));
btnShape.addEventListener('click', ()=> callMeasure('shape'));
btnMaterial.addEventListener('click', ()=> callMeasure('material'));
btnConclusion.addEventListener('click', openConclusion);
modalClose.addEventListener('click', ()=>{ modalBackdrop.classList.remove('show'); modalBackdrop.setAttribute('aria-hidden','true'); });
modalOk.addEventListener('click', ()=>{ modalBackdrop.classList.remove('show'); modalBackdrop.setAttribute('aria-hidden','true'); });

// ---------- Polling ----------
fetchStatus();
setInterval(fetchStatus, 3000);
