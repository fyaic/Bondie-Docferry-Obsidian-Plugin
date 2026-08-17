import { Notice, Plugin, requestUrl } from "obsidian";

import {
  configureSessionStorage,
  getSessionToken,
  matchesCompletedLoginState,
  matchesPendingLoginState,
  normalizeLoginCode,
  normalizeLoginState,
  type SessionSecretStorage,
} from "./auth/session";
import { BONDIE_DISPLAY_NAME, BONDIE_VIEW_TYPE } from "./constants";
import {
  BondieDocferrySettingTab,
  DEFAULT_SETTINGS,
  normalizeDefaultFolder,
  normalizeImportFolder,
  normalizePendingParse,
  normalizeServerUrl,
  type BondieDocferrySettings,
} from "./settings";
import { normalizeLocalHistory } from "./state/localHistory";
import {
  createClientInstanceId,
  normalizeClientInstanceId,
} from "./state/clientInstance";
import { BondieHomeView } from "./views/BondieHomeView";

export default class BondieDocferryPlugin extends Plugin {
  settings: BondieDocferrySettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    await this.loadSettings();
    const appWithSecretStorage = this.app as typeof this.app & {
      secretStorage: SessionSecretStorage;
    };
    configureSessionStorage(appWithSecretStorage.secretStorage);

    this.registerView(BONDIE_VIEW_TYPE, (leaf) => new BondieHomeView(leaf, this));

    this.addRibbonIcon("ship", BONDIE_DISPLAY_NAME, () => this.openHome());

    this.addCommand({
      id: "open-home",
      name: "Open home",
      callback: () => this.openHome(),
    });

    if (this.settings.debugMode) {
      this.addCommand({
        id: "check-server",
        name: "Check server",
        callback: () => this.checkServer(),
      });
    }

    this.addSettingTab(new BondieDocferrySettingTab(this.app, this));

    this.registerObsidianProtocolHandler("bondie-docferry-auth", async (params) => {
      await this.handleAuthCallback(params);
    });

    const ownerDocument = this.app.workspace.containerEl.ownerDocument;
    this.registerDomEvent(ownerDocument, "visibilitychange", () => {
      if (ownerDocument.visibilityState !== "visible") return;
      const leaf = this.app.workspace.getLeavesOfType(BONDIE_VIEW_TYPE)[0];
      if (leaf?.view instanceof BondieHomeView) {
        leaf.view.resumeFromForeground();
      }
    });
  }

  onunload(): void {
    // Obsidian handles registered commands and UI cleanup.
  }

  async loadSettings(): Promise<void> {
    const loaded = (await this.loadData()) as Partial<BondieDocferrySettings> | null;
    const serverUrl = normalizeServerUrl(loaded?.serverUrl, loaded?.debugMode === true);
    const defaultFolder = normalizeDefaultFolder(loaded?.defaultFolder);
    const importFolder = normalizeImportFolder(loaded?.importFolder);
    const clientInstanceId = normalizeClientInstanceId(loaded?.clientInstanceId) ?? createClientInstanceId();
    const localHistory = normalizeLocalHistory(loaded?.localHistory);
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...loaded,
      autoSave: false,
      clientInstanceId,
      defaultFolder,
      defaultLanguage: "source",
      importFolder,
      localHistory,
      pendingParse: normalizePendingParse(loaded?.pendingParse),
      serverUrl,
    };

    if (
      loaded?.serverUrl !== serverUrl ||
      loaded?.autoSave === true ||
      loaded?.clientInstanceId !== clientInstanceId ||
      loaded?.defaultFolder !== defaultFolder ||
      loaded?.defaultLanguage !== "source" ||
      loaded?.importFolder !== importFolder ||
      JSON.stringify(loaded?.localHistory ?? []) !== JSON.stringify(localHistory)
    ) {
      await this.saveData(this.settings);
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  openSettings(): void {
    const appWithSettings = this.app as typeof this.app & {
      setting?: { open(): void; openTabById(id: string): void };
    };
    if (!appWithSettings.setting) {
      new Notice("Open Obsidian settings and choose MediaFerry.");
      return;
    }
    appWithSettings.setting.open();
    appWithSettings.setting.openTabById(this.manifest.id);
  }

  async openHome(): Promise<void> {
    const existingLeaf = this.app.workspace.getLeavesOfType(BONDIE_VIEW_TYPE)[0];

    if (existingLeaf) {
      if (existingLeaf.view instanceof BondieHomeView) {
        existingLeaf.view.refresh();
      }
      await this.app.workspace.revealLeaf(existingLeaf);
      return;
    }

    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({
      active: true,
      type: BONDIE_VIEW_TYPE,
    });
    await this.app.workspace.revealLeaf(leaf);
  }

  async checkServer(): Promise<void> {
    const url = `${this.settings.serverUrl.replace(/\/+$/, "")}/v0/health`;

    try {
      const response = await requestUrl({ url });
      const ok = response.status >= 200 && response.status < 300;
      new Notice(ok ? "MediaFerry server is reachable." : `Server returned ${response.status}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      new Notice(`Server check failed: ${message}`);
    }
  }

  private async handleAuthCallback(params: Record<string, string>): Promise<void> {
    const code = normalizeLoginCode(params.code ?? "");
    const state = normalizeLoginState(params.state ?? "");
    if (!code || !state) {
      new Notice("Sign-in could not return safely. Please try again from MediaFerry.");
      return;
    }
    if (!matchesPendingLoginState(state)) {
      if (getSessionToken() && await matchesCompletedLoginState(state)) {
        await this.openHome();
        return;
      }
      new Notice("Sign-in could not return safely. Please try again from MediaFerry.");
      return;
    }

    await this.openHome();
    const leaf = this.app.workspace.getLeavesOfType(BONDIE_VIEW_TYPE)[0];
    if (leaf?.view instanceof BondieHomeView) {
      await leaf.view.completeLoginCode(code, state);
    }
  }
}
