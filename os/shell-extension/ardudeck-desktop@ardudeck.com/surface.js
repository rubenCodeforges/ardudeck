// Turns the ArduDeck desktop surface (the app started with --desktop-surface)
// into the desktop itself: sticky on every workspace, sized to the work area,
// kept beneath every other window in both the paint order and Mutter's input
// stack, and left out of the Activities overview. The approach is the one
// Desktop Icons NG uses for its desktop window on Wayland.
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Workspace} from 'resource:///org/gnome/shell/ui/workspace.js';
import {InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';

export const SURFACE_TITLE = 'ArduDeck Desktop Surface';

export class DesktopSurfaceManager {
    constructor(onChange) {
        this._onChange = onChange; // called with true/false when the surface appears/goes
        this._window = null;
        this._windowIds = [];
        this._signals = [];
        this._injections = new InjectionManager();

        // Hide the surface from the Activities overview like the real desktop.
        const isSurface = w => this._isSurface(w);
        this._injections.overrideMethod(Workspace.prototype, '_isOverviewWindow', original => function (window) {
            if (isSurface(window)) return false;
            return original.call(this, window);
        });

        this._signals.push([global.display, global.display.connect('window-created', (_d, w) => this._watch(w))]);
        this._signals.push([global.display, global.display.connect('restacked', () => this._keepBelow())]);
        this._signals.push([Main.layoutManager, Main.layoutManager.connect('monitors-changed', () => this._fit())]);
        for (const actor of global.get_window_actors()) this._watch(actor.meta_window);
    }

    get active() {
        return this._window !== null;
    }

    _isSurface(w) {
        return !!w && w === this._window;
    }

    _watch(w) {
        if (!w) return;
        const check = () => {
            if (!this._window && w.get_title() === SURFACE_TITLE) this._adopt(w);
        };
        // Electron sets the title after the window maps; listen until it matches.
        const id = w.connect('notify::title', check);
        const unmanaged = w.connect('unmanaged', () => {
            w.disconnect(id);
            w.disconnect(unmanaged);
            if (this._window === w) this._release();
        });
        check();
    }

    _adopt(w) {
        this._window = w;
        this._windowIds = [
            w.connect('raised', () => this._keepBelow()),
            w.connect('focus', () => this._keepBelow()),
        ];
        w.stick();
        this._fit();
        this._keepBelow();
        this._onChange?.(true);
    }

    _release() {
        this._window = null;
        this._windowIds = [];
        this._onChange?.(false);
    }

    /** Fill the primary monitor's work area (below the top bar, above a docked keyboard). */
    _fit() {
        const w = this._window;
        if (!w) return;
        const area = Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);
        w.move_resize_frame(false, area.x, area.y, area.width, area.height);
    }

    /** Lowest in Mutter's stack (input) and just above the wallpaper (painting). */
    _keepBelow() {
        const w = this._window;
        if (!w || this._restacking) return;
        this._restacking = true;
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._restacking = false;
            if (this._window !== w) return GLib.SOURCE_REMOVE;
            w.lower();
            const actor = w.get_compositor_private();
            const bg = Main.layoutManager._backgroundGroup;
            if (actor && actor.get_parent() === global.window_group && bg.get_parent() === global.window_group)
                global.window_group.set_child_above_sibling(actor, bg);
            return GLib.SOURCE_REMOVE;
        });
    }

    destroy() {
        for (const [obj, id] of this._signals) obj.disconnect(id);
        this._signals = [];
        if (this._window) for (const id of this._windowIds) this._window.disconnect(id);
        this._window = null;
        this._injections.clear();
    }
}

