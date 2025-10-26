// ---------------- Radar Animation ----------------
const canvas = document.getElementById('radarCanvas');
const ctx = canvas.getContext('2d');
let angle = 0;

function drawRadar() {
  const r = canvas.width / 2;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.translate(r, r);

  // Circular grid
  ctx.strokeStyle = '#00ffcc';
  ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i++) {
    ctx.beginPath();
    ctx.arc(0, 0, (r / 3) * i, 0, 2 * Math.PI);
    ctx.stroke();
  }

  // Sweep arm
  const gradient = ctx.createLinearGradient(0, 0, r * Math.cos(angle), r * Math.sin(angle));
  gradient.addColorStop(0, 'rgba(0,255,200,0.8)');
  gradient.addColorStop(1, 'rgba(0,255,200,0)');
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(r * Math.cos(angle), r * Math.sin(angle));
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Blips
  for (let i = 0; i < 4; i++) {
    const blipAngle = (angle + (i * Math.PI / 2)) % (2 * Math.PI);
    const x = (r / 3) * (i + 1) * Math.cos(blipAngle);
    const y = (r / 3) * (i + 1) * Math.sin(blipAngle);
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, 2 * Math.PI);
    ctx.fillStyle = '#00ff99';
    ctx.fill();
  }

  ctx.translate(-r, -r);
  angle += 0.03;
  requestAnimationFrame(drawRadar);
}
drawRadar();

// ---------------- AJAX Functions ----------------
function updateStatus() {
  fetch('/status')
    .then(res => res.json())
    .then(data => {
      document.getElementById('ultra-dot').style.background = data.ultrasonic ? 'lime' : 'red';
      document.getElementById('color-dot').style.background = data.color ? 'lime' : 'red';
      document.getElementById('temp-dot').style.background = data.temperature ? 'lime' : 'red';
    });
}

function sendAction(endpoint, msgPrefix) {
  const btn = document.getElementById(`btn-${endpoint.replace('measure_', '')}`);
  btn.classList.add('active');
  btn.style.boxShadow = '0 0 20px #00ffaa';

  fetch(`/${endpoint}`)
    .then(res => res.json())
    .then(data => {
      document.getElementById('output-box').innerText = `${msgPrefix}: ${JSON.stringify(data)}`;
      btn.classList.remove('active');
      btn.style.boxShadow = '';
    })
    .catch(err => {
      document.getElementById('output-box').innerText = '⚠️ Error: ' + err;
      btn.classList.remove('active');
    });
}

document.getElementById('btn-distance').onclick = () => sendAction('measure_distance', 'Distance Reading');
document.getElementById('btn-shape').onclick = () => sendAction('measure_shape', 'Detected Shape');
document.getElementById('btn-material').onclick = () => sendAction('measure_material', 'Detected Material');
document.getElementById('btn-beep').onclick = () => fetch('/beep');

updateStatus();
setInterval(updateStatus, 3000);
