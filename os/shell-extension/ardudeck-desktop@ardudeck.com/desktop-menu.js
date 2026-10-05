// ArduDeck section in GNOME's own desktop right-click / long-press menu (the
// one with "Change Background…"): switches for each desktop widget and
// shortcuts to Vehicle Link settings and the app.
import Gio from 'gi://Gio';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {LayoutManager} from 'resource:///org/gnome/shell/ui/layout.js';
import {InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';

const SURFACE_UNIT = 'ardudeck-desktop-surface.service';
const WIDGETS = [
    ['show-surface', 'Live Map and Synthetic Vision'],
    ['show-station', 'Ground Station'],
    ['show-vehicle', 'Vehicle'],
    ['show-instruments', 'Instruments'],
];

function launch(id) {
    const app = Gio.DesktopAppInfo.new(id);
    if (app) app.launch([], null);
    else Main.notify('ArduDeck', `${id} is not installed`);
}

/** Start/stop the surface's systemd user unit and keep it enabled to match. */
export function applySurfaceSetting(enabled) {
    const verb = enabled ? ['enable', '--now'] : ['disable', '--now'];
    try {
        Gio.Subprocess.new(['systemctl', '--user', ...verb, SURFACE_UNIT], Gio.SubprocessFlags.STDERR_SILENCE);
    } catch (e) {
        logError(e, 'ArduDeck: could not switch the desktop surface');
    }
}

export class DesktopMenu {
    constructor(settings) {
        this._settings = settings;
        this._sections = new Map(); // BackgroundMenu -> section
        this._injections = new InjectionManager();

        // Backgrounds (and their menus) are rebuilt on monitor and wallpaper
        // changes; add the section every time GNOME adds a menu.
        const self = this;
        this._injections.overrideMethod(LayoutManager.prototype, '_addBackgroundMenu', original => function (bgManager) {
            original.call(this, bgManager);
            self._decorate(bgManager.backgroundActor?._backgroundMenu);
        });
        for (const bg of Main.layoutManager._bgManagers ?? [])
            this._decorate(bg.backgroundActor?._backgroundMenu);
    }

    _decorate(menu) {
        if (!menu || this._sections.has(menu)) return;
        const section = new PopupMenu.PopupMenuSection();
        section.addMenuItem(new PopupMenu.PopupSeparatorMenuItem('ArduDeck'));
        for (const [key, label] of WIDGETS) {
            const item = new PopupMenu.PopupSwitchMenuItem(label, this._settings.get_boolean(key));
            item.connect('toggled', (_i, state) => this._settings.set_boolean(key, state));
            const id = this._settings.connect(`changed::${key}`, () => item.setToggleState(this._settings.get_boolean(key)));
            item.connect('destroy', () => this._settings.disconnect(id));
            section.addMenuItem(item);
        }
        section.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        section.addAction('Vehicle Link Settings', () => launch('com.ardudeck.LinkSettings.desktop'));
        section.addAction('Open ArduDeck', () => launch('ardudeck.desktop'));
        menu.addMenuItem(section, 0);
        this._sections.set(menu, section);
        menu.connect('destroy', () => this._sections.delete(menu));
    }

    destroy() {
        this._injections.clear();
        for (const section of this._sections.values()) section.destroy();
        this._sections.clear();
    }
}
