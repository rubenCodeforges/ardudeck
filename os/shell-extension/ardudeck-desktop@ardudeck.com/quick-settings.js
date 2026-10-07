// "Vehicle Link" in the top-right quick settings: link state at a glance,
// master switch, saved and detected connections, and shortcuts to the app and
// the link settings window. Talks to ardudeck-os-linkd on 127.0.0.1:47801.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {QuickMenuToggle, SystemIndicator} from 'resource:///org/gnome/shell/ui/quickSettings.js';

const API = 'http://127.0.0.1:47801/v1';
const REFRESH_MS = 2000;
const APP_ID = 'ardudeck.desktop';
const SETTINGS_APP_ID = 'com.ardudeck.Settings.desktop';
const MAX_CONNECTIONS_SHOWN = 3;

function vehicleLine(v) {
    const kind = {ardupilot: 'ArduPilot', px4: 'PX4'}[v.firmware] ?? 'Vehicle';
    return `${kind} · ${v.mode || '?'}${v.armed ? ' · ARMED' : ''}`;
}

const VehicleLinkToggle = GObject.registerClass(
class VehicleLinkToggle extends QuickMenuToggle {
    _init(icon, api) {
        // Not a toggle: a tap on a quick settings tile is too easy to make for it
        // to switch off the vehicle link. Tapping opens the menu; the master
        // switch lives inside it and refuses to cut the link while armed.
        super._init({title: 'Vehicle Link', subtitle: 'Starting…', gicon: icon, toggleMode: false});
        this._api = api;
        this._icon = icon;
        this.menu.setHeader(icon, 'Vehicle Link', '');

        this._enabledItem = new PopupMenu.PopupSwitchMenuItem('Link enabled', true);
        this._enabledItem.connect('toggled', (_i, on) => void this._setEnabled(on));
        this.menu.addMenuItem(this._enabledItem);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        // Short by design: a touch menu that needs scrolling is a menu that cannot be used.
        // The full list of connections lives in ArduDeck Settings.
        this._savedSection = new PopupMenu.PopupMenuSection();
        this._detectedSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._savedSection);
        this.menu.addMenuItem(this._detectedSection);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.addAction('Open ArduDeck', () => this._launch(APP_ID));
        this.menu.addAction('All Connections…', () => this._launch(SETTINGS_APP_ID));

        this.connect('clicked', () => this.menu.open());
        this.menu.connect('open-state-changed', (_m, open) => {
            if (open) void this.refresh();
        });
    }

    async refresh() {
        try {
            const [links, info] = await Promise.all([this._api.get(`${API}/links`), this._api.get(`${API}/info`)]);
            this._render(links, info);
        } catch (e) {
            this._fail(e);
        }
    }

    async _setEnabled(on) {
        if (!on && this._vehicle?.connected && this._vehicle.armed) {
            Main.notify('Vehicle Link', 'Disarm before turning the vehicle link off.');
            this._enabledItem.setToggleState(true);
            return;
        }
        try {
            await this._api.write('POST', `${API}/links/enabled`, {enabled: on});
        } catch (e) {
            this._fail(e);
        }
        await this.refresh();
    }

    _render(links, info) {
        const v = info.vehicle;
        this._vehicle = v;
        this._enabledItem.setToggleState(links.enabled);
        const active = links.connections.find(c => c.id === links.activeId);
        this.checked = links.enabled;
        if (!links.enabled) this.subtitle = 'Off';
        else if (v?.connected) this.subtitle = vehicleLine(v);
        else if (info.link.error) this.subtitle = 'Connection problem';
        else this.subtitle = 'Searching…';

        const fleet = info.link.roster?.length ?? 0;
        const header = !links.enabled ? 'Link is off'
            : fleet > 1 ? `${fleet} vehicles connected`
            : v?.connected ? `${vehicleLine(v)} via ${active?.name ?? '?'}`
                : info.link.error ? `${active?.name}: ${info.link.error}` : `Waiting on ${active?.name ?? '?'}`;
        this.menu.setHeader(this._icon, 'Vehicle Link', header);

        this._savedSection.removeAll();
        const inUseIds = new Set([links.activeId, ...(links.joinedIds ?? [])]);
        const shown = links.connections.filter(c => inUseIds.has(c.id))
            .concat(links.connections.filter(c => !inUseIds.has(c.id)))
            .slice(0, Math.max(MAX_CONNECTIONS_SHOWN, inUseIds.size));
        for (const c of shown) {
            const item = new PopupMenu.PopupMenuItem(c.name);
            const inUse = c.id === links.activeId || (links.joinedIds ?? []).includes(c.id);
            item.setOrnament(inUse ? PopupMenu.Ornament.CHECK : PopupMenu.Ornament.NONE);
            item.connect('activate', () => {
                void this._api.write('POST', `${API}/links/active`, {id: c.id}).then(() => this.refresh()).catch(e => this._fail(e));
            });
            this._savedSection.addMenuItem(item);
        }

        // USB radios and flight controllers that are plugged in but not saved yet.
        this._detectedSection.removeAll();
        const saved = new Set(links.connections.filter(c => c.type === 'serial').map(c => c.path));
        const fresh = (links.detected ?? []).filter(d => !saved.has(d.path));
        const simulators = links.discovered ?? [];
        if (fresh.length || simulators.length)
            this._detectedSection.addMenuItem(new PopupMenu.PopupSeparatorMenuItem('Detected'));
        if (simulators.length > 1) {
            const all = new PopupMenu.PopupMenuItem(`Connect ${simulators.length} simulators as a swarm`);
            all.connect('activate', () => void this._joinAll(simulators));
            this._detectedSection.addMenuItem(all);
        }
        for (const v of simulators.length > 1 ? [] : simulators) {
            const item = new PopupMenu.PopupMenuItem(`${v.label} (TCP ${v.connection.port})`);
            item.connect('activate', () => {
                void this._api.write('POST', `${API}/links`, {connection: v.connection, activate: true})
                    .then(() => this.refresh()).catch(e => this._fail(e));
            });
            this._detectedSection.addMenuItem(item);
        }
        if (fresh.length) {
            for (const d of fresh) {
                const item = new PopupMenu.PopupMenuItem(`${d.label} (${d.path.replace('/dev/', '')})`);
                item.connect('activate', () => {
                    const connection = {type: 'serial', path: d.path, baudRate: d.suggestedBaud, name: d.label};
                    void this._api.write('POST', `${API}/links`, {connection, activate: true})
                        .then(() => this.refresh()).catch(e => this._fail(e));
                });
                this._detectedSection.addMenuItem(item);
            }
        }
    }

    async _joinAll(simulators) {
        try {
            for (const v of simulators)
                await this._api.write('POST', `${API}/links`, {connection: v.connection, join: true});
        } catch (e) {
            this._fail(e);
        }
        await this.refresh();
    }

    _fail(e) {
        this.checked = false;
        this.subtitle = 'Service not running';
        this.menu.setHeader(this._icon, 'Vehicle Link', `ardudeck-os-linkd: ${e.message}`);
    }

    _launch(id) {
        const app = Gio.DesktopAppInfo.new(id);
        if (app) app.launch([], null);
        else Main.notify('ArduDeck', `${id} is not installed`);
        Main.panel.closeQuickSettings();
    }
});

/** Panel indicator (drone icon while a vehicle is live) plus the quick settings tile. */
export const VehicleLinkIndicator = GObject.registerClass(
class VehicleLinkIndicator extends SystemIndicator {
    _init(extensionPath, api) {
        super._init();
        const icon = Gio.icon_new_for_string(`${extensionPath}/icons/ardudeck-vehicle-symbolic.svg`);
        this._indicator = this._addIndicator();
        this._indicator.gicon = icon;
        this._indicator.visible = false;

        this._toggle = new VehicleLinkToggle(icon, api);
        this.quickSettingsItems.push(this._toggle);

        this._timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, REFRESH_MS, () => {
            void this._tick();
            return GLib.SOURCE_CONTINUE;
        });
        void this._tick();
    }

    async _tick() {
        await this._toggle.refresh();
        // The top-bar icon only shows while a vehicle is live; red tint when armed.
        const sub = this._toggle.subtitle ?? '';
        const live = this._toggle.checked && !['Off', 'Searching…', 'Connection problem', 'Service not running', 'Starting…'].includes(sub);
        this._indicator.visible = live;
        this._indicator.style = sub.includes('ARMED') ? 'color: #f87171;' : 'color: #2dd4bf;';
    }

    destroy() {
        if (this._timer) GLib.source_remove(this._timer);
        this._timer = 0;
        this.quickSettingsItems.forEach(item => item.destroy());
        super.destroy();
    }
});
