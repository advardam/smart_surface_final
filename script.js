// Add a new live item for absorption in your HTML dynamically if not present
const liveAbsorptionDiv = document.createElement('div');
liveAbsorptionDiv.className = 'live-item';
liveAbsorptionDiv.innerHTML = `<div class="label">Material Absorption</div><div class="value" id="live-absorption">—</div>`;
document.querySelector('.grid-live').appendChild(liveAbsorptionDiv);
const liveAbsorption = document.getElementById('live-absorption');

// ---------- Updated callMeasure ----------
async function callMeasure(type){
  const btn = (type==='distance'?btnDistance:(type==='material'?btnMaterial:btnShape));
  btn.disabled = true; btn.style.boxShadow = '0 0 28px rgba(255,220,50,0.9)';
  try{
    const res = await fetch(`/measure_${type}`);
    const data = await res.json();

    if(type === 'distance'){
      const d = data.distance ?? data;
      lastResults.distance = d;
      lastResults.sigma = data.sigma ?? 0;
      lastResults.absorption = data.absorption ?? '—';
      lastResults.ambTemp = data.ambient_temp;
      lastResults.objTemp = data.object_temp;

      live.distance.textContent = (d===null?'—':d + ' cm');
      live.accuracy.textContent = '—';
      liveAbsorption.textContent = lastResults.absorption;
      pushChart(d); addBlip(d);

    } else if(type === 'material'){
      lastResults.rgb = data.rgb || lastResults.rgb;
      lastResults.distance = data.distance ?? lastResults.distance;
      lastResults.sigma = data.sigma ?? lastResults.sigma;
      lastResults.absorption = data.absorption ?? lastResults.absorption;
      lastResults.ambTemp = data.ambient_temp ?? lastResults.ambTemp;
      lastResults.objTemp = data.object_temp ?? lastResults.objTemp;

      live.color.textContent = lastResults.rgb ? (`RGB(${lastResults.rgb.r}, ${lastResults.rgb.g}, ${lastResults.rgb.b})`) : live.color.textContent;
      live.distance.textContent = lastResults.distance + ' cm';
      liveAbsorption.textContent = lastResults.absorption;

      pushChart(lastResults.distance || 30); 
      addBlip(lastResults.distance || 30);
    } else if(type === 'shape'){
      lastResults.shape = data.shape ?? lastResults.shape;
      live.distance.textContent = data.readings && data.readings.length ? data.readings[data.readings.length-1] + ' cm' : live.distance.textContent;
      if(data.readings) data.readings.forEach(v=>{ pushChart(v); addBlip(v); });
    }

  }catch(err){ console.error('measure error', err); }
  finally{ btn.disabled = false; btn.style.boxShadow = ''; }
}

// ---------- Updated Conclusion Modal ----------
function openConclusion(){
  const d = lastResults.distance ?? '—';
  const color = lastResults.rgb ? `RGB(${lastResults.rgb.r},${lastResults.rgb.g},${lastResults.rgb.b})` : live.color.textContent;
  const shapeOrMaterial = lastResults.shape || lastResults.material || '—';
  const absorption = lastResults.absorption || '—';
  const objT = lastResults.objTemp ?? (live.obj.textContent.replace(' °C','')||'—');
  const ambT = lastResults.ambTemp ?? (live.amb.textContent.replace(' °C','')||'—');
  const sigma = lastResults.sigma ?? 0;

  const explanation = (() => {
    let txt = `Ultrasonic absorption: ${absorption}. `;
    const dt = Math.abs((parseFloat(objT)||0) - (parseFloat(ambT)||0));
    if(dt > 3) txt += `Temperature difference ΔT=${dt.toFixed(2)}°C — expect reduced accuracy. `;
    if(sigma > 1.5) txt += `Distance variance σ=${sigma.toFixed(2)} cm suggests shape/material irregularity. `;
    if(!txt) txt += 'Conditions favorable: low ΔT and stable readings.';
    return txt;
  })();

  modalBody.innerHTML = `
    <div><strong>Distance:</strong> ${d} cm</div>
    <div><strong>Color:</strong> ${color}</div>
    <div><strong>Material Absorption:</strong> ${absorption}</div>
    <div><strong>Object Temp:</strong> ${objT} °C</div>
    <div><strong>Ambient Temp:</strong> ${ambT} °C</div>
    <div><strong>Std Dev (σ):</strong> ${sigma.toFixed(2)} cm</div>
    <hr/>
    <div style="margin-top:8px;">${explanation}</div>
  `;

  modalBackdrop.classList.add('show'); modalBackdrop.setAttribute('aria-hidden','false');
}
