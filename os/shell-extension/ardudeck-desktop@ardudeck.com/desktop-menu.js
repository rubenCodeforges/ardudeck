// ArduDeck section in GNOME's own desktop right-click / long-press menu (the
// one with "Change Background…"): choose what this workspace's desktop shows,
// and shortcuts to ArduDeck Settings and the app.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {LayoutManager} from 'resource:///org/gnome/shell/ui/layout.js';
import {InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';

export const SCENES = [
    ['map-svt', 'Live Map and Synthetic Vision'],
    ['map', 'Live Map'],
    ['svt', 'Synthetic Vision'],
    ['instruments', 'Instruments'],
    ['wallpaper', 'Wallpaper'],
];

/** Scene for a workspace index; workspaces not configured show the wallpaper. */
export function sceneForWorkspace(settings, index) {
    const map = settings.get_value('workspace-desktops').deep_unpack();
    return map[String(index)] ?? 'wallpaper';
}

export function setSceneForWorkspace(settings, index, scene) {
    const map = settings.get_value('workspace-desktops').deep_unpack();
    if (scene === 'wallpaper') delete map[String(index)];
    else map[String(index)] = scene;
    settings.set_value('workspace-desktops', new GLib.Variant('a{ss}', map));
}

function launch(id, args = []) {
    const app = Gio.DesktopAppInfo.new(id);
    if (!app) {
        Main.notify('ArduDeck', `${id} is not installed`);
        return;
    }
    if (args.length) {
        // Open a specific page: the settings app takes it as a command-line argument.
        const exec = app.get_commandline().replace(/%[uUfF]/g, '').trim();
        GLib.spawn_command_line_async(`${exec} ${args.map(a => GLib.shell_quote(a)).join(' ')}`);
    } else {
        app.launch([], null);
    }
}

export class DesktopMenu {
    constructor(settings) {
        this._settings = settings;
        this._sections = new Map(); // BackgroundMenu -> {section, items}
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
        const ws = () => global.workspace_manager.get_active_workspace_index();
        const header = new PopupMenu.PopupSeparatorMenuItem('This Desktop');
        section.addMenuItem(header);
        const items = SCENES.map(([scene, label]) => {
            const item = new PopupMenu.PopupMenuItem(label);
            item.connect('activate', () => setSceneForWorkspace(this._settings, ws(), scene));
            section.addMenuItem(item);
            return [scene, item];
        });
        section.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        section.addAction('Desktop Settings', () => launch('com.ardudeck.Settings.desktop', ['--page=desktops']));
        section.addAction('Vehicle Link Settings', () => launch('com.ardudeck.Settings.desktop', ['--page=link']));
        section.addAction('Open ArduDeck', () => launch('ardudeck.desktop'));
        menu.addMenuItem(section, 0);

        // Mark the current choice each time the menu opens (workspace may differ).
        menu.connect('open-state-changed', (_m, open) => {
            if (!open) return;
            const current = sceneForWorkspace(this._settings, ws());
            header.label.text = `Desktop ${ws() + 1}`;
            for (const [scene, item] of items)
                item.setOrnament(scene === current ? PopupMenu.Ornament.CHECK : PopupMenu.Ornament.NONE);
        });
        this._sections.set(menu, section);
        menu.connect('destroy', () => this._sections.delete(menu));
    }

    destroy() {
        this._injections.clear();
        for (const section of this._sections.values()) section.destroy();
        this._sections.clear();
    }
}
