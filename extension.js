/* extension.js
 *
 * Vantage Controls - A GNOME Shell Extension
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import { QuickToggle, SystemIndicator } from 'resource:///org/gnome/shell/ui/quickSettings.js';

const CONTROLS = loadControls();

function loadControls() {
    // Need help fixing that defining extension path with better a way
    const filePath = GLib.build_filenamev([`${GLib.get_current_dir()}/.local/share/gnome-shell/extensions/vantage-controls@oezturk.github.io`, 'controls.json']);

    let [ok, contents] = GLib.file_get_contents(filePath);

    if (!ok) {
        logError(new Error(`Failed to read controls.json: ${contents}`));
        return {};
    }

    try {
        return JSON.parse(contents.toString()).controls;
    } catch (e) {
        logError(new Error(`Failed to parse controls.json: ${e}`));
        return {};
    }
}

function getState(controlType) {
    const path = CONTROLS[controlType].path;
    try {
        let [ok, out] = GLib.file_get_contents(path);
        return ok && out.toString().trim() === '1';
    } catch (e) {
        logError(e);
        return false;
    }
}

function setControl(controlType, enabled) {
    const path = CONTROLS[controlType].path;
    let command = enabled ? `echo 1 | sudo tee ${path}` : `echo 0 | sudo tee ${path}`;
    log(`Setting ${controlType} to: ${enabled}`);

    const success = GLib.spawn_command_line_async(`bash -c '${command}'`);

    if (!success) {
        logError(new Error('Failed to spawn command'));
    } else {
        log('Command executed successfully');
    }
}

const ControlToggle = GObject.registerClass(
class ControlToggle extends QuickToggle {
    _init(controlType) {
        const control = CONTROLS[controlType];
        super._init({
            title: _(control.titleKey), // Translate the title using the key
            iconName: control.icon,
            toggleMode: true,
        });

        this.controlType = controlType;
        this.checked = getState(controlType);
        this.connect('clicked', () => this.onToggle());
    }

    onToggle() {
        setControl(this.controlType, this.checked); // Set the control based on the state
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
            this.checked = getState(this.controlType); // Refresh the checked state
            return GLib.SOURCE_REMOVE; // Remove the timeout
        });
    }
});

const ControlIndicator = GObject.registerClass(
    class ControlIndicator extends SystemIndicator {
        _init(controlType) {
            super._init();
    
            this._indicator = this._addIndicator();
            const control = CONTROLS[controlType];
            this._indicator.iconName = control.icon;
    
            // Set the visibility of the indicator based on the control's indicator property
            this._indicator.visible = control.indicator;
    
            const toggle = new ControlToggle(controlType);
            toggle.bind_property('checked',
                this._indicator, 'visible',
                GObject.BindingFlags.SYNC_CREATE);
    
            // Manually update the indicator visibility when the toggle state changes
            toggle.connect('notify::checked', () => {
                this._indicator.visible = toggle.checked ? control.indicator : false; // Control visibility
            });
    
            this.quickSettingsItems.push(toggle);
        }
    });

export default class ConservationExtension extends Extension {
    enable() {
        Object.keys(CONTROLS).forEach(controlType => {
            const indicator = new ControlIndicator(controlType);
            Main.panel.statusArea.quickSettings.addExternalIndicator(indicator);
        });
    }

    disable() {
        Main.panel.statusArea.quickSettings.quickSettingsItems.forEach(item => {
            item.quickSettingsItems.forEach(t => t.destroy());
            item.destroy();
        });
    }
}
