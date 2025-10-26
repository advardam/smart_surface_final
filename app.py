#!/usr/bin/env python3
# app.py
import time
import json
from threading import Lock
from flask import Flask, jsonify, render_template, request

# Try to import lgpio; if not available, run in simulation mode
try:
    import lgpio
    LGPIO_AVAILABLE = True
except Exception:
    LGPIO_AVAILABLE = False

# Import hardware layer (safe wrappers & simulation)
# hw_layer.py should export:
#   measure_distance(chip, TRIG, ECHO)
#   measure_shape()
#   measure_material()
#   buzzer_beep(chip, BUZZER, duration=0.2)
#   (optionally) get_temps(), get_color_rgb(), oled_display()
import hw_layer

# Flask app
app = Flask(__name__, static_folder="static", template_folder="templates")
hw_lock = Lock()

# GPIO pin definitions (BCM)
TRIG = 23
ECHO = 24
BUZZER = 18
BUTTON = 17

# try to open gpiochip handle (safe)
chip = None
if LGPIO_AVAILABLE:
    def open_chip(retries=3, delay=0.2):
        last_exc = None
        for i in range(retries):
            try:
                h = lgpio.gpiochip_open(0)
                return h
            except Exception as e:
                last_exc = e
                time.sleep(delay)
        raise last_exc

    try:
        chip = open_chip()
        # attempt to claim pins but don't crash if busy
        try:
            lgpio.gpio_claim_output(chip, TRIG)
        except Exception:
            app.logger.warning(f"Could not claim TRIG {TRIG}; continuing (GPIO busy or restricted).")
        try:
            lgpio.gpio_claim_input(chip, ECHO)
        except Exception:
            app.logger.warning(f"Could not claim ECHO {ECHO}; continuing (GPIO busy or restricted).")
        try:
            lgpio.gpio_claim_output(chip, BUZZER)
        except Exception:
            app.logger.warning(f"Could not claim BUZZER {BUZZER}; continuing (GPIO busy or restricted).")
        try:
            lgpio.gpio_claim_input(chip, BUTTON)
        except Exception:
            app.logger.warning(f"Could not claim BUTTON {BUTTON}; continuing (GPIO busy or restricted).")
        app.logger.info("GPIO chip opened (or partially claimed).")
    except Exception as e:
        app.logger.warning(f"GPIO chip open failed: {e}. Running in simulation mode.")
        chip = None
else:
    app.logger.info("lgpio not available - running in simulation mode.")

# Keep last results in memory for modal and dashboard
lastResults = {
    "distance": None,
    "readings": [],      # last readings for shape/material
    "shape": None,
    "material": None,
    "rgb": None,
    "objTemp": None,
    "ambTemp": None,
    "speed": None,
    "accuracy": None
}

# helper: compute std dev
def stddev(arr):
    if not arr:
        return 0.0
    mean = sum(arr) / len(arr)
    var = sum((x - mean) ** 2 for x in arr) / len(arr)
    return var ** 0.5

# accuracy formula (same as frontend)
ACCURACY_K = 0.8
ACCURACY_MIN = 80.0
def compute_accuracy(amb, obj, sigma):
    try:
        deltaT = abs((obj or 0) - (amb or 0))
        acc = 100.0 - (ACCURACY_K * deltaT + 2.0 * (sigma or 0.0))
        if acc < ACCURACY_MIN:
            acc = ACCURACY_MIN
        return round(acc, 2)
    except Exception:
        return ACCURACY_MIN

# optional: helper wrappers if hw_layer exposes oled_display, get_temps, get_color_rgb
oled_display = getattr(hw_layer, "oled_display", None)
get_temps = getattr(hw_layer, "get_temps", None)
get_color_rgb = getattr(hw_layer, "get_color_rgb", None)

# ---------- Routes ----------
@app.route("/")
def index():
    return render_template("index.html")

@app.route("/status")
def status():
    """
    Return sensor availability and optionally some small live values.
    The frontend expects boolean-like fields for dots and optionally temperatures.
    """
    # try getting small live info from hardware layer if present
    try:
        amb = None
        obj = None
        if get_temps:
            try:
                obj, amb = get_temps()
            except Exception:
                # try alternative order if hw_layer used different ordering
                try:
                    amb, obj = get_temps()
                except Exception:
                    amb = obj = None
        # basic available flags: check if functions in hw_layer are not pure simulation
        resp = {
            "ultrasonic": True,   # we assume ultrasonic capability; fallback simulated if chip missing
            "color": (get_color_rgb is not None),
            "temperature": (get_temps is not None),
            "button": True,
            "oled": oled_display is not None,
            "buzzer": True
        }
        if amb is not None:
            resp["ambient_temp"] = amb
        if obj is not None:
            resp["object_temp"] = obj
        return jsonify(resp)
    except Exception as e:
        app.logger.warning("Status error: %s", e)
        return jsonify({
            "ultrasonic": False,
            "color": False,
            "temperature": False,
            "button": False,
            "oled": False,
            "buzzer": False
        })

@app.route("/measure_distance")
def measure_distance_route():
    """
    Wait for button press (non-blocking), then take a single ultrasonic reading.
    For exhibition/demo we do not block indefinitely. We will perform measurement immediately.
    """
    with hw_lock:
        try:
            # If hw_layer's ultrasonic function expects (chip, TRIG, ECHO) we call accordingly.
            d = hw_layer.measure_distance(chip, TRIG, ECHO)
            # If hw_layer returns tuple (d, speed, amb) adapt to that
            speed = None
            amb = None
            if isinstance(d, tuple) or isinstance(d, list):
                # expected (distance, speed, ambient)
                try:
                    distance_val, speed, amb = d
                    distance = float(distance_val) if distance_val is not None else None
                except Exception:
                    # fallback: first value only
                    distance = float(d[0]) if d else None
            else:
                distance = float(d) if d is not None else None

            # store
            lastResults["distance"] = distance
            if speed is not None:
                lastResults["speed"] = speed
            if amb is not None:
                lastResults["ambTemp"] = amb

            # Mirror to OLED
            try:
                if oled_display:
                    oled_display(f"Distance: {distance} cm", f"Temp: {lastResults.get('ambTemp', '')} C")
            except Exception:
                pass

            return jsonify({
                "distance": distance,
                "speed": lastResults.get("speed"),
                "ambient_temp": lastResults.get("ambTemp")
            })
        except Exception as e:
            app.logger.exception("measure_distance failed")
            return jsonify({"error": str(e)}), 500

@app.route("/measure_shape")
def measure_shape_route():
    """
    Acquire multiple ultrasonic readings for shape detection (15 readings).
    Returns readings[], std_dev, mean, shape.
    """
    with hw_lock:
        try:
            readings = []
            # prefer using hw_layer.measure_shape if it returns readings; otherwise gather ultrasonic samples
            # If hw_layer.measure_shape() returns simulated shape only, we still collect ultrasonic samples separately.
            # We'll collect up to 15 ultrasonic samples (fast)
            for i in range(15):
                try:
                    single = hw_layer.measure_distance(chip, TRIG, ECHO)
                    if isinstance(single, (list, tuple)):
                        val = single[0]
                        # also pick up ambient or speed if present
                        if len(single) >= 3:
                            lastResults["speed"] = single[1]
                            lastResults["ambTemp"] = single[2]
                    else:
                        val = single
                except Exception:
                    val = None
                if val is None:
                    readings.append(None)
                else:
                    try:
                        readings.append(float(val))
                    except Exception:
                        readings.append(None)
                # tiny pause so sensor and CPU breathe
                time.sleep(0.08)

            numeric_readings = [r for r in readings if isinstance(r, (int, float))]
            mean_val = round(sum(numeric_readings)/len(numeric_readings), 2) if numeric_readings else None
            std_dev = round(stddev(numeric_readings), 2) if len(numeric_readings) >= 2 else 0.0

            # try to get shape from hw_layer (simulated)
            try:
                shape = hw_layer.measure_shape()
            except Exception:
                shape = "Unknown"

            lastResults["readings"] = numeric_readings
            lastResults["shape"] = shape
            lastResults["distance"] = mean_val
            # compute accuracy
            acc = compute_accuracy(lastResults.get("ambTemp"), lastResults.get("objTemp"), std_dev)
            lastResults["accuracy"] = acc

            # OLED mirror
            try:
                if oled_display:
                    oled_display(f"Shape: {shape}", f"σ={std_dev} cm")
            except Exception:
                pass

            return jsonify({
                "shape": shape,
                "readings": numeric_readings,
                "std_dev": std_dev,
                "mean": mean_val
            })
        except Exception as e:
            app.logger.exception("measure_shape failed")
            return jsonify({"error": str(e)}), 500

@app.route("/measure_material")
def measure_material_route():
    """
    Call hw_layer.measure_material(); return material, rgb (if available), temps.
    """
    with hw_lock:
        try:
            try:
                material = hw_layer.measure_material()
            except Exception:
                material = "Unknown"

            # try to pick up rgb & temps if hw_layer exposes such helpers
            rgb = None
            if get_color_rgb:
                try:
                    rgb = get_color_rgb()
                except Exception:
                    rgb = None

            if get_temps:
                try:
                    obj, amb = get_temps()
                    lastResults["objTemp"] = obj
                    lastResults["ambTemp"] = amb
                except Exception:
                    pass

            lastResults["material"] = material
            lastResults["rgb"] = {"r": rgb[0], "g": rgb[1], "b": rgb[2]} if rgb else None

            # OLED mirror
            try:
                if oled_display:
                    oled_display(f"Mat: {material}", f"Tobj:{lastResults.get('objTemp','')}C")
            except Exception:
                pass

            return jsonify({
                "material": material,
                "rgb": lastResults.get("rgb"),
                "object_temp": lastResults.get("objTemp"),
                "ambient_temp": lastResults.get("ambTemp")
            })
        except Exception as e:
            app.logger.exception("measure_material failed")
            return jsonify({"error": str(e)}), 500

@app.route("/buzzer", methods=["POST"])
def buzzer_route():
    """
    Trigger buzzer. Expects JSON like {"count": 2} or use default 1.
    """
    with hw_lock:
        try:
            data = request.get_json(force=True, silent=True) or {}
            count = int(data.get("count", 1))
        except Exception:
            count = 1

        try:
            # call buzzer beep count times
            for _ in range(count):
                try:
                    hw_layer.buzzer_beep(chip, BUZZER, duration=0.18)
                except TypeError:
                    # some hw_layer variants use buzzer_beep(chip, BUZZER)
                    try:
                        hw_layer.buzzer_beep(chip, BUZZER)
                    except Exception:
                        pass
                time.sleep(0.12)
            return jsonify({"ok": True, "beeps": count})
        except Exception as e:
            app.logger.exception("buzzer failed")
            return jsonify({"error": str(e)}), 500

@app.route("/latest_results")
def latest_results():
    """
    Return the lastResults snapshot for frontend (modal / dashboard).
    """
    return jsonify(lastResults)

# cleanup on exit
@app.teardown_appcontext
def close_chip(exc):
    global chip
    if LGPIO_AVAILABLE and chip is not None:
        try:
            lgpio.gpiochip_close(chip)
        except Exception:
            pass

if __name__ == "__main__":
    # helpful startup message
    print("Starting Smart Surface Flask server...")
    if LGPIO_AVAILABLE:
        print("lgpio available: running with hardware support (if pins claimed).")
    else:
        print("lgpio not available: running in simulation-only mode.")
    app.run(host="0.0.0.0", port=5000, debug=True, threaded=True)
