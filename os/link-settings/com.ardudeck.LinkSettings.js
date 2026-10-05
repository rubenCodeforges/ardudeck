#!/usr/bin/env -S gjs -m
// ArduDeck Link Settings: manage how ArduDeck OS reaches the vehicle.
// A libadwaita front end for ardudeck-os-linkd's /v1/links API.
import Adw from 'gi://Adw?version=1';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';
import Soup from 'gi://Soup?version=3.0';
import {exit} from 'system';

const API = 'http://127.0.0.1:47801/v1';
const APP_ID = 'com.ardudeck.LinkSettings';
const BAUD_RATES = ['9600', '19200', '38400', '57600', '115200', '230400', '460800', '921600', '1500000'];
const TYPES = [
    {id: 'udp-listen', label: 'Wi-Fi telemetry (listen on a UDP port)'},
    {id: 'udp-peer', label: 'UDP to a fixed address'},
    {id: 'tcp', label: 'TCP (SITL, companion computer)'},
    {id: 'serial', label: 'USB serial radio or flight controller'},
];

const session = new Soup.Session({timeout: 3});

function request(method, path, body) {
    const msg = Soup.Message.new(method, `${API}${path}`);
    if (method !== 'GET') msg.get_request_headers().append('X-ArduDeck', '1');
    if (body !== undefined)
        msg.set_request_body_from_bytes('application/json', new GLib.Bytes(new TextEncoder().encode(JSON.stringify(body))));
    return new Promise((resolve, reject) => {
        session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null, (s, res) => {
            try {
                const text = new TextDecoder().decode(s.send_and_read_finish(res).get_data() ?? new Uint8Array());
                const data = text ? JSON.parse(text) : null;
                if (msg.get_status() >= 300) reject(new Error(data?.error ?? `HTTP ${msg.get_status()}`));
                else resolve(data);
            } catch (e) {
                reject(new Error(`The link service is not reachable (${e.message})`));
            }
        });
    });
}

function describe(c) {
    switch (c.type) {
    case 'udp-listen': return `Listens on UDP ${c.port}`;
    case 'udp-peer': return `Talks to ${c.host}:${c.port} over UDP`;
    case 'tcp': return `TCP ${c.host}:${c.port}`;
    case 'serial': return `${c.path} at ${c.baudRate} baud`;
    default: return c.type;
    }
}

class LinkSettingsWindow {
    constructor(app) {
        this.win = new Adw.ApplicationWindow({application: app, title: 'Vehicle Link', default_width: 560, default_height: 680});
        this.toasts = new Adw.ToastOverlay();
        const view = new Adw.ToolbarView();
        const header = new Adw.HeaderBar();
        const add = new Gtk.Button({icon_name: 'list-add-symbolic', tooltip_text: 'Add connection'});
        add.connect('clicked', () => this.openEditor());
        header.pack_start(add);
        view.add_top_bar(header);

        this.page = new Adw.PreferencesPage();
        this.statusGroup = new Adw.PreferencesGroup({title: 'Vehicle link', description: 'ArduDeck OS keeps one link to the vehicle and shares it with the ArduDeck app and the desktop instruments.'});
        this.enabledRow = new Adw.SwitchRow({title: 'Link enabled', subtitle: ''});
        this._ignoreSwitch = false;
        this.enabledRow.connect('notify::active', () => {
            if (this._ignoreSwitch) return;
            void this.act(() => request('POST', '/links/enabled', {enabled: this.enabledRow.active}));
        });
        this.statusGroup.add(this.enabledRow);
        this.page.add(this.statusGroup);

        this.connGroup = null;
        this.detectGroup = null;
        view.set_content(this.page);
        this.toasts.set_child(view);
        this.win.set_content(this.toasts);
        this.timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, () => {
            void this.refresh(false);
            return GLib.SOURCE_CONTINUE;
        });
        this.win.connect('close-request', () => {
            GLib.source_remove(this.timer);
            return false;
        });
    }

    toast(text) {
        this.toasts.add_toast(new Adw.Toast({title: text, timeout: 3}));
    }

    async act(fn, done) {
        try {
            await fn();
            if (done) this.toast(done);
        } catch (e) {
            this.toast(e.message);
        }
        await this.refresh(true);
    }

    async refresh(rebuild) {
        let links, info;
        try {
            [links, info] = await Promise.all([request('GET', '/links'), request('GET', '/info')]);
        } catch (e) {
            this.enabledRow.subtitle = e.message;
            return;
        }
        this._ignoreSwitch = true;
        this.enabledRow.active = links.enabled;
        this._ignoreSwitch = false;
        const v = info.vehicle;
        this.enabledRow.subtitle = !links.enabled ? 'Off: nothing is listening for the vehicle'
            : v?.connected ? `Connected: ${v.firmware} in ${v.mode}${v.armed ? ', armed' : ''}`
                : links.link.error ? `Problem: ${links.link.error}` : 'Searching for the vehicle';

        const key = JSON.stringify([links.activeId, links.connections, links.detected]);
        if (!rebuild && key === this._lastKey) return;
        this._lastKey = key;
        this.renderConnections(links);
        this.renderDetected(links);
    }

    renderConnections(links) {
        if (this.connGroup) this.page.remove(this.connGroup);
        this.connGroup = new Adw.PreferencesGroup({title: 'Connections', description: 'The checked connection is active. Pick another to switch.'});
        let first = null;
        for (const c of links.connections) {
            const row = new Adw.ActionRow({title: c.name, subtitle: describe(c), activatable: true});
            const radio = new Gtk.CheckButton({active: c.id === links.activeId, valign: Gtk.Align.CENTER});
            if (first) radio.set_group(first); else first = radio;
            radio.connect('toggled', () => {
                if (radio.active && c.id !== links.activeId)
                    void this.act(() => request('POST', '/links/active', {id: c.id}), `Switched to ${c.name}`);
            });
            row.add_prefix(radio);
            row.set_activatable_widget(radio);
            const edit = new Gtk.Button({icon_name: 'document-edit-symbolic', valign: Gtk.Align.CENTER, tooltip_text: 'Edit', css_classes: ['flat']});
            edit.connect('clicked', () => this.openEditor(c));
            const del = new Gtk.Button({icon_name: 'user-trash-symbolic', valign: Gtk.Align.CENTER, tooltip_text: 'Remove', css_classes: ['flat'], sensitive: links.connections.length > 1});
            del.connect('clicked', () => void this.act(() => request('DELETE', `/links/${c.id}`), `Removed ${c.name}`));
            row.add_suffix(edit);
            row.add_suffix(del);
            this.connGroup.add(row);
        }
        this.page.add(this.connGroup);
    }

    renderDetected(links) {
        if (this.detectGroup) this.page.remove(this.detectGroup);
        this.detectGroup = new Adw.PreferencesGroup({title: 'Detected devices', description: 'USB radios and flight controllers plugged into this tablet.'});
        const saved = new Set(links.connections.filter(c => c.type === 'serial').map(c => c.path));
        const devices = links.detected ?? [];
        if (devices.length === 0)
            this.detectGroup.add(new Adw.ActionRow({title: 'Nothing plugged in', subtitle: 'Connect a SiK or ELRS radio, or a flight controller, by USB.'}));
        for (const d of devices) {
            const row = new Adw.ActionRow({title: d.label, subtitle: `${d.path}${d.vendorId ? `  ·  USB ${d.vendorId}:${d.productId}` : ''}`});
            if (saved.has(d.path)) {
                row.add_suffix(new Gtk.Label({label: 'Saved', css_classes: ['dim-label']}));
            } else {
                const use = new Gtk.Button({label: 'Use', valign: Gtk.Align.CENTER, css_classes: ['suggested-action']});
                use.connect('clicked', () => void this.act(() => request('POST', '/links', {
                    connection: {type: 'serial', path: d.path, baudRate: d.suggestedBaud, name: d.label}, activate: true,
                }), `Connecting to ${d.label}`));
                row.add_suffix(use);
            }
            this.detectGroup.add(row);
        }
        this.page.add(this.detectGroup);
    }

    openEditor(existing) {
        const dialog = new Adw.Dialog({title: existing ? 'Edit Connection' : 'Add Connection', content_width: 460});
        const view = new Adw.ToolbarView();
        const header = new Adw.HeaderBar({show_end_title_buttons: false, show_start_title_buttons: false});
        const cancel = new Gtk.Button({label: 'Cancel'});
        const save = new Gtk.Button({label: existing ? 'Save' : 'Add and Connect', css_classes: ['suggested-action']});
        header.pack_start(cancel);
        header.pack_end(save);
        view.add_top_bar(header);

        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup();
        const type = new Adw.ComboRow({title: 'Type', model: Gtk.StringList.new(TYPES.map(t => t.label))});
        const name = new Adw.EntryRow({title: 'Name'});
        const host = new Adw.EntryRow({title: 'Host or IP address'});
        const port = new Adw.EntryRow({title: 'Port', input_purpose: Gtk.InputPurpose.DIGITS});
        const path = new Adw.EntryRow({title: 'Device', text: '/dev/ttyUSB0'});
        const baud = new Adw.ComboRow({title: 'Baud rate', model: Gtk.StringList.new(BAUD_RATES), selected: BAUD_RATES.indexOf('57600')});
        for (const r of [type, name, host, port, path, baud]) group.add(r);
        page.add(group);
        view.set_content(page);
        dialog.set_child(view);

        const sync = () => {
            const t = TYPES[type.selected].id;
            host.visible = t === 'udp-peer' || t === 'tcp';
            port.visible = t !== 'serial';
            path.visible = baud.visible = t === 'serial';
            if (!existing && !port.text) port.text = t === 'tcp' ? '5760' : '14550';
        };
        if (existing) {
            type.selected = TYPES.findIndex(t => t.id === existing.type);
            name.text = existing.name ?? '';
            host.text = existing.host ?? '';
            port.text = existing.port ? String(existing.port) : '';
            path.text = existing.path ?? '';
            if (existing.baudRate) baud.selected = BAUD_RATES.indexOf(String(existing.baudRate));
        }
        type.connect('notify::selected', sync);
        sync();

        cancel.connect('clicked', () => dialog.close());
        save.connect('clicked', () => {
            const t = TYPES[type.selected].id;
            const connection = {type: t, name: name.text};
            if (existing) connection.id = existing.id;
            if (t === 'udp-peer' || t === 'tcp') connection.host = host.text.trim();
            if (t !== 'serial') connection.port = Number(port.text);
            if (t === 'serial') {
                connection.path = path.text.trim();
                connection.baudRate = Number(BAUD_RATES[baud.selected]);
            }
            void this.act(() => request('POST', '/links', {connection, activate: !existing}),
                existing ? 'Connection saved' : 'Connection added').then(() => dialog.close());
        });
        dialog.present(this.win);
    }
}

const app = new Adw.Application({application_id: APP_ID});
app.connect('activate', () => {
    const existing = app.get_active_window();
    if (existing) {
        existing.present();
        return;
    }
    const w = new LinkSettingsWindow(app);
    w.win.present();
    void w.refresh(true);
    // Development aid: ARDUDECK_SCREENSHOT=/path.png renders the window offscreen
    // after it settles and quits. Works with the session locked or headless.
    const shot = GLib.getenv('ARDUDECK_SCREENSHOT');
    if (shot) {
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2500, () => {
            const paintable = new Gtk.WidgetPaintable({widget: w.win});
            const snap = new Gtk.Snapshot();
            paintable.snapshot(snap, w.win.get_width(), w.win.get_height());
            const tex = w.win.get_native().get_renderer().render_texture(snap.to_node(), null);
            tex.save_to_png(shot);
            app.quit();
            return GLib.SOURCE_REMOVE;
        });
    }
});
exit(app.run([imports.system.programInvocationName, ...ARGV]));
