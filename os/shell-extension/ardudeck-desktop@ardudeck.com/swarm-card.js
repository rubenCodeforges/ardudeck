// The Swarm card on the Instruments desktop: every vehicle on the OS link with
// its mode, battery and health. Tapping one focuses it for the whole OS.
import Clutter from 'gi://Clutter';
import St from 'gi://St';

const API = 'http://127.0.0.1:47801/v1';

function batteryText(battery) {
    if (battery?.remaining !== null && battery?.remaining !== undefined) return `${battery.remaining}%`;
    if (battery?.voltage) return `${battery.voltage.toFixed(1)} V`;
    return '';
}

export class SwarmCard {
    constructor(api) {
        this._api = api;
        this.actor = new St.BoxLayout({vertical: true, style_class: 'adk-card', visible: false});
        this.actor.add_child(new St.Label({text: 'SWARM', style_class: 'adk-card-title'}));
        this._list = new St.BoxLayout({vertical: true, style_class: 'adk-rows'});
        this.actor.add_child(this._list);
    }

    /** fleet: GET /v1/fleet, or null when the link service is down. */
    update(fleet) {
        const vehicles = fleet?.vehicles ?? [];
        this.actor.visible = vehicles.length > 1;
        if (!this.actor.visible) return;
        this._list.destroy_all_children();
        for (const v of vehicles) this._list.add_child(this._row(v, v.sysid === fleet.focusSysid));
    }

    _row(v, focused) {
        const row = new St.Button({
            style_class: `adk-swarm-row${focused ? ' adk-swarm-focused' : ''}`,
            reactive: true,
            can_focus: true,
            x_expand: true,
        });
        const box = new St.BoxLayout({x_expand: true});
        const level = v.connected ? v.health.level : 'unknown';
        box.add_child(new St.Label({text: '●', style_class: `adk-swarm-dot adk-${{ok: 'good', warn: 'warn', bad: 'bad'}[level] ?? 'dim'}`, y_align: Clutter.ActorAlign.CENTER}));
        box.add_child(new St.Label({text: `SYS ${v.sysid}`, style_class: 'adk-swarm-id', y_align: Clutter.ActorAlign.CENTER}));
        box.add_child(new St.Label({
            text: v.connected ? `${v.mode || '?'}${v.armed ? '  ARMED' : ''}` : 'LOST',
            style_class: `adk-swarm-mode adk-${v.armed ? 'armed' : v.connected ? 'plain' : 'dim'}`,
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        }));
        box.add_child(new St.Label({text: batteryText(v.battery), style_class: 'adk-swarm-bat', y_align: Clutter.ActorAlign.CENTER}));
        row.set_child(box);
        row.connect('clicked', () => void this._api.write('POST', `${API}/fleet/focus`, {sysid: v.sysid}).catch(() => {}));
        return row;
    }
}
