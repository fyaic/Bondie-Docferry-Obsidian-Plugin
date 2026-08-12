import {
  App,
  Notice,
  PluginSettingTab,
  Setting,
  type ButtonComponent,
  type SettingDefinitionItem,
} from "obsidian";

import type BondieDocferryPlugin from "./main";
import type { LocalHistoryItem } from "./state/localHistory";
import { validateVaultRelativePath } from "./vault/vaultPath";

export interface BondieDocferrySettings {
  autoSave: boolean;
  clientInstanceId: string;
  debugMode: boolean;
  defaultFolder: string;
  importFolder: string;
  defaultLanguage: string;
  defaultTemplate: string;
  localHistory: LocalHistoryItem[];
  onboardingCompleted: boolean;
  pendingParse: PendingParseRequest | null;
  serverUrl: string;
}

export interface PendingParseRequest {
  createdAt: string;
  jobId?: string;
  language: string;
  requestKey: string;
  sourceUrl: string;
  template: string;
}

export const PRODUCTION_SERVER_URL = "https://bondie-docferry.bondie.io";

export const DEFAULT_SETTINGS: BondieDocferrySettings = {
  autoSave: false,
  clientInstanceId: "",
  debugMode: false,
  defaultFolder: "Bondie Docferry",
  importFolder: "Bondie Docferry/Imports",
  defaultLanguage: "source",
  defaultTemplate: "default-video-brief",
  localHistory: [],
  onboardingCompleted: false,
  pendingParse: null,
  serverUrl: PRODUCTION_SERVER_URL,
};

export function normalizeDefaultFolder(value: unknown): string {
  const candidate = typeof value === "string" && value.trim()
    ? value.trim()
    : DEFAULT_SETTINGS.defaultFolder;
  try {
    return validateVaultRelativePath(candidate, "Save folder");
  } catch {
    return DEFAULT_SETTINGS.defaultFolder;
  }
}

export function normalizeImportFolder(value: unknown): string {
  const candidate = typeof value === "string" && value.trim()
    ? value.trim()
    : DEFAULT_SETTINGS.importFolder;
  try {
    return validateVaultRelativePath(candidate, "Import folder");
  } catch {
    return DEFAULT_SETTINGS.importFolder;
  }
}

export function normalizePendingParse(value: unknown): PendingParseRequest | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<PendingParseRequest>;
  if (
    typeof candidate.createdAt !== "string" ||
    (candidate.jobId !== undefined && typeof candidate.jobId !== "string") ||
    typeof candidate.language !== "string" ||
    typeof candidate.requestKey !== "string" ||
    typeof candidate.sourceUrl !== "string" ||
    typeof candidate.template !== "string"
  ) {
    return null;
  }
  const createdAt = new Date(candidate.createdAt);
  if (Number.isNaN(createdAt.getTime()) || Date.now() - createdAt.getTime() > 24 * 60 * 60 * 1000) {
    return null;
  }
  return candidate as PendingParseRequest;
}

export function normalizeServerUrl(value: unknown, allowLoopback = false): string {
  if (typeof value !== "string" || !value.trim()) {
    return PRODUCTION_SERVER_URL;
  }

  const normalized = value.trim().replace(/\/+$/, "");
  try {
    const url = new URL(normalized);
    const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1", "10.0.2.2"]);
    const isLoopback = loopbackHosts.has(url.hostname);
    if (url.username || url.password || url.search || url.hash) {
      return PRODUCTION_SERVER_URL;
    }
    if (url.pathname !== "/" && url.pathname !== "") {
      return PRODUCTION_SERVER_URL;
    }
    if (url.protocol === "https:") {
      return url.origin;
    }
    if (url.protocol === "http:" && allowLoopback && isLoopback) {
      return url.origin;
    }
    return PRODUCTION_SERVER_URL;
  } catch {
    return PRODUCTION_SERVER_URL;
  }
}

export class BondieDocferrySettingTab extends PluginSettingTab {
  plugin: BondieDocferryPlugin;

  constructor(app: App, plugin: BondieDocferryPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      {
        type: "group",
        heading: "Notes",
        items: [
          {
            name: "Generated notes folder",
            desc: "New notes created from media links are saved here.",
            render: (setting) => this.addGeneratedFolderControl(setting),
          },
          {
            name: "Imported notes folder",
            desc: "Notes brought in from DocFerry shares are saved here.",
            render: (setting) => this.addImportFolderControl(setting),
          },
          {
            name: "Local duplicate index",
            desc: "Clear minimized link records used to avoid duplicate saves. Vault files are not changed.",
            render: (setting) => this.addClearHistoryControl(setting),
          },
          {
            name: "Welcome guide",
            desc: "Show the short first-use guide again on the home page.",
            render: (setting) => this.addWelcomeGuideControl(setting),
          },
        ],
      },
      {
        type: "group",
        heading: "Developer",
        visible: () => this.plugin.settings.debugMode,
        items: [
          {
            name: "Developer mode",
            desc: "Disable development-only server controls.",
            render: (setting) => this.addDeveloperModeControl(setting, () => this.refreshDefinitions()),
          },
          {
            name: "Server URL",
            desc: "Development override. Production is restored when debug mode is disabled.",
            render: (setting) => this.addServerUrlControl(setting),
          },
        ],
      },
    ];
  }

  display(): void {
    this.renderLegacy();
  }

  private renderLegacy(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("bondie-docferry-settings");

    new Setting(containerEl).setName("Notes").setHeading();

    new Setting(containerEl)
      .setName("Generated notes folder")
      .setDesc("New notes created from media links are saved here.")
      .then((setting) => this.addGeneratedFolderControl(setting));

    new Setting(containerEl)
      .setName("Imported notes folder")
      .setDesc("Notes brought in from DocFerry shares are saved here.")
      .then((setting) => this.addImportFolderControl(setting));

    new Setting(containerEl)
      .setName("Local duplicate index")
      .setDesc("Clear minimized link records used to avoid duplicate saves. Vault files are not changed.")
      .then((setting) => this.addClearHistoryControl(setting));

    new Setting(containerEl)
      .setName("Welcome guide")
      .setDesc("Show the short first-use guide again on the home page.")
      .then((setting) => this.addWelcomeGuideControl(setting));

    if (this.plugin.settings.debugMode) {
      new Setting(containerEl).setName("Developer").setHeading();

      new Setting(containerEl)
        .setName("Developer mode")
        .setDesc("Disable development-only server controls.")
        .then((setting) => this.addDeveloperModeControl(setting, () => this.renderLegacy()));

      new Setting(containerEl)
        .setName("Server URL")
        .setDesc("Development override. Production is restored when debug mode is disabled.")
        .then((setting) => this.addServerUrlControl(setting));
    }
  }

  private addGeneratedFolderControl(setting: Setting): void {
    setting.addText((text) => {
      let draft = this.plugin.settings.defaultFolder;
      const commit = async (): Promise<void> => {
        const candidate = draft.trim() || DEFAULT_SETTINGS.defaultFolder;
        const normalized = normalizeDefaultFolder(candidate);
        this.plugin.settings.defaultFolder = normalized;
        if (normalized !== candidate) {
          new Notice("That folder name cannot be used. The default save folder was restored.");
        }
        text.setValue(normalized);
        await this.plugin.saveSettings();
      };
      text.setPlaceholder(DEFAULT_SETTINGS.defaultFolder).setValue(draft).onChange((value) => {
        draft = value;
      });
      commitTextOnBlur(text.inputEl, commit);
    });
  }

  private addImportFolderControl(setting: Setting): void {
    setting.addText((text) => {
      let draft = this.plugin.settings.importFolder;
      const commit = async (): Promise<void> => {
        const candidate = draft.trim() || DEFAULT_SETTINGS.importFolder;
        const normalized = normalizeImportFolder(candidate);
        this.plugin.settings.importFolder = normalized;
        if (normalized !== candidate) {
          new Notice("That folder name cannot be used. The default import folder was restored.");
        }
        text.setValue(normalized);
        await this.plugin.saveSettings();
      };
      text.setPlaceholder(DEFAULT_SETTINGS.importFolder).setValue(draft).onChange((value) => {
        draft = value;
      });
      commitTextOnBlur(text.inputEl, commit);
    });
  }

  private addClearHistoryControl(setting: Setting): void {
    setting.addButton((button) => {
      markButtonDestructive(button);
      button.setButtonText("Clear").onClick(async () => {
        this.plugin.settings.localHistory = [];
        await this.plugin.saveSettings();
        new Notice("Local duplicate index cleared. Vault files were not changed.");
      });
    });
  }

  private addWelcomeGuideControl(setting: Setting): void {
    setting.addButton((button) => button.setButtonText("Show again").onClick(async () => {
      this.plugin.settings.onboardingCompleted = false;
      await this.plugin.saveSettings();
      await this.plugin.openHome();
      new Notice("The welcome guide is ready on home.");
    }));
  }

  private addDeveloperModeControl(setting: Setting, rerender: () => void): void {
    setting.addToggle((toggle) => toggle.setValue(true).onChange(async (value) => {
      this.plugin.settings.debugMode = value;
      this.plugin.settings.serverUrl = normalizeServerUrl(this.plugin.settings.serverUrl, value);
      await this.plugin.saveSettings();
      rerender();
    }));
  }

  private addServerUrlControl(setting: Setting): void {
    setting.addText((text) => {
      let draft = this.plugin.settings.serverUrl;
      const commit = async (): Promise<void> => {
        const normalized = normalizeServerUrl(draft, true);
        this.plugin.settings.serverUrl = normalized;
        text.setValue(normalized);
        if (normalized !== draft.trim().replace(/\/+$/, "")) {
          new Notice("The server address was invalid. Using the production server.");
        }
        await this.plugin.saveSettings();
      };
      text.setPlaceholder(DEFAULT_SETTINGS.serverUrl).setValue(draft).onChange((value) => {
        draft = value;
      });
      commitTextOnBlur(text.inputEl, commit);
    });
  }

  private refreshDefinitions(): void {
    const update = (this as unknown as Record<string, unknown>)["update"];
    if (typeof update === "function") Reflect.apply(update, this, []);
  }
}

function commitTextOnBlur(input: HTMLInputElement, commit: () => Promise<void>): void {
  input.addEventListener("blur", () => void commit());
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") input.blur();
  });
}

function markButtonDestructive(button: ButtonComponent): void {
  const compatibleButton = button as unknown as { setWarning(): ButtonComponent };
  compatibleButton.setWarning();
}
