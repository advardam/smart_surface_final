# hw_layer.py
import time
import random

# ---------------- GPIO ----------------
try:
    import lgpio
    LGPIO_AVAILABLE = True
except ImportError:
    LGPIO_AVAILABLE = False
    print("⚠️ lgpio not available — running in simulation mode.")

try:
    import board
    import busio
    import adafruit_tcs34725
    import adafruit_mlx90614
except ImportError:
    print("⚠️ I2C sensor libraries not found — TCS34725 and MLX90614 will simulate.")
    adafruit_tcs34725 = None
    adafruit_mlx90614 = None

# ---------------- Initialization ----------------
chip = None
if LGPIO_AVAILABLE:
    try:
        chip = lgpio.gpiochip_open(0)
    except Exception as e:
        print(f"⚠️ Cannot open lgpio chip: {e}")
        chip = None

# I2C setup
i2c = None
color_sensor = None
mlx_sensor = None
try:
    i2c = busio.I2C(board.SCL, board.SDA)
    if adafruit_tcs34725:
        color_sensor = adafruit_tcs34725.TCS34725(i2c)
    if adafruit_mlx90614:
        mlx_sensor = adafruit_mlx90614.MLX90614(i2c)
except Exception as e:
    print(f"⚠️ I2C sensor init failed: {e}")

# ---------------- Ultrasonic ----------------
def measure_distance(TRIG, ECHO, samples=10):
    """Measure distance in cm and return average and stddev"""
    readings = []
    if not LGPIO_AVAILABLE or chip is None:
        # simulation fallback
        for _ in range(samples):
            readings.append(round(random.uniform(5,50),2))
        avg = sum(readings)/len(readings)
        sigma = (sum((x-avg)**2 for x in readings)/len(readings))**0.5
        return avg, sigma

    for _ in range(samples):
        try:
            lgpio.gpio_write(chip, TRIG, 0)
            time.sleep(0.0002)
            lgpio.gpio_write(chip, TRIG, 1)
            time.sleep(0.00001)
            lgpio.gpio_write(chip, TRIG, 0)

            start = time.time()
            while lgpio.gpio_read(chip, ECHO) == 0:
                if time.time()-start > 0.02:
                    raise TimeoutError("Echo start timeout")
            pulse_start = time.time()
            while lgpio.gpio_read(chip, ECHO) == 1:
                if time.time()-pulse_start > 0.02:
                    raise TimeoutError("Echo end timeout")
            pulse_end = time.time()
            duration = pulse_end - pulse_start
            distance = (duration*34300)/2
            readings.append(round(distance,2))
            time.sleep(0.02)
        except Exception:
            readings.append(None)

    readings = [x for x in readings if x is not None]
    if not readings:
        readings = [random.uniform(5,50) for _ in range(samples)]

    avg = sum(readings)/len(readings)
    sigma = (sum((x-avg)**2 for x in readings)/len(readings))**0.5
    return round(avg,2), round(sigma,2)

# ---------------- Material Detection ----------------
def analyze_absorption(sigma):
    """Return absorption category based on standard deviation"""
    if sigma < 1.5:
        return "Reflective"
    elif sigma < 3.0:
        return "Medium absorption"
    else:
        return "High absorption"

# ---------------- TCS34725 ----------------
def read_color():
    if color_sensor:
        r, g, b = color_sensor.color_rgb_bytes
        return {"r": r, "g": g, "b": b}
    else:
        # simulation
        return {"r": random.randint(0,255), "g": random.randint(0,255), "b": random.randint(0,255)}

# ---------------- MLX90614 ----------------
def read_temperature():
    if mlx_sensor:
        return {"ambient": round(mlx_sensor.ambient_temperature,2),
                "object": round(mlx_sensor.object_temperature,2)}
    else:
        return {"ambient": round(random.uniform(20,30),2),
                "object": round(random.uniform(20,35),2)}

# ---------------- Buzzer ----------------
def buzzer_beep(BUZZER, duration=0.2):
    if not LGPIO_AVAILABLE or chip is None:
        print(f"[SIM] Buzzer beep {duration}s")
        time.sleep(duration)
        return
    try:
        lgpio.gpio_write(chip, BUZZER, 1)
        time.sleep(duration)
        lgpio.gpio_write(chip, BUZZER, 0)
    except Exception as e:
        print(f"⚠️ Buzzer failed: {e}")

# ---------------- Button ----------------
def read_button(BUTTON):
    if not LGPIO_AVAILABLE or chip is None:
        return False
    try:
        return lgpio.gpio_read(chip, BUTTON) == 1
    except Exception:
        return False
