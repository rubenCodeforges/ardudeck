#!/usr/bin/env -S gjs -m
// ArduDeck Settings: the system settings of ArduDeck OS, laid out like GNOME
// Settings. Pages: Vehicle Link (front end for ardudeck-os-linkd's /v1/links)
// and Desktops (what each workspace's desktop shows, stored in GSettings and
// applied live by the shell extension and the desktop surface).
import Adw from 'gi://Adw?version=1';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';
import Soup from 'gi://Soup?version=3.0';
import {exit} from 'system';

const API = 'http://127.0.0.1:47801/v1';
const APP_ID = 'com.ardudeck.Settings';
const DESKTOP_SCHEMA = 'org.gnome.shell.extensions.ardudeck-desktop';
const SCENES = [
    {id: 'map-svt', label: 'Live Map and Synthetic Vision'},
    {id: 'map', label: 'Live Map'},
    {id: 'svt', label: 'Synthetic Vision'},
    {id: 'instruments', label: 'Instruments'},
    {id: 'wallpaper', label: 'Wallpaper'},
];
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

/** Vehicle Link page: the system link's state, connections and detected devices. */
class LinkPage {
    constructor(win, toasts) {
        this.win = win;
        this.toasts = toasts;
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
        this.widget = view;
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


/** Desktops page: what each workspace's desktop shows. */
class DesktopsPage {
    constructor() {
        this.settings = new Gio.Settings({schema_id: DESKTOP_SCHEMA});
        this.mutter = new Gio.Settings({schema_id: 'org.gnome.mutter'});
        this.wm = new Gio.Settings({schema_id: 'org.gnome.desktop.wm.preferences'});
        const view = new Adw.ToolbarView();
        view.add_top_bar(new Adw.HeaderBar());
        this.page = new Adw.PreferencesPage();
        view.set_content(this.page);
        this.widget = view;
        this.group = new Adw.PreferencesGroup({
            title: 'Desktops',
            description: 'Each workspace can show its own desktop. You can also right-click the desktop and choose under "This Desktop".',
        });
        this.page.add(this.group);
        this.rows = [];
        this.render();
        for (const [obj, key] of [[this.settings, 'changed::workspace-desktops'], [this.mutter, 'changed::dynamic-workspaces'], [this.wm, 'changed::num-workspaces']])
            obj.connect(key, () => this.render());

        const inst = new Adw.PreferencesGroup({title: 'Instruments desktop', description: 'What the native instruments desktop shows. It draws without starting the app, so it is the lightest live desktop.'});
        for (const [key, title] of [['show-station', 'Ground station'], ['show-vehicle', 'Vehicle'], ['show-instruments', 'Gauges']]) {
            const row = new Adw.SwitchRow({title});
            this.settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
            inst.add(row);
        }
        this.page.add(inst);

        const ws = new Adw.PreferencesGroup({title: 'Workspaces'});
        const link = new Adw.ActionRow({title: 'Workspace settings', subtitle: 'Number of workspaces and how they behave', activatable: true});
        link.add_suffix(new Gtk.Image({icon_name: 'adw-external-link-symbolic'}));
        link.connect('activated', () => GLib.spawn_command_line_async('gnome-control-center multitasking'));
        ws.add(link);
        this.page.add(ws);
    }

    /** Workspaces to offer: the fixed count, or with dynamic workspaces at least four. */
    workspaceCount() {
        const map = this.settings.get_value('workspace-desktops').deep_unpack();
        const configured = Math.max(-1, ...Object.keys(map).map(Number)) + 1;
        if (!this.mutter.get_boolean('dynamic-workspaces')) return Math.max(1, this.wm.get_int('num-workspaces'));
        return Math.max(4, configured);
    }

    render() {
        const map = this.settings.get_value('workspace-desktops').deep_unpack();
        for (const row of this.rows) this.group.remove(row);
        this.rows = [];
        const labels = Gtk.StringList.new(SCENES.map(sc => sc.label));
        for (let i = 0; i < this.workspaceCount(); i++) {
            const current = map[String(i)] ?? 'wallpaper';
            const row = new Adw.ComboRow({title: `Desktop ${i + 1}`, model: labels, selected: Math.max(0, SCENES.findIndex(sc => sc.id === current))});
            row.connect('notify::selected', () => {
                const next = this.settings.get_value('workspace-desktops').deep_unpack();
                const scene = SCENES[row.selected].id;
                if ((next[String(i)] ?? 'wallpaper') === scene) return;
                if (scene === 'wallpaper') delete next[String(i)];
                else next[String(i)] = scene;
                this.settings.set_value('workspace-desktops', new GLib.Variant('a{ss}', next));
            });
            this.group.add(row);
            this.rows.push(row);
        }
    }
}

/** ArduDeck Settings window: a GNOME Settings style sidebar with pages. */
class SettingsWindow {
    constructor(app, pageId) {
        this.win = new Adw.ApplicationWindow({application: app, title: 'ArduDeck Settings', default_width: 900, default_height: 680});
        this.toasts = new Adw.ToastOverlay();
        this.link = new LinkPage(this.win, this.toasts);
        this.desktops = new DesktopsPage();
        const pages = [
            {id: 'link', title: 'Vehicle Link', icon: 'network-wireless-symbolic', widget: this.link.widget},
            {id: 'desktops', title: 'Desktops', icon: 'preferences-desktop-wallpaper-symbolic', widget: this.desktops.widget},
        ];

        const split = new Adw.NavigationSplitView({min_sidebar_width: 220});
        const list = new Gtk.ListBox({css_classes: ['navigation-sidebar']});
        for (const p of pages) {
            const box = new Gtk.Box({spacing: 12, margin_top: 6, margin_bottom: 6, margin_start: 6});
            box.append(new Gtk.Image({icon_name: p.icon}));
            box.append(new Gtk.Label({label: p.title, xalign: 0}));
            list.append(box);
        }
        const sidebarView = new Adw.ToolbarView();
        sidebarView.add_top_bar(new Adw.HeaderBar({title_widget: new Adw.WindowTitle({title: 'ArduDeck Settings'})}));
        sidebarView.set_content(list);
        split.set_sidebar(new Adw.NavigationPage({title: 'ArduDeck Settings', child: sidebarView}));

        // One NavigationPage per page, created once: a widget can only have one parent.
        const navPages = pages.map(p => new Adw.NavigationPage({title: p.title, child: p.widget, tag: p.id}));
        const show = (i) => {
            if (split.get_content() !== navPages[i]) split.set_content(navPages[i]);
            split.show_content = true;
        };
        list.connect('row-selected', (_l, row) => row && show(row.get_index()));
        const start = Math.max(0, pages.findIndex(p => p.id === pageId));
        list.select_row(list.get_row_at_index(start));

        this.toasts.set_child(split);
        this.win.set_content(this.toasts);
    }
}

const app = new Adw.Application({application_id: APP_ID, flags: Gio.ApplicationFlags.HANDLES_COMMAND_LINE});
let requestedPage = 'link';
app.connect('command-line', (_a, cmd) => {
    for (const arg of cmd.get_arguments()) {
        const m = /^--page=(\w+)$/.exec(arg);
        if (m) requestedPage = m[1];
    }
    app.activate();
    return 0;
});
app.connect('activate', () => {
    const existing = app.get_active_window();
    if (existing) {
        existing.present();
        return;
    }
    const w = new SettingsWindow(app, requestedPage);
    w.win.present();
    void w.link.refresh(true);
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
