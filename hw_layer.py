# hw_layer.py
import time
import random

# ------------------ GPIO Handling ------------------
try:
    import lgpio
    LGPIO_AVAILABLE = True
except ImportError:
    LGPIO_AVAILABLE = False
    print("⚠️ lgpio not available — running in simulation mode.")

# ------------------ Measure Distance (Ultrasonic) ------------------
def measure_distance(chip, TRIG, ECHO, retries=3):
    """
    Measures distance using ultrasonic sensor.
    Handles GPIO busy errors, invalid readings, and simulation fallback.
    """
    if not LGPIO_AVAILABLE or chip is None:
        # Simulated mode for testing
        simulated = round(random.uniform(5, 50), 2)
        print(f"[SIM] Distance: {simulated} cm")
        return simulated

    for attempt in range(retries):
        try:
            # Ensure trigger is low
            lgpio.gpio_write(chip, TRIG, 0)
            time.sleep(0.0002)

            # Send 10µs pulse
            lgpio.gpio_write(chip, TRIG, 1)
            time.sleep(0.00001)
            lgpio.gpio_write(chip, TRIG, 0)

            # Wait for echo start
            start_time = time.time()
            while lgpio.gpio_read(chip, ECHO) == 0:
                if time.time() - start_time > 0.02:
                    raise TimeoutError("Echo start timeout")
            pulse_start = time.time()

            # Wait for echo end
            while lgpio.gpio_read(chip, ECHO) == 1:
                if time.time() - pulse_start > 0.02:
                    raise TimeoutError("Echo end timeout")
            pulse_end = time.time()

            # Calculate distance (speed of sound = 34300 cm/s)
            duration = pulse_end - pulse_start
            distance = (duration * 34300) / 2
            print(f"[HW] Distance: {distance:.2f} cm")
            return round(distance, 2)

        except lgpio.error as e:
            print(f"⚠️ GPIO error (attempt {attempt + 1}): {e}")
            time.sleep(0.1)

        except TimeoutError as e:
            print(f"⚠️ Ultrasonic timeout: {e}")
            time.sleep(0.1)

        except Exception as e:
            print(f"⚠️ Unexpected ultrasonic error: {e}")
            time.sleep(0.1)

    # If all retries fail
    print("⚠️ Ultrasonic read failed — returning simulated fallback.")
    return round(random.uniform(5, 50), 2)

# ------------------ Measure Shape (Simulated for Now) ------------------
def measure_shape():
    """Placeholder: Simulated shape detection."""
    shapes = ["Cube", "Cylinder", "Sphere", "Cone"]
    shape = random.choice(shapes)
    print(f"[SIM] Detected Shape: {shape}")
    return shape

# ------------------ Measure Material (Simulated for Now) ------------------
def measure_material():
    """Placeholder: Simulated material detection."""
    materials = ["Metal", "Plastic", "Wood", "Glass"]
    material = random.choice(materials)
    print(f"[SIM] Detected Material: {material}")
    return material

# ------------------ Buzzer Beep ------------------
def buzzer_beep(chip, BUZZER, duration=0.2):
    """Triggers hardware buzzer with fallback to simulated beep."""
    if not LGPIO_AVAILABLE or chip is None:
        print(f"[SIM] Buzzer beep (duration={duration}s)")
        time.sleep(duration)
        return

    try:
        lgpio.gpio_write(chip, BUZZER, 1)
        time.sleep(duration)
        lgpio.gpio_write(chip, BUZZER, 0)
        print("[HW] Buzzer beeped successfully.")
    except lgpio.error as e:
        print(f"⚠️ Buzzer GPIO error: {e}")
    except Exception as e:
        print(f"⚠️ Buzzer failed: {e}")
