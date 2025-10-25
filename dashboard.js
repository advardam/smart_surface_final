let chart = null;

function updateStatus() {
    fetch('/status').then(res => res.json()).then(data => {
        for(let sensor in data){
            let dot = document.querySelector(`#${sensor} .dot`);
            dot.style.backgroundColor = data[sensor];
        }
    });
}

function runTest(testType){
    let endpoint = '';
    if(testType === 'distance') endpoint = '/measure_distance';
    if(testType === 'shape') endpoint = '/measure_shape';
    if(testType === 'material') endpoint = '/measure_material';

    fetch(endpoint).then(res => res.json()).then(data => {
        document.getElementById('distance-data').innerHTML = data.distance ? `Distance: ${data.distance} cm` : '';
        document.getElementById('temp-data').innerHTML = `Temp: Obj ${data.temp_obj}°C | Amb ${data.temp_amb}°C`;
        document.getElementById('rgb-data').innerHTML = `Color RGB: ${data.rgb}`;
        document.getElementById('speed-data').innerHTML = data.speed ? `Speed of Sound: ${data.speed} m/s` : '';
        document.getElementById('conclusion').innerHTML = `Conclusion: ${data.conclusion}`;

        if(chart) chart.destroy();
        let ctx = document.getElementById('chartCanvas').getContext('2d');
        chart = new Chart(ctx, {
            type: testType === 'distance' ? 'polarArea' : 'line',
            data: {
                labels: data.readings.map((_, i)=>i+1),
                datasets: [{
                    label: testType === 'material' ? 'Material Test' : 'Shape Test',
                    data: data.readings,
                    borderColor: 'black',
                    backgroundColor: 'rgba(0,0,0,0.1)',
                    fill: testType==='material'
                }]
            },
            options: { responsive:true, plugins:{legend:{display:false}}, scales:{ y:{ beginAtZero:true } } }
        });
    });
}

setInterval(updateStatus, 3000);
updateStatus();
