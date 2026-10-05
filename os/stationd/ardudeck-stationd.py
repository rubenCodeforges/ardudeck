#!/usr/bin/env python3
"""ArduDeck station daemon.

Collects ground-station hardware state (GNSS, LTE, Wi-Fi, batteries, compass,
ambient light) and serves it as JSON on http://127.0.0.1:47800/state for
desktop widgets and other local consumers. Vehicle state lives in os-linkd.
Stdlib + PyGObject only, so it runs on a stock Fedora install.
"""
import json
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import gi

gi.require_version("Gio", "2.0")
from gi.repository import Gio, GLib  # noqa: E402

HTTP_PORT = int(os.environ.get("ARDUDECK_STATIOND_PORT", "47800"))
GNSS_DEV = os.environ.get("ARDUDECK_GNSS_DEV", "/dev/ttyACM0")
IIO = "/sys/bus/iio/devices"

state_lock = threading.Lock()
state = {
    "station": {
        "gnss": {"available": False, "error": None},
        "lte": {"available": False},
        "wifi": {"available": False},
        "batteries": [],
        "ac_online": None,
        "heading_deg": None,
        "illuminance_lux": None,
    },
    "updated": None,
}


def update(path, value):
    with state_lock:
        node = state
        for key in path[:-1]:
            node = node[key]
        node[path[-1]] = value


# ---------------------------------------------------------------- GNSS (NMEA)

def nmea_coord(value, hemi):
    if not value:
        return None
    dot = value.index(".")
    deg = float(value[: dot - 2])
    minutes = float(value[dot - 2:])
    coord = deg + minutes / 60
    return -coord if hemi in ("S", "W") else coord


def gnss_thread():
    gsv = {}
    while True:
        try:
            with open(GNSS_DEV, "rb", buffering=0) as port:
                update(("station", "gnss", "available"), True)
                update(("station", "gnss", "error"), None)
                buf = b""
                while True:
                    chunk = port.read(512)
                    if not chunk:
                        time.sleep(0.1)
                        continue
                    buf += chunk
                    while b"\n" in buf:
                        line, buf = buf.split(b"\n", 1)
                        handle_nmea(line.decode("ascii", "ignore").strip(), gsv)
        except PermissionError:
            update(("station", "gnss", "available"), False)
            update(("station", "gnss", "error"), "no permission (user not in dialout group)")
        except OSError as exc:
            update(("station", "gnss", "available"), False)
            update(("station", "gnss", "error"), str(exc))
        time.sleep(5)


def handle_nmea(line, gsv):
    if not line.startswith("$") or "*" not in line:
        return
    body = line[1:line.index("*")]
    f = body.split(",")
    kind = f[0][2:]
    with state_lock:
        g = state["station"]["gnss"]
        if kind == "GGA" and len(f) > 9:
            g["fix_quality"] = int(f[6] or 0)
            g["sats_used"] = int(f[7] or 0)
            g["hdop"] = float(f[8]) if f[8] else None
            g["alt_m"] = float(f[9]) if f[9] else None
            g["lat"] = nmea_coord(f[2], f[3])
            g["lon"] = nmea_coord(f[4], f[5])
        elif kind == "RMC" and len(f) > 8:
            g["valid"] = f[2] == "A"
            g["speed_mps"] = float(f[7]) * 0.514444 if f[7] else None
            g["utc"] = f[1]
        elif kind == "GSV" and len(f) > 3:
            gsv[f[0][:2]] = int(f[3] or 0)
            g["sats_in_view"] = sum(gsv.values())


# ------------------------------------------------------------- sensors (IIO)

def iio_find(name):
    try:
        for dev in os.listdir(IIO):
            try:
                with open(f"{IIO}/{dev}/name") as fh:
                    if fh.read().strip() == name:
                        return f"{IIO}/{dev}"
            except OSError:
                pass
    except OSError:
        pass
    return None


def read_num(path):
    try:
        with open(path) as fh:
            return float(fh.read().split()[0])
    except (OSError, ValueError, IndexError):
        return None


def sensors_poll():
    als = iio_find("als")
    magn = iio_find("magn_3d")
    if als:
        raw = read_num(f"{als}/in_illuminance_raw")
        if raw is not None:
            # HID ALS reports in centi-lux on this platform
            update(("station", "illuminance_lux"), round(raw / 100, 1))
    if magn:
        raw = read_num(f"{magn}/in_rot_from_north_magnetic_tilt_comp_raw")
        if raw is not None:
            # HID sensor hub reports heading with a 1e-5 unit exponent
            update(("station", "heading_deg"), round((raw / 1e5) % 360, 1))


# ----------------------------------------------------------- D-Bus services

bus = Gio.bus_get_sync(Gio.BusType.SYSTEM)


def dbus_get_all(name, path, iface):
    try:
        res = bus.call_sync(name, path, "org.freedesktop.DBus.Properties", "GetAll",
                            GLib.Variant("(s)", (iface,)), None, 0, 2000, None)
        return res.unpack()[0]
    except GLib.Error:
        return None


def dbus_call(name, path, iface, method, args=None, sig=None):
    try:
        res = bus.call_sync(name, path, iface, method, args,
                            GLib.VariantType(sig) if sig else None, 0, 2000, None)
        return res.unpack()
    except GLib.Error:
        return None


UPOWER_STATES = {1: "charging", 2: "discharging", 3: "empty", 4: "full", 5: "pending-charge", 6: "pending-discharge"}


def power_poll():
    devices = dbus_call("org.freedesktop.UPower", "/org/freedesktop/UPower",
                        "org.freedesktop.UPower", "EnumerateDevices", None, "(ao)")
    bats, ac = [], None
    for path in (devices[0] if devices else []):
        props = dbus_get_all("org.freedesktop.UPower", path, "org.freedesktop.UPower.Device")
        if not props:
            continue
        if props.get("Type") == 2 and props.get("PowerSupply"):
            bats.append({
                "name": path.rsplit("/", 1)[-1].replace("battery_", ""),
                "percent": round(props.get("Percentage", 0)),
                "state": UPOWER_STATES.get(props.get("State"), "unknown"),
                "time_to_empty_s": props.get("TimeToEmpty") or None,
                "energy_rate_w": round(props.get("EnergyRate", 0), 1),
            })
        elif props.get("Type") == 1 and path.endswith("line_power_AC"):
            ac = bool(props.get("Online"))
    update(("station", "batteries"), bats)
    update(("station", "ac_online"), ac)


MM_TECH = [(1 << 14, "5G"), (1 << 14 - 0, "5G"), (1 << 10, "LTE"), (1 << 5, "HSPA+"),
           (1 << 4, "HSPA"), (1 << 1, "GSM")]
MM_STATES = {-1: "failed", 0: "unknown", 1: "initializing", 2: "locked", 3: "disabled",
             4: "disabling", 5: "enabling", 6: "enabled", 7: "searching", 8: "registered",
             9: "disconnecting", 10: "connecting", 11: "connected"}


def lte_poll():
    objs = dbus_call("org.freedesktop.ModemManager1", "/org/freedesktop/ModemManager1",
                     "org.freedesktop.DBus.ObjectManager", "GetManagedObjects", None, "(a{oa{sa{sv}}})")
    if not objs or not objs[0]:
        update(("station", "lte"), {"available": False})
        return
    path, ifaces = next(iter(objs[0].items()))
    m = ifaces.get("org.freedesktop.ModemManager1.Modem", {})
    g3 = ifaces.get("org.freedesktop.ModemManager1.Modem.Modem3gpp", {})
    tech = m.get("AccessTechnologies", 0)
    tech_name = next((n for bit, n in MM_TECH if tech & bit), None)
    sq = m.get("SignalQuality", (0, False))
    update(("station", "lte"), {
        "available": True,
        "model": m.get("Model"),
        "state": MM_STATES.get(m.get("State"), "unknown"),
        "signal_percent": sq[0],
        "access_tech": tech_name,
        "operator": g3.get("OperatorName") or None,
        "sim_locked": m.get("UnlockRequired", 1) not in (0, 1),
    })


def wifi_poll():
    nm = "org.freedesktop.NetworkManager"
    devs = dbus_call(nm, "/org/freedesktop/NetworkManager", nm, "GetDevices", None, "(ao)")
    for path in (devs[0] if devs else []):
        d = dbus_get_all(nm, path, f"{nm}.Device")
        if not d or d.get("DeviceType") != 2:
            continue
        w = dbus_get_all(nm, path, f"{nm}.Device.Wireless") or {}
        ap_path = w.get("ActiveAccessPoint")
        info = {"available": True, "iface": d.get("Interface"), "connected": False}
        if ap_path and ap_path != "/":
            ap = dbus_get_all(nm, ap_path, f"{nm}.AccessPoint") or {}
            info.update(connected=True, ssid=bytes(ap.get("Ssid", b"")).decode("utf-8", "replace"),
                        signal_percent=ap.get("Strength"))
        ip4 = d.get("Ip4Config")
        if ip4 and ip4 != "/":
            cfg = dbus_get_all(nm, ip4, f"{nm}.IP4Config") or {}
            addrs = cfg.get("AddressData") or []
            if addrs:
                info["ip"] = addrs[0].get("address")
        update(("station", "wifi"), info)
        return
    update(("station", "wifi"), {"available": False})


def poll_thread():
    slow = 0
    while True:
        sensors_poll()
        if slow % 5 == 0:
            for fn in (power_poll, lte_poll, wifi_poll):
                try:
                    fn()
                except Exception as exc:  # keep the daemon alive on odd hardware
                    print(f"{fn.__name__}: {exc}", flush=True)
        slow += 1
        update(("updated",), time.time())
        time.sleep(1)


# --------------------------------------------------------------------- HTTP

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.rstrip("/") not in ("/state", ""):
            self.send_error(404)
            return
        with state_lock:
            body = json.dumps(state).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


def main():
    for target in (gnss_thread, poll_thread):
        threading.Thread(target=target, daemon=True).start()
    print(f"ardudeck-stationd: http://127.0.0.1:{HTTP_PORT}/state", flush=True)
    ThreadingHTTPServer(("127.0.0.1", HTTP_PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
