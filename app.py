# app.py
import os
import time
from flask import Flask, jsonify, render_template, request
from threading import Lock

# ------------------ GPIO Handling (Raspberry Pi 5 Safe) ------------------
try:
    import lgpio
    LGPIO_AVAILABLE = True
except ImportError:
    LGPIO_AVAILABLE = False
    print("⚠️ lgpio not found — running in simulation mode.")

# ------------------ OLED Display ------------------
try:
    from luma.core.interface.serial import i2c
    from luma.oled.device import sh1106
    from PIL import Image, ImageDraw, ImageFont
    OLED_AVAILABLE = True
except ImportError:
    OLED_AVAILABLE = False
    print("⚠️ OLED libraries not found — OLED will be disabled.")

# ------------------ Custom Hardware Layer ------------------
from hw_layer import measure_distance, measure_shape, measure_material, buzzer_beep

# ------------------ Flask Setup ------------------
app = Flask(__name__)
gpio_lock = Lock()

# ------------------ GPIO Pin Definitions ------------------
TRIG = 23
ECHO = 24
BUZZER = 18
BUTTON = 17

chip = None
if LGPIO_AVAILABLE:
    try:
        chip = lgpio.gpiochip_open(0)
        lgpio.gpio_claim_output(chip, TRIG)
        lgpio.gpio_claim_input(chip, ECHO)
        lgpio.gpio_claim_output(chip, BUZZER)
        lgpio.gpio_claim_input(chip, BUTTON)
    except lgpio.error as e:
        print(f"⚠️ GPIO initialization error: {e}")
        chip = None

# ------------------ OLED Initialization ------------------
oled_device = None
if OLED_AVAILABLE:
    try:
        serial = i2c(port=1, address=0x3C)
        oled_device = sh1106(serial)
        print("✅ OLED initialized successfully.")
    except Exception as e:
        print(f"⚠️ OLED init failed: {e}")
        oled_device = None

# ------------------ Helper Function ------------------
def display_oled(message):
    """Display message on OLED safely."""
    if oled_device:
        try:
            with Image.new("1", oled_device.size) as image:
                draw = ImageDraw.Draw(image)
                font = ImageFont.load_default()
                draw.text((5, 20), message, font=font, fill=255)
                oled_device.display(image)
        except Exception as e:
            print(f"⚠️ OLED update failed: {e}")

# ------------------ Flask Routes ------------------
@app.route("/")
def index():
    return render_template("index.html")

@app.route("/status")
def status():
    return jsonify({"status": "OK", "gpio": LGPIO_AVAILABLE})

@app.route("/measure_distance")
def measure_distance_route():
    try:
        with gpio_lock:
            dist = measure_distance(chip, TRIG, ECHO)
        display_oled(f"Distance: {dist:.1f} cm")
        return jsonify({"distance": dist})
    except Exception as e:
        print(f"⚠️ Distance measurement failed: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/measure_shape")
def measure_shape_route():
    try:
        shape = measure_shape()
        display_oled(f"Shape: {shape}")
        return jsonify({"shape": shape})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/measure_material")
def measure_material_route():
    try:
        material = measure_material()
        display_oled(f"Material: {material}")
        return jsonify({"material": material})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/buzzer", methods=["POST"])
def buzzer_route():
    try:
        with gpio_lock:
            buzzer_beep(chip, BUZZER)
        return jsonify({"buzzer": "ok"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ------------------ Graceful Exit ------------------
@app.teardown_appcontext
def cleanup(exception):
    if chip:
        try:
            lgpio.gpiochip_close(chip)
        except Exception:
            pass

# ------------------ Run App ------------------
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
