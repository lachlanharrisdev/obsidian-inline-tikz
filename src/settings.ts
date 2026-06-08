import { App, PluginSettingTab, Setting } from "obsidian";
import type TikzPlugin from "./main";
import type { ColorMode } from "./utils";

export interface TikzPluginSettings {
    colorMode: ColorMode;
}

export const DEFAULT_SETTINGS: TikzPluginSettings = {
    colorMode: "auto",
};

export class TikzSettingTab extends PluginSettingTab {
    plugin: TikzPlugin;

    constructor(app: App, plugin: TikzPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName("Color mode")
            .setDesc(
                "How uncolored diagram elements adapt to your theme. Auto mode follows your current Obsidian theme.",
            )
            .addDropdown((dropdown) =>
                dropdown
                    .addOption("auto", "Auto (follow theme)")
                    .addOption("light", "Light")
                    .addOption("dark", "Dark")
                    .setValue(this.plugin.settings.colorMode)
                    .onChange(async (value) => {
                        this.plugin.settings.colorMode = value as ColorMode;
                        await this.plugin.saveSettings();
                    }),
            );

        void this.renderCacheSettings(containerEl);
    }

    private async renderCacheSettings(containerEl: HTMLElement): Promise<void> {
        const stats = await this.plugin.cache.getStats();

        new Setting(containerEl)
            .setName("Cached diagrams")
            .setDesc(`${stats.count} diagram(s) cached on disk`)
            .addButton((btn) =>
                btn
                    .setButtonText("Clear cache")
                    .setCta()
                    .onClick(async () => {
                        await this.plugin.cache.clear();
                        // eslint-disable-next-line @typescript-eslint/no-deprecated -- display() is the only compatible API for minAppVersion 0.15.0
                        this.display();
                    }),
            );
    }
}
