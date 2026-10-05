// ArduDeck Desktop: live ground-station and vehicle instruments drawn on the
// desktop layer (above the wallpaper, below windows).
//   ground station  <- ardudeck-stationd  http://127.0.0.1:47800/state
//   vehicle         <- ardudeck-os-linkd  http://127.0.0.1:47801/v1/vehicle
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {drawRoundGauge, drawAttitude, headingRose, vsiArc, COLORS} from './gauges.js';
import {LocalApi} from './http.js';
import {VehicleLinkIndicator} from './quick-settings.js';
import {DesktopSurfaceManager} from './surface.js';

const STATION_URL = 'http://127.0.0.1:47800/state';
const VEHICLE_URL = 'http://127.0.0.1:47801/v1/vehicle';
const STATION_POLL_MS = 1000;
const VEHICLE_POLL_MS = 250;
const MARGIN = 48;
const GAUGE = 150;
const ATTITUDE = 220;
const MAX_MESSAGES = 4;

const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const BATTERY_SCALE = {
    min: 0, max: 100, startAngle: -135, endAngle: 135,
    zones: [
        {from: 0, to: 15, color: COLORS.red},
        {from: 15, to: 30, color: COLORS.amber},
        {from: 30, to: 100, color: COLORS.green},
    ],
    majorTicks: [0, 50, 100],
};
// STATUSTEXT severities 0-3 are errors, 4 warning (RFC 5424, as MAVLink uses them).
const severityLevel = s => (s <= 3 ? 'bad' : s === 4 ? 'warn' : 'plain');

class Card {
    constructor(title) {
        this.actor = new St.BoxLayout({vertical: true, style_class: 'adk-card'});
        this.title = new St.Label({text: title, style_class: 'adk-card-title'});
        this.status = new St.Label({text: '', style_class: 'adk-status'});
        this.rows = new St.BoxLayout({vertical: true, style_class: 'adk-rows'});
        this.messages = new St.BoxLayout({vertical: true, style_class: 'adk-messages'});
        this.footer = new St.Label({text: '', style_class: 'adk-footer'});
        for (const a of [this.title, this.status, this.rows, this.messages, this.footer])
            this.actor.add_child(a);
        this._rowCache = new Map();
    }

    setStatus(text, level) {
        this.status.text = text;
        this.status.style_class = `adk-status adk-${level}`;
    }

    // rows: [[label, value, level?], ...]
    setRows(rows) {
        const seen = new Set();
        rows.forEach(([label, value, level], i) => {
            seen.add(label);
            let row = this._rowCache.get(label);
            if (!row) {
                const box = new St.BoxLayout({style_class: 'adk-row'});
                const l = new St.Label({text: label, style_class: 'adk-label', y_align: Clutter.ActorAlign.CENTER});
                const v = new St.Label({text: '', style_class: 'adk-value', x_expand: true, x_align: Clutter.ActorAlign.END});
                box.add_child(l);
                box.add_child(v);
                row = {box, v};
                this._rowCache.set(label, row);
            }
            if (row.box.get_parent() !== this.rows)
                this.rows.insert_child_at_index(row.box, i);
            else
                this.rows.set_child_at_index(row.box, i);
            row.v.text = value ?? '—';
            row.v.style_class = `adk-value adk-${level ?? 'plain'}`;
        });
        for (const [label, row] of this._rowCache) {
            if (!seen.has(label) && row.box.get_parent())
                this.rows.remove_child(row.box);
        }
    }

    setMessages(list) {
        this.messages.destroy_all_children();
        for (const m of list) {
            this.messages.add_child(new St.Label({
                text: m.text,
                style_class: `adk-message adk-${severityLevel(m.severity)}`,
            }));
        }
    }
}

function pctLevel(p, warn = 30, bad = 15) {
    if (p === null || p === undefined) return 'dim';
    return p <= bad ? 'bad' : p <= warn ? 'warn' : 'good';
}

function fmtCoord(lat, lon) {
    if (lat === null || lat === undefined) return null;
    return `${Math.abs(lat).toFixed(5)}°${lat >= 0 ? 'N' : 'S'}  ${Math.abs(lon).toFixed(5)}°${lon >= 0 ? 'E' : 'W'}`;
}

/** Present a value only when it is real: null/undefined/NaN mean "no row". */
const known = v => v !== null && v !== undefined && !(typeof v === 'number' && Number.isNaN(v));

// Ground station card: a row exists only while its data does. No receiver
// means no GNSS rows, no fix means no position/altitude, a locked SIM or an
// unregistered modem means no cellular row, and so on.
function renderStation(card, s) {
    const rows = [];
    const g = s.gnss ?? {};
    const batteries = s.batteries ?? [];

    if (g.available) {
        const fix = g.fix_quality > 0 && g.valid !== false;
        card.setStatus(fix ? (g.fix_quality >= 4 ? 'RTK FIX' : g.fix_quality === 2 ? 'DGPS FIX' : '3D FIX') : 'GPS SEARCHING', fix ? 'good' : 'warn');
        rows.push(['Satellites', `${g.sats_used ?? 0} used / ${g.sats_in_view ?? 0} seen`, fix ? 'good' : 'warn']);
        if (fix && known(g.lat) && known(g.lon)) rows.push(['Position', fmtCoord(g.lat, g.lon)]);
        if (fix && known(g.alt_m)) rows.push(['Altitude', `${g.alt_m.toFixed(0)} m`]);
    } else if (batteries.length) {
        // No receiver: lead with what the operator needs most, the station's power.
        const lowest = Math.min(...batteries.map(b => b.percent));
        card.setStatus(s.ac_online ? 'EXTERNAL POWER' : `BATTERY ${lowest}%`, s.ac_online ? 'good' : pctLevel(lowest));
    } else {
        card.setStatus('READY', 'good');
    }

    if (known(s.heading_deg)) {
        const c = CARDINALS[Math.round(s.heading_deg / 45) % 8];
        rows.push(['Heading', `${Math.round(s.heading_deg)}°  ${c}`]);
    }
    const w = s.wifi ?? {};
    if (w.available && w.connected)
        rows.push(['Wi-Fi', `${w.ssid}  ${w.signal_percent}%`, pctLevel(w.signal_percent, 40, 20)]);
    const l = s.lte ?? {};
    if (l.available && !l.sim_locked && (l.state === 'connected' || l.state === 'registered'))
        rows.push(['Cellular', `${l.access_tech ?? 'LTE'} ${l.signal_percent}%${l.operator ? '  ' + l.operator : ''}`, pctLevel(l.signal_percent, 40, 20)]);
    batteries.forEach((b, i) => {
        const arrow = b.state === 'charging' ? '  ▲' : b.state === 'discharging' ? '  ▼' : '';
        rows.push([batteries.length > 1 ? `Battery ${i + 1}` : 'Battery', `${b.percent}%${arrow}`, pctLevel(b.percent)]);
    });
    if (known(s.illuminance_lux))
        rows.push(['Ambient', `${Math.round(s.illuminance_lux)} lux`, 'dim']);
    card.setRows(rows);
    card.footer.text = g.available && g.model ? `GNSS ${g.model}` : s.ac_online ? 'On external power' : '';
    card.footer.visible = card.footer.text !== '';
}

function renderVehicle(card, v, serviceUp) {
    if (!serviceUp) {
        card.setStatus('LINK SERVICE OFF', 'bad');
        card.setRows([]);
        card.setMessages([]);
        card.footer.text = 'ardudeck-os-linkd is not running';
        return;
    }
    if (!v || !v.connected) {
        card.setStatus(v ? 'LINK LOST' : 'NO VEHICLE', v ? 'bad' : 'dim');
        card.setRows(v ? [['Last mode', v.mode, 'dim']] : []);
        card.setMessages([]);
        card.footer.text = 'Listening for MAVLink on UDP 14550';
        return;
    }
    card.setStatus(`${v.armed ? 'ARMED' : 'DISARMED'} · ${v.mode || '?'}`, v.armed ? 'armed' : 'good');
    const fw = v.firmware === 'ardupilot' ? 'ArduPilot' : v.firmware === 'px4' ? 'PX4' : 'MAVLink';
    const rows = [['Firmware', `${fw}${v.firmwareVersion ? ' ' + v.firmwareVersion : ''}`]];
    if (v.gps) rows.push(['GPS', v.gps.fixType >= 3 ? `${v.gps.satellites ?? '?'} sats${v.gps.fixType >= 5 ? '  RTK' : ''}` : 'No fix', v.gps.fixType >= 3 ? 'good' : 'warn']);
    if (v.position) rows.push(['Position', fmtCoord(v.position.lat, v.position.lon)]);
    card.setRows(rows);
    card.setMessages((v.messages ?? []).slice(-MAX_MESSAGES).reverse());
    card.footer.text = `System ${v.sysid} · MAVLink ${v.mavlinkVersion}`;
}

/** Bottom instrument cluster: BAT, SPD, attitude ball, ALT, HDG. */
class Cluster {
    constructor() {
        this.actor = new St.BoxLayout({style_class: 'adk-cluster'});
        this.vehicle = null;
        this.speedMax = 10;
        this._shrinkSince = null;
        this.areas = [
            this._gauge(GAUGE, cr => this._battery(cr)),
            this._gauge(GAUGE, cr => this._speed(cr)),
            this._gauge(ATTITUDE, cr => {
                const v = this._live();
                drawAttitude(cr, ATTITUDE, {
                    roll: v?.attitude?.roll ?? 0, pitch: v?.attitude?.pitch ?? 0,
                    heading: v?.hud?.heading ?? v?.position?.heading ?? 0, dim: !v?.attitude,
                });
            }),
            this._gauge(GAUGE, cr => this._altitude(cr)),
            this._gauge(GAUGE, cr => this._heading(cr)),
        ];
    }

    _gauge(size, draw) {
        const area = new St.DrawingArea({width: size, height: size, y_align: Clutter.ActorAlign.END});
        area.connect('repaint', a => {
            const cr = a.get_context();
            try {
                draw(cr);
            } finally {
                cr.$dispose();
            }
        });
        this.actor.add_child(area);
        return area;
    }

    _live() {
        return this.vehicle?.connected ? this.vehicle : null;
    }

    update(vehicle) {
        this.vehicle = vehicle;
        for (const a of this.areas) a.queue_repaint();
    }

    _battery(cr) {
        const b = this._live()?.battery;
        const known = b && b.remaining !== null && b.remaining >= 0;
        const color = !known ? COLORS.text : b.remaining > 30 ? COLORS.green : b.remaining > 15 ? COLORS.amber : COLORS.red;
        drawRoundGauge(cr, GAUGE, {
            label: 'Bat', scale: BATTERY_SCALE, needleValue: known ? b.remaining : null,
            value: b?.voltage ? b.voltage.toFixed(1) : '--', unit: 'V',
            sub: known ? `${Math.round(b.remaining)}%` : '--%', valueColor: color, dim: !b,
        });
    }

    _speed(cr) {
        const hud = this._live()?.hud;
        const gs = hud?.groundspeed ?? 0;
        // Same auto-ranging as the app: grow at once, shrink after 5 s.
        const needed = Math.max(10, Math.ceil((gs * 1.25) / 5) * 5);
        if (needed > this.speedMax) {
            this.speedMax = needed;
            this._shrinkSince = null;
        } else if (needed < this.speedMax) {
            this._shrinkSince ??= Date.now();
            if (Date.now() - this._shrinkSince > 5000) {
                this.speedMax = needed;
                this._shrinkSince = null;
            }
        }
        const step = this.speedMax / 5;
        drawRoundGauge(cr, GAUGE, {
            label: 'Spd',
            scale: {
                min: 0, max: this.speedMax, startAngle: -135, endAngle: 135,
                majorTicks: Array.from({length: 6}, (_, i) => i * step),
                minorTicks: Array.from({length: 5}, (_, i) => i * step + step / 2),
            },
            needleValue: hud ? gs : null,
            value: hud ? gs.toFixed(1) : '--', unit: 'm/s',
            sub: hud ? `AS ${hud.airspeed.toFixed(1)}` : '', dim: !hud,
        });
    }

    _altitude(cr) {
        const v = this._live();
        const pos = v?.position;
        const climb = v?.hud?.climb ?? 0;
        drawRoundGauge(cr, GAUGE, {
            label: 'Alt', value: pos ? pos.altRel.toFixed(1) : '--', unit: 'm',
            sub: pos ? `MSL ${pos.altMsl.toFixed(0)}` : '', extra: vsiArc(climb), dim: !pos,
        });
    }

    _heading(cr) {
        const v = this._live();
        const hdg = v?.hud?.heading ?? v?.position?.heading ?? null;
        const deg = hdg === null ? null : Math.round(hdg) % 360;
        drawRoundGauge(cr, GAUGE, {
            label: 'Hdg', value: deg === null ? '--' : String(deg), unit: '°',
            sub: deg === null ? '' : CARDINALS[Math.round(deg / 45) % 8], extra: headingRose(deg ?? 0), dim: deg === null,
        });
    }
}

export default class ArduDeckDesktop extends Extension {
    // The extension also runs on the lock screen (session-modes in metadata),
    // only to make sure an on-screen keyboard is there: GJS OSK, the user-session
    // keyboard, switches GNOME's own keyboard off and is itself stopped while the
    // screen is locked, which can leave the unlock prompt with no keyboard at all.
    // Everything else exists only in the unlocked user session.
    enable() {
        this._a11y = new Gio.Settings({schema_id: 'org.gnome.desktop.a11y.applications'});
        this._modeId = Main.sessionMode.connect('updated', () => this._syncMode());
        this._syncMode();
    }

    _syncMode() {
        if (Main.sessionMode.isLocked) {
            this._disableDesktop();
            this._a11y.set_boolean('screen-keyboard-enabled', true);
        } else if (!this._root) {
            this._enableDesktop();
        }
    }

    _enableDesktop() {
        this._session = new Soup.Session({timeout: 2});
        this._api = new LocalApi();
        this._linkIndicator = new VehicleLinkIndicator(this.path, this._api);
        Main.panel.statusArea.quickSettings.addExternalIndicator(this._linkIndicator);
        this._station = new Card('GROUND STATION');
        this._vehicle = new Card('VEHICLE');
        this._cluster = new Cluster();

        this._root = new St.Widget({style_class: 'adk-root', reactive: false});
        for (const a of [this._station.actor, this._vehicle.actor, this._cluster.actor])
            this._root.add_child(a);
        Main.layoutManager._backgroundGroup.add_child(this._root);

        // When the live desktop surface (map, SVT, instruments) is running it is
        // the desktop; these lightweight Cairo widgets are the fallback without it.
        this._surface = new DesktopSurfaceManager(active => {
            if (this._root) this._root.visible = !active;
        });
        if (this._surface.active) this._root.visible = false;

        this._monitorsId = Main.layoutManager.connect('monitors-changed', () => this._place());
        for (const a of [this._vehicle.actor, this._cluster.actor])
            a.connect('notify::width', () => this._place());
        this._place();

        renderStation(this._station, {});
        renderVehicle(this._vehicle, null, true);
        this._timers = [
            this._every(STATION_POLL_MS, () => this._pollStation()),
            this._every(VEHICLE_POLL_MS, () => this._pollVehicle()),
        ];
    }

    _every(ms, fn) {
        fn();
        return GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            fn();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _place() {
        const m = Main.layoutManager.primaryMonitor;
        if (!m || !this._root) return;
        const top = m.y + Main.panel.height + MARGIN;
        this._station.actor.set_position(m.x + MARGIN, top);
        this._vehicle.actor.set_position(m.x + m.width - MARGIN - this._vehicle.actor.width, top);
        const c = this._cluster.actor;
        c.set_position(m.x + Math.round((m.width - c.width) / 2), m.y + m.height - MARGIN - ATTITUDE);
    }

    _get(url, inflightKey, onData, onError) {
        if (this[inflightKey]) return;
        this[inflightKey] = true;
        const msg = Soup.Message.new('GET', url);
        this._session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null, (session, res) => {
            this[inflightKey] = false;
            if (!this._root) return;
            try {
                const bytes = session.send_and_read_finish(res);
                if (msg.get_status() !== 200) throw new Error(`HTTP ${msg.get_status()}`);
                onData(JSON.parse(new TextDecoder().decode(bytes.get_data())));
            } catch (e) {
                onError(e);
            }
        });
    }

    _pollStation() {
        this._get(STATION_URL, '_stationInflight',
            data => renderStation(this._station, data.station ?? {}),
            () => {
                this._station.setStatus('SERVICE OFFLINE', 'bad');
                this._station.setRows([]);
                this._station.footer.text = 'ardudeck-stationd is not running';
            });
    }

    _pollVehicle() {
        this._get(VEHICLE_URL, '_vehicleInflight',
            vehicle => {
                renderVehicle(this._vehicle, vehicle, true);
                this._cluster.update(vehicle);
            },
            () => {
                renderVehicle(this._vehicle, null, false);
                this._cluster.update(null);
            });
    }

    disable() {
        if (this._modeId) Main.sessionMode.disconnect(this._modeId);
        this._modeId = 0;
        this._disableDesktop();
        this._a11y = null;
    }

    _disableDesktop() {
        this._surface?.destroy();
        this._surface = null;
        this._linkIndicator?.destroy();
        this._linkIndicator = null;
        this._api?.destroy();
        this._api = null;
        for (const id of this._timers ?? []) GLib.source_remove(id);
        this._timers = null;
        if (this._monitorsId) Main.layoutManager.disconnect(this._monitorsId);
        this._monitorsId = 0;
        this._root?.destroy();
        this._root = null;
        this._station = this._vehicle = this._cluster = null;
        this._session?.abort();
        this._session = null;
    }
}
