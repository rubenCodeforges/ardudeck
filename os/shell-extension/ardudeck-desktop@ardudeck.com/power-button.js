// The power button locks the screen and turns the display off, like a phone
// or tablet, instead of suspending: a ground station keeps its vehicle link
// and telemetry running with the screen dark. GNOME's media-keys service must
// not hold the key itself (its power-static binding is cleared on ArduDeck OS).
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const KEYBINDING = 'power-button-screen-off';
const DISPLAY_ON = 0;
const DISPLAY_OFF = 3;
/** The power key's own release counts as activity; wait past it before watching for a wake. */
const WAKE_WATCH_DELAY_MS = 600;

function setDisplayPower(mode) {
    Gio.DBus.session.call(
        'org.gnome.Mutter.DisplayConfig', '/org/gnome/Mutter/DisplayConfig',
        'org.freedesktop.DBus.Properties', 'Set',
        new GLib.Variant('(ssv)', ['org.gnome.Mutter.DisplayConfig', 'PowerSaveMode', new GLib.Variant('i', mode)]),
        null, Gio.DBusCallFlags.NONE, -1, null, null);
}

export class PowerButtonScreenOff {
    constructor(settings) {
        this._off = false;
        this._idleMonitor = global.backend.get_core_idle_monitor();
        this._wakeWatch = 0;
        this._delay = 0;
        Main.wm.addKeybinding(KEYBINDING, settings, Meta.KeyBindingFlags.IGNORE_AUTOREPEAT, Shell.ActionMode.ALL,
            () => (this._off ? this._turnOn() : this._turnOff()));
    }

    _turnOff() {
        this._off = true;
        if (Main.screenShield && !Main.sessionMode.isLocked) Main.screenShield.lock(false);
        setDisplayPower(DISPLAY_OFF);
        this._delay = GLib.timeout_add(GLib.PRIORITY_DEFAULT, WAKE_WATCH_DELAY_MS, () => {
            this._delay = 0;
            this._wakeWatch = this._idleMonitor.add_user_active_watch(() => {
                this._wakeWatch = 0;
                this._turnOn();
            });
            return GLib.SOURCE_REMOVE;
        });
    }

    _turnOn() {
        this._clearWatches();
        this._off = false;
        setDisplayPower(DISPLAY_ON);
    }

    _clearWatches() {
        if (this._delay) GLib.source_remove(this._delay);
        this._delay = 0;
        if (this._wakeWatch) this._idleMonitor.remove_watch(this._wakeWatch);
        this._wakeWatch = 0;
    }

    destroy() {
        this._clearWatches();
        Main.wm.removeKeybinding(KEYBINDING);
        if (this._off) setDisplayPower(DISPLAY_ON);
    }
}
