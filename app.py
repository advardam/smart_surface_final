from flask import Flask, render_template, jsonify
import lgpio, time, statistics, random
import adafruit_mlx90614, adafruit_tcs34725, busio, board
from threading import Lock

app = Flask(__name__)
lock = Lock()

# ------------------- GPIO -------------------
CHIP = 0
TRIG = 23
ECHO = 24
BUZZER = 18
BUTTON = 17

h = lgpio.gpiochip_open(CHIP)
lgpio.gpio_claim_output(h, TRIG)
lgpio.gpio_claim_input(h, ECHO)
lgpio.gpio_claim_output(h, BUZZER)
lgpio.gpio_claim_input(h, BUTTON)

def buzzer_beep(n=1):
    for _ in range(n):
        lgpio.gpio_write(h, BUZZER, 1)
        time.sleep(0.2)
        lgpio.gpio_write(h, BUZZER, 0)
        time.sleep(0.2)

def wait_for_button():
    while lgpio.gpio_read(h, BUTTON) == 0:
        time.sleep(0.05)

def ultrasonic_distance():
    lgpio.gpio_write(h, TRIG, 0)
    time.sleep(0.05)
    lgpio.gpio_write(h, TRIG, 1)
    time.sleep(0.00001)
    lgpio.gpio_write(h, TRIG, 0)

    pulse_start = pulse_end = time.time()
    timeout = time.time() + 0.04
    while lgpio.gpio_read(h, ECHO) == 0 and time.time() < timeout:
        pulse_start = time.time()
    while lgpio.gpio_read(h, ECHO) == 1 and time.time() < timeout:
        pulse_end = time.time()

    duration = pulse_end - pulse_start
    amb_temp = mlx.ambient_temperature
    speed = 331 + (0.6 * amb_temp)
    distance = (duration * speed / 2) * 100
    return distance, speed, amb_temp

# ------------------- Sensors -------------------
i2c = busio.I2C(board.SCL, board.SDA)
mlx = adafruit_mlx90614.MLX90614(i2c)
color_sensor = adafruit_tcs34725.TCS34725(i2c)

# ------------------- Routes -------------------
@app.route("/")
def index():
    return render_template("index.html")

@app.route("/status")
def status():
    sensors = {
        "Ultrasonic": "green",
        "MLX90614": "green" if mlx.object_temperature else "red",
        "TCS34725": "green" if color_sensor.color_rgb_bytes else "red",
        "Button": "green",
        "Buzzer": "green"
    }
    return jsonify(sensors)

@app.route("/measure_distance")
def measure_distance_route():
    with lock:
        wait_for_button()
        buzzer_beep(1)
        readings = [ultrasonic_distance()[0] for _ in range(5)]
        avg = sum(readings)/len(readings)
        dist, speed, amb_temp = ultrasonic_distance()
        obj_temp = mlx.object_temperature
        r,g,b = color_sensor.color_rgb_bytes
        temp_diff = abs(obj_temp - amb_temp)
        conclusion = f"Distance measurement affected by temp difference: {temp_diff:.1f}°C"
        buzzer_beep(2)
        return jsonify({
            "distance": round(avg,2),
            "temp_obj": round(obj_temp,1),
            "temp_amb": round(amb_temp,1),
            "speed": round(speed,1),
            "rgb": (r,g,b),
            "conclusion": conclusion,
            "readings": readings
        })

@app.route("/measure_shape")
def measure_shape_route():
    with lock:
        wait_for_button()
        buzzer_beep(1)
        readings = [ultrasonic_distance()[0] for _ in range(15)]
        mean_val = statistics.mean(readings)
        std_dev = statistics.stdev(readings)
        shape = "Flat" if std_dev < 0.5 else "Curved" if std_dev < 2 else "Irregular"
        obj_temp = mlx.object_temperature
        amb_temp = mlx.ambient_temperature
        r,g,b = color_sensor.color_rgb_bytes
        conclusion = f"Shape {shape} affects ultrasonic accuracy."
        buzzer_beep(2)
        return jsonify({
            "shape": shape,
            "std_dev": round(std_dev,2),
            "temp_obj": round(obj_temp,1),
            "temp_amb": round(amb_temp,1),
            "rgb": (r,g,b),
            "conclusion": conclusion,
            "readings": readings
        })

@app.route("/measure_material")
def measure_material_route():
    with lock:
        wait_for_button()
        buzzer_beep(1)
        readings = [ultrasonic_distance()[0] for _ in range(15)]
        std_dev = statistics.stdev(readings)
        material = "Reflective" if std_dev < 2 else "Absorbing"
        obj_temp = mlx.object_temperature
        amb_temp = mlx.ambient_temperature
        r,g,b = color_sensor.color_rgb_bytes
        conclusion = f"Material type {material} affects ultrasonic reflection."
        buzzer_beep(2)
        return jsonify({
            "material": material,
            "std_dev": round(std_dev,2),
            "temp_obj": round(obj_temp,1),
            "temp_amb": round(amb_temp,1),
            "rgb": (r,g,b),
            "conclusion": conclusion,
            "readings": readings
        })

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
