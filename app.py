# app.py
from flask import Flask, jsonify, render_template_string
from hw_layer import measure_distance, analyze_absorption, read_color, read_temperature, buzzer_beep, read_button
import threading

app = Flask(__name__)

# GPIO pin config
TRIG = 23
ECHO = 24
BUZZER = 18
BUTTON = 17

# ---------------- Status ----------------
status = {"ultrasonic": True, "color": True, "temperature": True,
          "button": True, "oled": True, "buzzer": True,
          "ambient_temp": None, "object_temp": None}

# ---------------- Routes ----------------
@app.route('/')
def home():
    # Simple HTML placeholder for dashboard
    html = """
    <html>
        <head>
            <title>Smart Surface Dashboard</title>
        </head>
        <body>
            <h1>Smart Surface Dashboard</h1>
            <p>Use the following endpoints:</p>
            <ul>
                <li><a href="/status">/status</a></li>
                <li><a href="/measure_distance">/measure_distance</a></li>
                <li><a href="/measure_material">/measure_material</a></li>
            </ul>
        </body>
    </html>
    """
    return render_template_string(html)

@app.route('/status')
def get_status():
    temps = read_temperature()
    status["ambient_temp"] = temps["ambient"]
    status["object_temp"] = temps["object"]
    status["button"] = read_button(BUTTON)
    return jsonify(status)

@app.route('/measure_distance')
def measure_distance_route():
    avg, sigma = measure_distance(TRIG, ECHO, samples=10)
    absorption = analyze_absorption(sigma)
    temps = read_temperature()
    return jsonify({"distance": avg, "sigma": sigma, "absorption": absorption,
                    "ambient_temp": temps["ambient"], "object_temp": temps["object"]})

@app.route('/measure_material')
def measure_material_route():
    color = read_color()
    avg, sigma = measure_distance(TRIG, ECHO, samples=10)
    absorption = analyze_absorption(sigma)
    temps = read_temperature()
    return jsonify({"rgb": color, "distance": avg, "sigma": sigma, "absorption": absorption,
                    "ambient_temp": temps["ambient"], "object_temp": temps["object"]})

@app.route('/buzzer', methods=['POST'])
def buzz_route():
    threading.Thread(target=buzzer_beep, args=(BUZZER, 0.2)).start()
    return jsonify({"status":"ok"})

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=5000, debug=True)
