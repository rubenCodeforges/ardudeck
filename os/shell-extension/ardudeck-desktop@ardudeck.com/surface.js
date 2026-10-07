// Turns the ArduDeck desktop surfaces (the app started with --desktop-surface,
// one window per workspace titled "ArduDeck Desktop Surface <n>") into those
// workspaces' desktops: pinned to workspace <n>, sized to the work area, kept
// beneath every other window in both the paint order and Mutter's input stack,
// and left out of the Activities overview. Windows on other workspaces and
// windows fully covered are not painted by Mutter, so they stop drawing too.
// The approach is the one Desktop Icons NG uses for its desktop on Wayland.
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Workspace} from 'resource:///org/gnome/shell/ui/workspace.js';
import {InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';

const TITLE_RE = /^ArduDeck Desktop Surface (\d+)$/;

export class DesktopSurfaceManager {
    constructor(onChange) {
        this._onChange = onChange; // called whenever the set of surfaces changes
        this._windows = new Map(); // MetaWindow -> {workspace, ids}
        this._signals = [];
        this._injections = new InjectionManager();
        this._restackPending = false;

        // Hide surfaces from the Activities overview like the real desktop.
        const isSurface = w => this._windows.has(w);
        this._injections.overrideMethod(Workspace.prototype, '_isOverviewWindow', original => function (window) {
            if (isSurface(window)) return false;
            return original.call(this, window);
        });

        this._signals.push([global.display, global.display.connect('window-created', (_d, w) => this._watch(w))]);
        this._signals.push([global.display, global.display.connect('restacked', () => this._keepBelow())]);
        this._signals.push([Main.layoutManager, Main.layoutManager.connect('monitors-changed', () => this._fitAll())]);
        for (const actor of global.get_window_actors()) this._watch(actor.meta_window);
    }

    /** Workspace indexes that currently have a live surface window. */
    workspaces() {
        return new Set([...this._windows.values()].map(v => v.workspace));
    }

    _watch(w) {
        if (!w) return;
        const check = () => {
            const m = TITLE_RE.exec(w.get_title() ?? '');
            if (m && !this._windows.has(w)) this._adopt(w, Number(m[1]));
        };
        // Electron sets the title after the window maps; listen until it matches.
        const id = w.connect('notify::title', check);
        const unmanaged = w.connect('unmanaged', () => {
            w.disconnect(id);
            w.disconnect(unmanaged);
            if (this._windows.has(w)) this._release(w);
        });
        check();
    }

    _adopt(w, workspace) {
        const ids = [
            w.connect('raised', () => this._keepBelow()),
            w.connect('focus', () => this._keepBelow()),
            // A user drag to another workspace is undone: the setting decides.
            w.connect('workspace-changed', () => this._pin(w)),
        ];
        this._windows.set(w, {workspace, ids});
        this._pin(w);
        this._fit(w);
        this._keepBelow();
        this._onChange?.();
    }

    _release(w) {
        this._windows.delete(w);
        this._onChange?.();
    }

    _pin(w) {
        const info = this._windows.get(w);
        if (!info) return;
        if (w.is_on_all_workspaces()) w.unstick();
        const current = w.get_workspace()?.index();
        if (current !== info.workspace) w.change_workspace_by_index(info.workspace, true);
    }

    /** Fill the primary monitor's work area (below the top bar, above a docked keyboard). */
    _fit(w) {
        const area = Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);
        w.move_resize_frame(false, area.x, area.y, area.width, area.height);
    }

    _fitAll() {
        for (const w of this._windows.keys()) this._fit(w);
    }

    /** Lowest in Mutter's stack (input) and just above the wallpaper (painting). */
    _keepBelow() {
        if (this._restackPending || this._windows.size === 0) return;
        this._restackPending = true;
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._restackPending = false;
            const bg = Main.layoutManager._backgroundGroup;
            for (const w of this._windows.keys()) {
                w.lower();
                const actor = w.get_compositor_private();
                if (actor && actor.get_parent() === global.window_group && bg.get_parent() === global.window_group)
                    global.window_group.set_child_above_sibling(actor, bg);
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    destroy() {
        for (const [obj, id] of this._signals) obj.disconnect(id);
        this._signals = [];
        for (const [w, info] of this._windows) for (const id of info.ids) w.disconnect(id);
        this._windows.clear();
        this._injections.clear();
    }
}
