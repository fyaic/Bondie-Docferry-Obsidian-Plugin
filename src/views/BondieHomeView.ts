import {
  App,
  Component,
  ItemView,
  MarkdownRenderer,
  Modal,
  Notice,
  setIcon,
  TFile,
  WorkspaceLeaf,
} from "obsidian";

import { displayNameFromUser, initialsFromDisplayUser } from "../account/displayUser";
import {
  BondieApiError,
  buildLoginUrl,
  exchangeLoginCode,
  exchangePendingLogin,
  fetchAuthSelfCheck,
  fetchWhoami,
  globalLogoutSession,
  logoutSession,
  type AuthSelfCheckResponse,
  type DisplayUser,
  type SynapseHubLinksResponse,
  type TokenExchangeResponse,
  type WhoamiResponse,
} from "../api/auth";
import {
  bootstrapInterconnect,
  fetchInterconnectStatus,
  type InterconnectStatusResponse,
} from "../api/interconnect";
import {
  deleteDocFerryShareRecord,
  fetchDocFerryUsage,
  fetchDocFerryShareDetail,
  fetchDocFerryShares,
  publishDocFerryShare,
  stopDocFerryShare,
  updateDocFerryShareAccess,
  type DocFerryShareAccessUpdate,
  type DocFerryShareDetailResponse,
  type DocFerryShareListItem,
} from "../api/docferry";
import {
  fetchEntitlementSummary,
  type EntitlementSummaryResponse,
} from "../api/entitlements";
import {
  cancelRemoteParseJob,
  createRemoteParseJob,
  deleteRemoteParseJob,
  fetchRemoteParseJob,
  fetchRemoteParseJobs,
  fetchRemoteParseResult,
  retryRemoteParseJob,
  type RemoteParseJob,
  type RemoteParseResult,
} from "../api/parse";
import {
  classifyLinkIntent,
  linkIntentRequiresSession,
} from "../docferry/importContract";
import {
  clearPendingLoginState,
  clearSessionToken,
  createPendingLoginState,
  getPendingLoginState,
  getSessionToken,
  markLoginStateCompleted,
  matchesCompletedLoginState,
  normalizeLoginCode,
  setSessionToken,
} from "../auth/session";
import { BONDIE_DISPLAY_NAME, BONDIE_VIEW_TYPE } from "../constants";
import { parseHttpUrl, type ParseResult } from "../parse/result";
import {
  advanceLocalParseJob,
  createLocalParseJob,
  type LocalParseJob,
  type LocalParseStage,
} from "../parse/parseJob";
import {
  DOCFERRY_CONNECTION_PENDING_MESSAGE,
  parseInterruption,
} from "../parse/errorPolicy";
import { remoteParseCanRetry } from "../parse/retryPolicy";
import {
  shareFailureMessage,
  shareLifecycleFailureMessage,
} from "../shares/errorPolicy";
import {
  DOCFERRY_SHARE_DELETE_CAPABILITY,
  DOCFERRY_SHARE_STOP_CAPABILITY,
  DOCFERRY_SHARE_UPDATE_CAPABILITY,
  shareCanDeleteRecord,
  shareCanManageAccess,
  shareCanStop,
  supportsShareCapability,
} from "../shares/lifecyclePolicy";
import { pendingParseMatchesRemoteJob } from "../parse/pendingParse";
import { getPlatformSnapshot } from "../platform/mobile";
import { getSharePageState } from "../shares/pagination";
import {
  shareLinkIsAvailable,
  shareRequestMatchesActiveResult,
} from "../shares/statusPolicy";
import type BondieDocferryPlugin from "../main";
import type { PendingParseRequest } from "../settings";
import {
  createLocalHistoryItem,
  matchesCaptureHistory,
  upsertLocalHistoryItem,
  type LocalHistoryItem,
} from "../state/localHistory";
import { saveParseResultToVault } from "../vault/saveNote";
import { importDocFerryShareToVault } from "../vault/importDocferryShare";
import {
  createEmptyState,
  createIconButton,
  createIconOnlyButton,
  createSection,
  createStatusPill,
} from "./components";

const LOGIN_COMPLETION_TIMEOUT_MS = 10 * 60 * 1000;
const LOGIN_ATTEMPT_SETTLE_TIMEOUT_MS = 15_000;
const SHARE_PAGE_SIZE = 10;

export class BondieHomeView extends ItemView {
  private accountState: AccountPanelState = {
    kind: "idle",
    message: "Not checked yet.",
  };
  private accountLinks: SynapseHubLinksResponse | null = null;
  private accountRefreshPromise: Promise<void> | null = null;
  private activeJob: LocalParseJob | null = null;
  private activeProgress = 0;
  private activeResult: ParseResult | null = null;
  private activeShareMessage: { kind: "error" | "ready"; text: string } | null = null;
  private activeShareUrl: string | null = null;
  private activeWorkspacePanel: "account" | "home" | "shares" = "home";
  private activityMessage = "";
  private activityState: "idle" | "loading" | "ready" | "error" = "idle";
  private currentUrl = "";
  private cancelRequested = false;
  private docferryAvailable = false;
  private docferryCapabilities = new Set<string>();
  private docferryShares: DocFerryShareListItem[] = [];
  private docferryUsage: { remaining: number; resetsAt: string; used: number } | null = null;
  private isParsing = false;
  private isSaving = false;
  private isSharing = false;
  private importingShareId: string | null = null;
  private linkMessage = "";
  private loginPollGeneration = 0;
  private loginPollAttemptPromise: Promise<void> | null = null;
  private loginPollPromise: Promise<void> | null = null;
  private loginPollState: string | null = null;
  private plugin: BondieDocferryPlugin;
  private previewMarkdownComponent: Component | null = null;
  private parseGeneration = 0;
  private processingExpanded = false;
  private remoteJobs: RemoteParseJob[] = [];
  private shareOffset = 0;
  private shareActionId: string | null = null;
  private shareTotal = 0;
  private sharesMessage = "";
  private sharesState: "idle" | "loading" | "ready" | "error" = "idle";
  private urlInput: HTMLInputElement | null = null;
  private statusEl: HTMLElement | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: BondieDocferryPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return BONDIE_VIEW_TYPE;
  }

  getDisplayText(): string {
    return BONDIE_DISPLAY_NAME;
  }

  getIcon(): string {
    return "ship";
  }

  refresh(): void {
    this.render();
  }

  resumeFromForeground(): void {
    const pendingState = getPendingLoginState();
    if (getSessionToken() || !pendingState) return;
    this.stopLoginCompletionPolling();
    this.accountState = {
      kind: "loading",
      message: "Finishing sign-in.",
    };
    this.render();
    this.startLoginCompletionPolling(pendingState);
  }

  protected async onOpen(): Promise<void> {
    this.render();
    void this.refreshInterconnectAvailability();
    void this.refreshAccountStatus(false).finally(() => {
      const pendingState = getPendingLoginState();
      if (!getSessionToken() && pendingState) {
        this.startLoginCompletionPolling(pendingState);
      }
    });
    void this.resumePendingParse();
  }

  protected async onClose(): Promise<void> {
    this.stopLoginCompletionPolling();
    this.unloadPreviewMarkdown();
    this.urlInput = null;
    this.statusEl = null;
  }

  private render(): void {
    this.unloadPreviewMarkdown();
    const container = this.contentEl;
    container.empty();
    container.addClass("bondie-docferry-view");

    const shell = container.createDiv({ cls: "bdf-shell" });
    this.renderPrimaryNav(shell);
    if (this.activeWorkspacePanel === "account") {
      this.renderAccountPanel(shell);
      return;
    }
    if (this.activeWorkspacePanel === "shares") {
      this.renderSharesPanel(shell);
      return;
    }
    this.renderCapture(shell);
    if (!getSessionToken()) return;
    if (!this.plugin.settings.onboardingCompleted) this.renderOnboarding(shell);
    this.renderPreview(shell);
  }

  private renderPrimaryNav(parent: HTMLElement): void {
    const toolbar = parent.createDiv({ cls: "bdf-primary-toolbar" });
    const nav = toolbar.createDiv({ cls: "bdf-primary-nav" });
    nav.setAttr("role", "tablist");
    const tabs: Array<{
      icon: string;
      id: "account" | "home" | "shares";
      label: string;
    }> = [
      { icon: "link-2", id: "home", label: "Home" },
      { icon: "share-2", id: "shares", label: "Shares" },
      { icon: "user-round", id: "account", label: "Account" },
    ];
    for (const tab of tabs) {
      const button = createIconButton(nav, tab.icon, tab.label, () => {
        this.activeWorkspacePanel = tab.id;
        this.render();
        this.contentEl.scrollTo({ top: 0 });
        if (tab.id === "account") {
          void this.refreshAccountStatus(this.accountState.kind === "idle");
          void this.refreshProcessingActivity();
        }
        if (tab.id === "shares") void this.refreshShares();
      });
      button.addClass("bdf-tab-button");
      button.setAttr("role", "tab");
      const active = this.activeWorkspacePanel === tab.id;
      button.setAttr("aria-selected", active ? "true" : "false");
      if (active) button.addClass("is-active");
    }
    const settings = createIconOnlyButton(toolbar, "settings", "Settings", () =>
      this.plugin.openSettings(),
    );
    settings.addClass("bdf-toolbar-settings");
  }

  private renderOnboarding(parent: HTMLElement): void {
    const section = createSection(parent, "Where links go");
    const guide = section.createDiv({ cls: "bdf-onboarding" });
    const items = [
      ["link-2", "One link field", "Shares import; articles and media become notes."],
      ["folder-down", "Managed by Obsidian", `Imports go to ${this.plugin.settings.importFolder}.`],
      ["share-2", "Shares stay together", "Public links you create appear on the Shares page."],
    ];
    for (const [icon, title, detail] of items) {
      const item = guide.createDiv({ cls: "bdf-onboarding-item" });
      const iconEl = item.createDiv({ cls: "bdf-onboarding-icon" });
      const text = item.createDiv({ cls: "bdf-onboarding-copy" });
      setIcon(iconEl, icon);
      text.createEl("strong", { text: title });
      text.createSpan({ text: detail });
    }
    const actions = guide.createDiv({ cls: "bdf-onboarding-actions" });
    const start = createIconButton(actions, "check", "Got it", async () => {
      this.plugin.settings.onboardingCompleted = true;
      await this.plugin.saveSettings();
      this.render();
      this.focusUrlInput();
    });
    start.addClass("bdf-button-primary");
    createIconButton(actions, "shield-check", "Privacy", () => this.openAccountLink("privacy_url"));
  }

  private renderCapture(parent: HTMLElement): void {
    const section = createSection(parent, "Add a link");
    const form = section.createEl("form", { cls: "bdf-capture-form" });
    this.urlInput = form.createEl("input", {
      attr: {
        "aria-label": "Link",
        autocapitalize: "off",
        autocomplete: "off",
        id: "bdf-source-url",
        inputmode: "url",
        placeholder: "Paste a share, article, audio, or video link",
        type: "url",
      },
      cls: "bdf-url-input",
    });
    this.urlInput.value = this.currentUrl;
    this.urlInput.disabled = this.isParsing || this.importingShareId !== null;
    this.urlInput.addEventListener("click", () => this.focusUrlInput());
    this.urlInput.addEventListener("input", () => {
      this.currentUrl = this.urlInput?.value ?? "";
      this.linkMessage = "";
      this.setStatus("");
      this.updateLinkIntentUi(intent, submitButton);
    });
    this.urlInput.addEventListener("pointerup", () => this.focusUrlInput());
    this.urlInput.addEventListener("touchend", () => this.focusUrlInput());

    const intent = form.createDiv({ cls: "bdf-link-intent" });
    intent.setAttr("aria-live", "polite");

    const actions = form.createDiv({ cls: "bdf-actions" });
    createIconButton(actions, "clipboard", "Paste", () => this.pasteFromClipboard());
    const submitButton = createIconButton(
      actions,
      "arrow-right",
      "Continue",
      () => this.handleLinkSubmit(),
    );
    submitButton.addClass("bdf-button-primary");
    this.updateLinkIntentUi(intent, submitButton);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.handleLinkSubmit();
    });

    this.statusEl = section.createDiv({ cls: "bdf-status-line" });
    this.statusEl.setAttr("aria-live", "polite");
    this.statusEl.setAttr("role", "status");
    const defaultStatus = !getSessionToken()
      ? ""
      : "Saved privately when ready. Sharing is always your choice.";
    this.setStatus(this.linkMessage || this.activeJob?.statusText || defaultStatus);
    if (this.isParsing) {
      const progress = section.createDiv({ cls: "bdf-progress" });
      progress.setAttr("aria-label", "Creating note");
      progress.setAttr("aria-valuemax", "100");
      progress.setAttr("aria-valuemin", "0");
      progress.setAttr("aria-valuenow", String(this.activeProgress));
      progress.setAttr("role", "progressbar");
      const bar = progress.createDiv({ cls: "bdf-progress-bar" });
      bar.setCssProps({ "--bdf-progress": `${Math.max(4, this.activeProgress)}%` });
    }
  }

  private renderPreview(parent: HTMLElement): void {
    if (!this.activeResult) {
      return;
    }

    const savedHistory = this.findSavedActiveResult();
    if (savedHistory) {
      this.renderSavedResult(parent, savedHistory);
      return;
    }

    const section = createSection(parent, "Preview");
    const preview = section.createDiv({ cls: "bdf-preview-card" });
    preview.createDiv({
      attr: { "aria-level": "3", role: "heading" },
      cls: "bdf-card-title",
      text: this.activeResult.title,
    });
    preview.createEl("p", { cls: "bdf-preview-summary", text: this.activeResult.summary });

    const meta = preview.createDiv({ cls: "bdf-preview-meta" });
    createStatusPill(meta, this.activeResult.host, "muted");

    const rendered = preview.createDiv({ cls: "bdf-rendered-preview markdown-rendered" });
    const markdownComponent = new Component();
    markdownComponent.load();
    this.previewMarkdownComponent = markdownComponent;
    void MarkdownRenderer.render(
      this.app,
      this.activeResult.markdown,
      rendered,
      "",
      markdownComponent,
    );
    const source = preview.createEl("details", { cls: "bdf-source-details" });
    source.createEl("summary", { text: "Markdown source" });
    source.createEl("pre", { cls: "bdf-markdown-preview", text: this.activeResult.markdown });
    this.renderPreviewActions(preview);
    this.renderActiveShareResult(preview);
  }

  private renderSavedResult(parent: HTMLElement, history: LocalHistoryItem): void {
    const section = createSection(parent, "Ready");
    const saved = section.createDiv({ cls: "bdf-saved-result" });
    const heading = saved.createDiv({ cls: "bdf-saved-result-heading" });
    const icon = heading.createDiv({ cls: "bdf-saved-result-icon" });
    setIcon(icon, "file-check-2");
    const copy = heading.createDiv({ cls: "bdf-saved-result-copy" });
    copy.createEl("strong", { text: this.activeResult?.title ?? history.title });
    copy.createSpan({ text: "Saved privately in your Vault." });

    const actions = saved.createDiv({ cls: "bdf-preview-actions" });
    const open = createIconButton(actions, "file-text", "Open note", () =>
      this.openHistoryItem(history),
    );
    open.addClass("bdf-button-primary");
    if (this.docferryAvailable && this.activeResult?.parseJobId) {
      const share = createIconButton(
        actions,
        "share-2",
        this.isSharing ? "Creating link" : "Share",
        () => this.shareActiveResult(),
      );
      share.disabled = this.isSharing;
    }
    this.renderActiveShareResult(saved);
  }

  private renderPreviewActions(parent: HTMLElement): void {
    const actions = parent.createDiv({ cls: "bdf-preview-actions" });
    const saveButton = createIconButton(
      actions,
      "save",
      this.isSaving ? "Saving" : "Save note",
      () => this.saveActiveResult(),
    );
    saveButton.addClass("bdf-button-primary");
    saveButton.disabled = this.isSaving || this.isSharing;
    createIconButton(actions, "copy", "Copy note", () => this.copyMarkdown());
    if (this.docferryAvailable && this.activeResult?.parseJobId) {
      const shareButton = createIconButton(
        actions,
        "share-2",
        this.isSharing ? "Creating link" : "Create public link",
        () => this.shareActiveResult(),
      );
      shareButton.disabled = this.isSaving || this.isSharing;
    }
  }

  private renderActiveShareResult(parent: HTMLElement): void {
    if (!this.activeShareMessage) return;
    const shared = parent.createDiv({
      cls: `bdf-share-result is-${this.activeShareMessage.kind}`,
    });
    shared.createEl("strong", {
      text: this.activeShareMessage.kind === "ready" ? "Public link ready" : "Link not created",
    });
    shared.createSpan({ text: this.activeShareMessage.text });
    if (!this.activeShareUrl) return;
    const actions = shared.createDiv({ cls: "bdf-share-result-actions" });
    createIconButton(actions, "copy", "Copy link", () => this.copyShareUrl());
    createIconButton(actions, "external-link", "Open link", () =>
      this.openExternal(this.activeShareUrl),
    );
  }

  private renderAccountPanel(parent: HTMLElement): void {
    const section = createSection(parent, "Account");
    const card = section.createDiv({ cls: "bdf-account-card" });
    if (this.accountState.kind === "ready") {
      renderAccountIdentity(card, this.accountState.displayUser, this.accountState.message);
    } else {
      card.createDiv({
        attr: { "aria-level": "3", role: "heading" },
        cls: "bdf-card-title",
        text: accountHeading(this.accountState),
      });
      card.createEl("p", { cls: "bdf-account-message", text: this.accountState.message });
    }

    const meta = card.createDiv({ cls: "bdf-account-meta" });
    createStatusPill(
      meta,
      accountStatusLabel(this.accountState),
      this.accountState.kind === "ready" ? "ok" : "muted",
    );

    if (this.accountState.kind === "ready") {
      createStatusPill(
        meta,
        this.accountState.membership === "docferry-pro" ? "DocFerry Pro" : "Free",
        this.accountState.membership === "docferry-pro" ? "ok" : "muted",
      );
      if (this.docferryUsage) {
        createStatusPill(
          meta,
          `${this.docferryUsage.remaining} Media notes left`,
          this.docferryUsage.remaining > 0 ? "ok" : "warn",
        );
      }
    }

    if (this.accountState.kind === "ready" && this.docferryUsage) {
      card.createEl("p", {
        cls: "bdf-account-usage",
        text: `${this.docferryUsage.used} used this month · resets ${formatResetDate(this.docferryUsage.resetsAt)}`,
      });
    }

    if (this.accountState.kind === "not-configured" && this.accountState.details) {
      this.accountLinks = this.accountState.details.synapsehub;
    }

    const actions = card.createDiv({ cls: "bdf-account-actions" });
    if (this.accountState.kind === "logged-out" || this.accountState.kind === "idle") {
      createIconButton(actions, "log-in", "Sign in", () => this.openLogin());
      createIconButton(actions, "user-plus", "Create account", () => this.createAccount());
    } else if (
      this.accountState.kind === "error" ||
      this.accountState.kind === "not-configured" ||
      this.accountState.kind === "server-unavailable"
    ) {
      createIconButton(actions, "refresh-cw", "Retry", () => this.refreshAccountStatus());
    } else if (this.accountState.kind === "ready") {
      if (this.accountLinks) {
        createIconButton(actions, "credit-card", "Account & membership", () =>
          this.openAccountLink("account_center_url"),
        );
      }
      createIconButton(actions, "repeat-2", "Switch account", () => this.switchAccount());
      createIconButton(actions, "log-out", "Sign out", () => this.clearLocalSession());
    }

    if (this.accountState.kind === "ready") {
      const more = card.createEl("details", { cls: "bdf-account-more" });
      more.createEl("summary", { text: "More account options" });
      const moreActions = more.createDiv({ cls: "bdf-account-more-actions" });
      createIconButton(moreActions, "contact-round", "Profile", () =>
        this.openAccountLink("profile_settings_url"),
      );
      createIconButton(moreActions, "shield-check", "Login & security", () =>
        this.openAccountLink("account_security_url"),
      );
      createIconButton(moreActions, "smartphone", "Sessions & devices", () =>
        this.openAccountLink("devices_url"),
      );
      createIconButton(moreActions, "lock-keyhole", "Privacy", () =>
        this.openAccountLink("privacy_url"),
      );
      createIconButton(moreActions, "power", "Sign out of Bondie", () => this.signOutOfBondie());
    }

    if (this.accountState.kind === "ready") this.renderProcessingData(section);
  }

  private renderProcessingData(parent: HTMLElement): void {
    const details = parent.createEl("details", { cls: "bdf-data-panel" });
    details.open = this.processingExpanded;
    details.addEventListener("toggle", () => {
      this.processingExpanded = details.open;
    });
    const summary = details.createEl("summary");
    const summaryCopy = summary.createSpan();
    summaryCopy.createEl("strong", { text: "Processing data" });
    summaryCopy.createSpan({ text: "Temporary cloud tasks" });

    const body = details.createDiv({ cls: "bdf-data-panel-body" });
    body.createEl("p", {
      text: "Vault notes and public links are not deleted with processing data.",
    });
    const actions = body.createDiv({ cls: "bdf-data-actions" });
    createIconButton(actions, "refresh-cw", "Refresh", () => this.refreshProcessingActivity());

    if (this.activityState === "loading") {
      createEmptyState(body, "Checking processing data", "This usually takes a moment.");
      return;
    }
    if (this.activityState === "error") {
      createEmptyState(body, "Processing data unavailable", this.activityMessage || "Try again later.");
      return;
    }
    if (this.activityState === "ready" && this.remoteJobs.length === 0) {
      createEmptyState(body, "No processing data", "Completed tasks are removed automatically after 30 days.");
      return;
    }
    if (this.activityState !== "ready") {
      createEmptyState(body, "Not checked", "Refresh to load temporary cloud tasks.");
      return;
    }

    const list = body.createEl("ul", { cls: "bdf-processing-list" });
    for (const job of this.remoteJobs) {
      const row = list.createEl("li", { cls: "bdf-processing-row" });
      row.createEl("strong", { text: job.title ?? `Note from ${job.source_host}` });
      row.createSpan({
        text: `${job.source_host} · ${formatHistoryDate(job.updated_at)}`,
      });
      const rowActions = row.createDiv({ cls: "bdf-processing-actions" });
      if (job.stage === "complete" && job.result_available) {
        createIconButton(rowActions, "eye", "Preview", () => this.openRemoteResult(job));
      } else if (!isRemoteTerminal(job)) {
        createIconButton(rowActions, "circle-x", "Cancel", () => this.cancelProcessingActivity(job));
      }
      if (remoteParseCanRetry(job.stage)) {
        const retry = createIconButton(
          rowActions,
          "refresh-cw",
          "Retry",
          () => this.retryProcessingActivity(job),
        );
        retry.disabled = this.isParsing || Boolean(this.plugin.settings.pendingParse);
      }
      if (isRemoteTerminal(job)) {
        createIconOnlyButton(rowActions, "trash-2", "Delete processing data", () =>
          this.deleteProcessingActivity(job),
        );
      }
    }
  }

  private async refreshProcessingActivity(): Promise<void> {
    const token = getSessionToken();
    if (!token) {
      this.remoteJobs = [];
      this.activityState = "error";
      this.activityMessage = "Sign in to view processing data.";
      this.render();
      return;
    }

    this.activityState = "loading";
    this.activityMessage = "";
    this.render();
    try {
      const result = await fetchRemoteParseJobs(this.plugin.settings.serverUrl, token);
      if (!isCurrentSessionToken(token)) return;
      this.remoteJobs = result.jobs;
      this.activityState = "ready";
    } catch (error) {
      if (!isCurrentSessionToken(token)) return;
      if (await this.clearInvalidSession(error, token)) return;
      this.remoteJobs = [];
      this.activityState = "error";
      this.activityMessage = friendlyErrorMessage(
        error,
        "Processing data is temporarily unavailable. Try again later.",
      );
    }
    this.render();
  }

  private async openRemoteResult(job: RemoteParseJob): Promise<void> {
    const token = getSessionToken();
    if (!token) return;
    try {
      const result = await fetchRemoteParseResult(
        this.plugin.settings.serverUrl,
        token,
        job.parse_job_id,
      );
      if (!isCurrentSessionToken(token)) return;
      this.activeResult = toViewParseResult(result);
      this.activeShareMessage = null;
      this.activeShareUrl = null;
      this.activeWorkspacePanel = "home";
      this.plugin.settings.localHistory = upsertLocalHistoryItem(
        this.plugin.settings.localHistory,
        createLocalHistoryItem({
          remoteJobId: result.parse_job_id,
          sourceUrl: result.source_url,
          status: "parsed",
          title: result.title,
        }),
      );
      await this.plugin.saveSettings();
      this.render();
    } catch (error) {
      if (!isCurrentSessionToken(token)) return;
      if (await this.clearInvalidSession(error, token)) return;
      new Notice(friendlyErrorMessage(error, "The result could not be opened."));
    }
  }

  private async cancelProcessingActivity(job: RemoteParseJob): Promise<void> {
    const token = getSessionToken();
    if (!token) return;
    try {
      const cancelled = await cancelRemoteParseJob(
        this.plugin.settings.serverUrl,
        token,
        job.parse_job_id,
      );
      if (!isCurrentSessionToken(token)) return;
      this.remoteJobs = this.remoteJobs.map((item) =>
        item.parse_job_id === cancelled.parse_job_id ? cancelled : item,
      );
      this.render();
      new Notice("Processing cancelled.");
    } catch (error) {
      if (!isCurrentSessionToken(token)) return;
      if (await this.clearInvalidSession(error, token)) return;
      new Notice(friendlyErrorMessage(error, "Processing could not be cancelled."));
    }
  }

  private async retryProcessingActivity(job: RemoteParseJob): Promise<void> {
    const token = getSessionToken();
    if (!token || !remoteParseCanRetry(job.stage)) return;
    if (this.isParsing || this.plugin.settings.pendingParse) {
      new Notice("Another note is already processing.");
      return;
    }

    try {
      const retried = await retryRemoteParseJob(
        this.plugin.settings.serverUrl,
        token,
        job.parse_job_id,
      );
      if (!isCurrentSessionToken(token)) return;

      const pending: PendingParseRequest = {
        createdAt: new Date().toISOString(),
        jobId: retried.parse_job_id,
        language: retried.language,
        requestKey: createParseRequestKey(),
        sourceUrl: retried.source_url,
        template: retried.template,
      };
      this.remoteJobs = this.remoteJobs.map((item) =>
        item.parse_job_id === retried.parse_job_id ? retried : item,
      );
      this.currentUrl = retried.source_url;
      this.activeResult = null;
      this.activeShareMessage = null;
      this.activeShareUrl = null;
      this.activeWorkspacePanel = "home";
      this.plugin.settings.pendingParse = pending;
      await this.plugin.saveSettings();
      if (!isCurrentSessionToken(token)) {
        await this.clearPendingParse(pending.requestKey);
        return;
      }
      await this.runPendingParse(pending, token, true);
    } catch (error) {
      if (!isCurrentSessionToken(token)) return;
      if (await this.clearInvalidSession(error, token)) return;
      new Notice(friendlyErrorMessage(error, "This task could not be retried."));
    }
  }

  private async deleteProcessingActivity(job: RemoteParseJob): Promise<void> {
    const token = getSessionToken();
    if (!token) return;
    const confirmed = await confirmAction(this.app, {
      confirmLabel: "Delete data",
      message: "This permanently removes the temporary source and result. Vault notes and public links are not affected.",
      title: "Delete processing data?",
    });
    if (!confirmed) return;
    try {
      await deleteRemoteParseJob(
        this.plugin.settings.serverUrl,
        token,
        job.parse_job_id,
      );
      if (!isCurrentSessionToken(token)) return;
      if (pendingParseMatchesRemoteJob(this.plugin.settings.pendingParse, job)) {
        this.plugin.settings.pendingParse = null;
        await this.plugin.saveSettings();
      }
      this.remoteJobs = this.remoteJobs.filter((item) => item.parse_job_id !== job.parse_job_id);
      if (this.activeResult?.parseJobId === job.parse_job_id) {
        this.activeResult = null;
        this.activeShareMessage = null;
        this.activeShareUrl = null;
      }
      this.render();
      new Notice("Processing data deleted.");
    } catch (error) {
      if (!isCurrentSessionToken(token)) return;
      if (await this.clearInvalidSession(error, token)) return;
      new Notice(friendlyErrorMessage(error, "Processing data could not be deleted."));
    }
  }

  private renderSharesPanel(parent: HTMLElement): void {
    const section = createSection(parent, "Shares");
    if (!getSessionToken()) {
      createEmptyState(section, "Sign in to view shares", "Your Vault notes remain available in Obsidian.");
      const signIn = createIconButton(section, "log-in", "Sign in", () => this.openLogin());
      signIn.addClass("bdf-button-primary", "bdf-inline-action");
      return;
    }

    const toolbar = section.createDiv({ cls: "bdf-shares-toolbar" });
    const summary = toolbar.createDiv({ cls: "bdf-shares-summary" });
    summary.createEl("strong", {
      text: this.sharesState === "ready"
        ? `${this.shareTotal} ${this.shareTotal === 1 ? "share" : "shares"}`
        : "Public links",
    });
    if (this.sharesState === "ready" && this.shareTotal > 0) {
      const first = this.shareOffset + 1;
      const last = Math.min(this.shareOffset + this.docferryShares.length, this.shareTotal);
      summary.createSpan({ text: `Showing ${first}-${last}` });
    }
    createIconOnlyButton(toolbar, "refresh-cw", "Refresh shares", () => this.refreshShares());

    if (this.sharesMessage) {
      section.createDiv({ cls: "bdf-status-line", text: this.sharesMessage });
    }

    if (this.sharesState === "loading") {
      this.renderShareSkeleton(section);
    } else if (this.sharesState === "error") {
      createEmptyState(
        section,
        "Shares are unavailable",
        this.sharesMessage || "Try refreshing in a moment.",
      );
    } else if (this.sharesState === "ready" && this.docferryShares.length === 0) {
      createEmptyState(section, "No shares yet", "Public links you create will appear here.");
    } else if (this.sharesState === "ready") {
      const cloudList = section.createEl("ul", { cls: "bdf-share-list" });
      for (const share of this.docferryShares) {
        this.renderShareRow(cloudList, share);
      }
      this.renderSharePagination(section);
    } else {
      createEmptyState(section, "Shares not loaded", "Refresh to load your public links.");
    }
  }

  private renderShareRow(parent: HTMLElement, share: DocFerryShareListItem): void {
    const row = parent.createEl("li", { cls: "bdf-share-row" });
    const main = row.createDiv({ cls: "bdf-share-main" });
    const heading = main.createDiv({ cls: "bdf-share-heading" });
    heading.createEl("strong", { text: share.title });
    createStatusPill(
      heading,
      shareStatusLabel(share.status),
      share.status === "published" ? "ok" : "muted",
    );
    const publishedAt = share.last_published_at || share.updated_at;
    main.createSpan({
      cls: "bdf-share-date",
      text: formatHistoryDate(publishedAt),
    });

    const canManage = shareCanManageAccess(share.status) && supportsShareCapability(
      this.docferryCapabilities,
      DOCFERRY_SHARE_UPDATE_CAPABILITY,
    );
    const canStop = shareCanStop(share.status) && supportsShareCapability(
      this.docferryCapabilities,
      DOCFERRY_SHARE_STOP_CAPABILITY,
    );
    const canDelete = shareCanDeleteRecord(share.status) && supportsShareCapability(
      this.docferryCapabilities,
      DOCFERRY_SHARE_DELETE_CAPABILITY,
    );
    const hasActions = shareLinkIsAvailable(share.status) || canManage || canStop || canDelete;

    if (hasActions) {
      const actions = row.createDiv({ cls: "bdf-share-actions" });
      if (shareLinkIsAvailable(share.status)) {
        const copy = createIconButton(actions, "copy", "Copy link", () =>
          this.copyText(share.url, "Share link copied."),
        );
        copy.addClass("bdf-share-copy");
        createIconOnlyButton(actions, "external-link", "Open share", () =>
          this.openExternal(share.url),
        );
      }
      if (canManage) {
        const manage = createIconButton(actions, "sliders-horizontal", "Manage", () =>
          this.manageShare(share),
        );
        manage.disabled = this.shareActionId === share.share_id;
      }
      if (canStop) {
        const stop = createIconOnlyButton(actions, "circle-stop", "Stop public link", () =>
          this.stopShare(share),
        );
        stop.disabled = this.shareActionId === share.share_id;
      }
      if (canDelete) {
        const remove = createIconOnlyButton(actions, "trash-2", "Delete share history", () =>
          this.deleteShareHistory(share),
        );
        remove.disabled = this.shareActionId === share.share_id;
      }
    } else {
      row.addClass("is-unavailable");
    }
  }

  private async manageShare(share: DocFerryShareListItem): Promise<void> {
    const token = getSessionToken();
    if (!token || this.shareActionId) return;
    this.shareActionId = share.share_id;
    this.render();
    try {
      const detail = await fetchDocFerryShareDetail(
        this.plugin.settings.serverUrl,
        token,
        share.share_id,
      );
      if (!isCurrentSessionToken(token)) return;
      const update = await editShareAccess(this.app, detail);
      if (!update || !isCurrentSessionToken(token)) return;
      await updateDocFerryShareAccess(
        this.plugin.settings.serverUrl,
        token,
        share.share_id,
        update,
      );
      if (!isCurrentSessionToken(token)) return;
      new Notice("Share settings updated.");
      await this.refreshShares();
    } catch (error) {
      if (!isCurrentSessionToken(token)) return;
      if (await this.clearInvalidSession(error, token)) return;
      new Notice(shareLifecycleFailureMessage(error, "Share settings could not be updated."));
    } finally {
      this.shareActionId = null;
      this.render();
    }
  }

  private async stopShare(share: DocFerryShareListItem): Promise<void> {
    const token = getSessionToken();
    if (!token || this.shareActionId) return;
    const confirmed = await confirmAction(this.app, {
      confirmLabel: "Stop link",
      message: "People with this link will no longer be able to open the note. The history record stays here.",
      title: "Stop this public link?",
    });
    if (!confirmed || !isCurrentSessionToken(token)) return;
    this.shareActionId = share.share_id;
    this.render();
    try {
      await stopDocFerryShare(this.plugin.settings.serverUrl, token, share.share_id);
      if (!isCurrentSessionToken(token)) return;
      new Notice("Public link stopped.");
      await this.refreshShares();
    } catch (error) {
      if (!isCurrentSessionToken(token)) return;
      if (await this.clearInvalidSession(error, token)) return;
      new Notice(shareLifecycleFailureMessage(error, "The public link could not be stopped."));
    } finally {
      this.shareActionId = null;
      this.render();
    }
  }

  private async deleteShareHistory(share: DocFerryShareListItem): Promise<void> {
    const token = getSessionToken();
    if (!token || this.shareActionId) return;
    const confirmed = await confirmAction(this.app, {
      confirmLabel: "Delete history",
      message: "This removes the stopped or expired Share record. Vault notes are not changed.",
      title: "Delete this Share history?",
    });
    if (!confirmed || !isCurrentSessionToken(token)) return;
    this.shareActionId = share.share_id;
    this.render();
    try {
      await deleteDocFerryShareRecord(this.plugin.settings.serverUrl, token, share.share_id);
      if (!isCurrentSessionToken(token)) return;
      new Notice("Share history deleted.");
      if (this.docferryShares.length === 1 && this.shareOffset > 0) {
        this.shareOffset = Math.max(0, this.shareOffset - SHARE_PAGE_SIZE);
      }
      await this.refreshShares();
    } catch (error) {
      if (!isCurrentSessionToken(token)) return;
      if (await this.clearInvalidSession(error, token)) return;
      new Notice(shareLifecycleFailureMessage(error, "Share history could not be deleted."));
    } finally {
      this.shareActionId = null;
      this.render();
    }
  }

  private renderShareSkeleton(parent: HTMLElement): void {
    const list = parent.createDiv({ cls: "bdf-share-list", attr: { "aria-label": "Loading shares" } });
    for (let index = 0; index < 3; index += 1) {
      const row = list.createDiv({ cls: "bdf-share-row bdf-share-skeleton" });
      row.createDiv();
      row.createDiv();
    }
  }

  private renderSharePagination(parent: HTMLElement): void {
    if (this.shareTotal <= SHARE_PAGE_SIZE) return;
    const page = getSharePageState(this.shareTotal, this.shareOffset, SHARE_PAGE_SIZE);
    const pagination = parent.createDiv({ cls: "bdf-pagination" });
    const previous = createIconOnlyButton(pagination, "chevron-left", "Previous page", () =>
      this.refreshShares(page.previousOffset),
    );
    previous.disabled = !page.hasPrevious || this.sharesState === "loading";
    pagination.createSpan({ text: `Page ${page.page} of ${page.pageCount}` });
    const next = createIconOnlyButton(pagination, "chevron-right", "Next page", () =>
      this.refreshShares(page.nextOffset),
    );
    next.disabled = !page.hasNext || this.sharesState === "loading";
  }

  private unloadPreviewMarkdown(): void {
    this.previewMarkdownComponent?.unload();
    this.previewMarkdownComponent = null;
  }

  private async refreshShares(offset = this.shareOffset): Promise<void> {
    const token = getSessionToken();
    if (!token) {
      this.docferryAvailable = false;
      this.docferryShares = [];
      this.shareTotal = 0;
      this.sharesState = "error";
      this.sharesMessage = "Sign in to open shares.";
      this.render();
      return;
    }

    this.sharesState = "loading";
    this.sharesMessage = "";
    this.render();
    try {
      await this.bootstrapInterconnect(token);
      const result = await fetchDocFerryShares(
        this.plugin.settings.serverUrl,
        token,
        SHARE_PAGE_SIZE,
        offset,
      );
      if (!isCurrentSessionToken(token)) return;
      this.docferryShares = result.shares;
      this.shareOffset = result.offset;
      this.shareTotal = result.total;
      this.docferryAvailable = true;
      this.sharesState = "ready";
    } catch (error) {
      if (!isCurrentSessionToken(token)) return;
      if (await this.clearInvalidSession(error, token)) return;
      this.docferryAvailable = false;
      this.docferryShares = [];
      this.shareTotal = 0;
      this.sharesState = "error";
      this.sharesMessage = friendlyErrorMessage(
        error,
        "Shared notes are temporarily unavailable. Try refreshing in a moment.",
      );
    }
    this.render();
  }

  private async importDocFerryUrl(
    rawUrl: string,
    operationId: string,
    displayTitle = "shared note",
  ): Promise<void> {
    if (this.importingShareId) {
      return;
    }
    const shareUrl = rawUrl.trim();
    if (!shareUrl) {
      this.linkMessage = "Paste a DocFerry link first.";
      this.render();
      return;
    }
    const existingImport = this.findImportedShare(shareUrl);
    if (existingImport) {
      this.currentUrl = "";
      this.linkMessage = "This shared note is already in your Vault.";
      await this.openHistoryItem(existingImport);
      this.render();
      return;
    }

    this.importingShareId = operationId;
    this.linkMessage = `Importing ${displayTitle}.`;
    this.render();
    try {
      const imported = await importDocFerryShareToVault(this.app, this.plugin.settings, shareUrl);
      this.plugin.settings.localHistory = upsertLocalHistoryItem(
        this.plugin.settings.localHistory,
        createLocalHistoryItem({
          filePath: imported.path,
          kind: "docferry-import",
          sourceUrl: shareUrl,
          status: "saved",
          title: imported.title,
        }),
      );
      await this.plugin.saveSettings();
      this.currentUrl = "";
      this.linkMessage = `Imported to ${this.plugin.settings.importFolder}.`;
      new Notice(
        imported.importedAssets > 0
          ? `Imported ${imported.title} with ${imported.importedAssets} assets.`
          : `Imported ${imported.title}.`,
      );
      const leaf = this.app.workspace.getLeaf("tab");
      await leaf.openFile(imported.file, { active: true });
      await this.app.workspace.revealLeaf(leaf);
    } catch (error) {
      this.linkMessage = friendlyImportError(error);
      new Notice(this.linkMessage);
    } finally {
      this.importingShareId = null;
      this.render();
    }
  }

  private findImportedShare(shareUrl: string): LocalHistoryItem | null {
    const normalizedShareUrl = normalizePublicShareReference(shareUrl);
    const item = this.plugin.settings.localHistory.find(
      (candidate) =>
        candidate.kind === "docferry-import" &&
        candidate.sourceUrl === normalizedShareUrl &&
        Boolean(candidate.filePath),
    );
    if (!item?.filePath) return null;
    return this.app.vault.getAbstractFileByPath(item.filePath) instanceof TFile ? item : null;
  }

  private async pasteFromClipboard(): Promise<void> {
    if (!navigator.clipboard?.readText) {
      new Notice("Clipboard access is unavailable. Paste manually into the link field.");
      return;
    }

    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) {
        new Notice("Clipboard is empty.");
        return;
      }
      if (this.urlInput) {
        this.urlInput.value = text;
      }
      this.currentUrl = text;
      this.linkMessage = "";
      this.render();
      this.focusUrlInput();
    } catch {
      new Notice("Clipboard access was blocked. Paste manually into the link field.");
    }
  }

  private async handleLinkSubmit(): Promise<void> {
    if (this.isParsing) {
      await this.cancelActiveParse();
      return;
    }
    if (this.importingShareId) return;

    const intent = classifyLinkIntent(this.urlInput?.value ?? this.currentUrl);
    if (intent.kind === "empty" || intent.kind === "invalid") {
      this.linkMessage = intent.kind === "empty"
        ? "Paste a link to continue."
        : "Enter a valid DocFerry share or media link.";
      this.render();
      this.focusUrlInput();
      return;
    }

    this.currentUrl = intent.url;
    if (intent.kind === "docferry-share") {
      await this.importDocFerryUrl(intent.url, "direct");
      return;
    }
    if (!getSessionToken() && linkIntentRequiresSession(intent)) {
      this.openLogin();
      return;
    }
    await this.startRemoteParse();
  }

  private updateLinkIntentUi(container: HTMLElement, button: HTMLButtonElement): void {
    const intent = classifyLinkIntent(this.urlInput?.value ?? this.currentUrl);
    container.empty();
    container.removeClass("is-invalid", "is-import", "is-capture");

    const icon = container.createSpan({ cls: "bdf-link-intent-icon", attr: { "aria-hidden": "true" } });
    const copy = container.createSpan({ cls: "bdf-link-intent-copy" });
    let intentIcon = "wand-sparkles";
    let intentText = "Share, article, audio, or video link";
    let buttonIcon = "arrow-right";
    let buttonLabel = "Continue";
    let disabled = intent.kind === "empty";

    if (intent.kind === "docferry-share") {
      intentIcon = "folder-down";
      intentText = `DocFerry share · Import to ${this.plugin.settings.importFolder}`;
      buttonIcon = "download";
      buttonLabel = "Import";
      container.addClass("is-import");
    } else if (intent.kind === "web") {
      intentIcon = "sparkles";
      intentText = "Web link · Process with DocFerry · Save privately";
      buttonIcon = "sparkles";
      buttonLabel = "Create note";
      container.addClass("is-capture");
    } else if (intent.kind === "invalid") {
      intentIcon = "circle-alert";
      intentText = "This link is not recognized";
      container.addClass("is-invalid");
      disabled = true;
    }

    if (this.isParsing) {
      buttonIcon = "circle-x";
      buttonLabel = "Cancel";
      disabled = false;
    } else if (this.importingShareId) {
      buttonIcon = "loader-circle";
      buttonLabel = "Importing";
      disabled = true;
    } else if (!getSessionToken() && linkIntentRequiresSession(intent)) {
      buttonIcon = "log-in";
      buttonLabel = "Sign in";
    }

    setIcon(icon, intentIcon);
    copy.setText(intentText);
    const buttonIconEl = button.querySelector<HTMLElement>(".bdf-icon");
    const buttonLabelEl = button.querySelector<HTMLElement>(".bdf-button-label");
    if (buttonIconEl) {
      buttonIconEl.empty();
      setIcon(buttonIconEl, buttonIcon);
    }
    buttonLabelEl?.setText(buttonLabel);
    button.setAttr("aria-label", buttonLabel);
    button.disabled = disabled;
  }

  private async copyText(value: string, successMessage: string): Promise<void> {
    if (!navigator.clipboard?.writeText) {
      new Notice("Clipboard access is unavailable. Open the link instead.");
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      new Notice(successMessage);
    } catch {
      new Notice("Clipboard access was blocked. Open the link instead.");
    }
  }

  private async startRemoteParse(): Promise<void> {
    if (this.isParsing) {
      return;
    }

    const parsedUrl = parseHttpUrl(this.urlInput?.value.trim() ?? this.currentUrl);
    if (!parsedUrl) {
      new Notice("Paste a valid audio or video URL first.");
      this.setStatus("Waiting for a valid URL.");
      return;
    }

    this.currentUrl = parsedUrl.toString();
    const token = getSessionToken();
    if (!token) {
      this.activeWorkspacePanel = "account";
      this.accountState = {
        kind: "logged-out",
        message: "Sign in before starting a server parse.",
      };
      this.render();
      new Notice("Sign in to Bondie-Docferry before parsing.");
      return;
    }

    this.activeResult = null;
    this.activeShareMessage = null;
    this.activeShareUrl = null;
    this.activeProgress = 0;
    this.cancelRequested = false;
    const pending: PendingParseRequest = {
      createdAt: new Date().toISOString(),
      language: this.plugin.settings.defaultLanguage,
      requestKey: createParseRequestKey(),
      sourceUrl: this.currentUrl,
      template: this.plugin.settings.defaultTemplate,
    };
    this.plugin.settings.pendingParse = pending;
    await this.plugin.saveSettings();
    if (!isCurrentSessionToken(token)) {
      await this.clearPendingParse(pending.requestKey);
      return;
    }
    await this.runPendingParse(pending, token, false);
  }

  private async resumePendingParse(): Promise<void> {
    const pending = this.plugin.settings.pendingParse;
    const token = getSessionToken();
    if (!pending || !token || this.isParsing || this.activeResult) return;

    this.currentUrl = pending.sourceUrl;
    this.activeWorkspacePanel = "home";
    await this.runPendingParse(pending, token, true);
  }

  private async runPendingParse(
    pending: PendingParseRequest,
    token: string,
    resumed: boolean,
  ): Promise<void> {
    const generation = ++this.parseGeneration;
    this.activeJob = createLocalParseJob(pending.sourceUrl);
    this.activeJob.remoteJobId = pending.jobId;
    this.activeProgress = 0;
    this.cancelRequested = false;
    this.isParsing = true;
    this.render();
    this.setStatus(resumed ? "Continuing your note." : "Starting your note.");

    try {
      let remoteJob = pending.jobId
        ? await fetchRemoteParseJob(this.plugin.settings.serverUrl, token, pending.jobId)
        : await createRemoteParseJob(
            this.plugin.settings.serverUrl,
            token,
            {
              language: pending.language,
              sourceUrl: pending.sourceUrl,
              template: pending.template,
            },
            pending.requestKey,
          );
      if (!this.isCurrentParse(generation, token)) {
        await this.clearPendingParse(pending.requestKey);
        return;
      }
      if (!pending.jobId) {
        pending.jobId = remoteJob.parse_job_id;
        this.plugin.settings.pendingParse = pending;
        await this.plugin.saveSettings();
        if (!this.isCurrentParse(generation, token)) {
          await this.clearPendingParse(pending.requestKey);
          return;
        }
      }
      if (this.activeJob) this.activeJob.remoteJobId = remoteJob.parse_job_id;
      if (this.cancelRequested) {
        remoteJob = await cancelRemoteParseJob(
          this.plugin.settings.serverUrl,
          token,
          remoteJob.parse_job_id,
        );
        if (!this.isCurrentParse(generation, token)) {
          await this.clearPendingParse(pending.requestKey);
          return;
        }
      }
      this.setRemoteParseStatus(remoteJob);

      const deadline = Date.now() + 3 * 60 * 1000;
      let pollAttempt = 0;
      let connectionFailures = 0;
      while (!isRemoteTerminal(remoteJob) && Date.now() < deadline) {
        if (!this.isCurrentParse(generation, token)) {
          await this.clearPendingParse(pending.requestKey);
          return;
        }
        await sleep(pollAttempt < 10 ? 500 : 1500);
        try {
          remoteJob = await fetchRemoteParseJob(
            this.plugin.settings.serverUrl,
            token,
            remoteJob.parse_job_id,
          );
          if (!this.isCurrentParse(generation, token)) {
            await this.clearPendingParse(pending.requestKey);
            return;
          }
          connectionFailures = 0;
          this.setRemoteParseStatus(remoteJob);
        } catch (error) {
          if (!isRecoverableConnectionError(error) || connectionFailures >= 3) throw error;
          connectionFailures += 1;
          this.setStatus("Connection interrupted. Reconnecting.");
          await sleep(500 * 2 ** connectionFailures);
        }
        pollAttempt += 1;
      }

      if (!isRemoteTerminal(remoteJob)) {
        this.setLocalStatus("Still working. Reopen Bondie-Docferry to continue.");
        new Notice("Your note is still working and will continue when you reopen the plugin.");
        return;
      }
      if (remoteJob.stage === "cancelled") {
        await this.clearPendingParse(pending.requestKey);
        if (!this.isCurrentParse(generation, token)) return;
        await this.advanceParseStage("cancelled", "Note creation cancelled.");
        return;
      }
      if (remoteJob.stage !== "complete" || !remoteJob.result_available) {
        await this.clearPendingParse(pending.requestKey);
        if (!this.isCurrentParse(generation, token)) return;
        throw new TerminalParseError();
      }

      const remoteResult = await fetchRemoteParseResult(
        this.plugin.settings.serverUrl,
        token,
        remoteJob.parse_job_id,
      );
      if (!this.isCurrentParse(generation, token)) {
        await this.clearPendingParse(pending.requestKey);
        return;
      }
      const viewResult = toViewParseResult(remoteResult);
      this.activeResult = viewResult;
      this.activeProgress = 100;
      await this.clearPendingParse(pending.requestKey);
      if (!this.isCurrentParse(generation, token)) return;
      this.plugin.settings.localHistory = upsertLocalHistoryItem(
        this.plugin.settings.localHistory,
        createLocalHistoryItem({
          remoteJobId: viewResult.parseJobId,
          sourceUrl: viewResult.sourceUrl,
          status: "parsed",
          title: viewResult.title,
        }),
      );
      await this.plugin.saveSettings();
      if (!this.isCurrentParse(generation, token)) return;
      await this.saveCompletedResult(viewResult, { openNote: false, showCompletion: true });
    } catch (error) {
      if (this.parseGeneration !== generation) return;
      const interruption = parseInterruption(error);
      if (isInvalidSessionError(error)) {
        if (!this.isCurrentParse(generation, token)) {
          await this.clearPendingParse(pending.requestKey);
          return;
        }
        await this.clearInvalidSession(error, token);
      } else if (interruption) {
        this.setLocalStatus(interruption.message);
        new Notice(interruption.message);
      } else {
        await this.clearPendingParse(pending.requestKey);
        if (this.parseGeneration !== generation) return;
        const message = friendlyErrorMessage(
          error,
          "This note could not be completed. Check the link and try again.",
        );
        await this.advanceParseStage("failed", message);
        new Notice(message);
      }
    } finally {
      if (this.parseGeneration === generation) {
        this.cancelRequested = false;
        this.isParsing = false;
        this.render();
      }
    }
  }

  private async clearPendingParse(requestKey: string): Promise<void> {
    if (this.plugin.settings.pendingParse?.requestKey !== requestKey) return;
    this.plugin.settings.pendingParse = null;
    await this.plugin.saveSettings();
  }

  private setLocalStatus(message: string): void {
    if (this.activeJob) this.activeJob = { ...this.activeJob, statusText: message };
    this.setStatus(message);
  }

  private async cancelActiveParse(): Promise<void> {
    const token = getSessionToken();
    const generation = this.parseGeneration;
    const parseJobId = this.activeJob?.remoteJobId;
    if (!token) {
      return;
    }

    this.cancelRequested = true;
    this.setStatus("Cancellation requested.");
    if (!parseJobId) {
      return;
    }

    try {
      const cancelled = await cancelRemoteParseJob(
        this.plugin.settings.serverUrl,
        token,
        parseJobId,
      );
      if (!this.isCurrentParse(generation, token)) return;
      this.setRemoteParseStatus(cancelled);
    } catch (error) {
      if (!this.isCurrentParse(generation, token)) return;
      new Notice(error instanceof Error ? error.message : "Could not cancel the parse.");
    }
  }

  private async refreshInterconnectAvailability(): Promise<void> {
    const token = getSessionToken();
    if (!token) {
      this.docferryAvailable = false;
      this.docferryCapabilities.clear();
      return;
    }

    try {
      const status = await fetchInterconnectStatus(this.plugin.settings.serverUrl, token);
      if (!isCurrentSessionToken(token)) return;
      this.docferryAvailable = status.grant_contract_ready;
      this.docferryCapabilities = new Set(status.supported_business_capabilities);
      this.render();
    } catch (error) {
      if (!isCurrentSessionToken(token)) return;
      if (await this.clearInvalidSession(error, token)) return;
      this.docferryAvailable = false;
      this.docferryCapabilities.clear();
    }
  }

  private refreshAccountStatus(showLoading = true): Promise<void> {
    if (this.accountRefreshPromise) {
      if (showLoading && this.accountState.kind === "idle") {
        this.accountState = {
          kind: "loading",
          message: "Checking your account.",
        };
        this.render();
      }
      return this.accountRefreshPromise;
    }
    const refresh = this.performAccountRefresh(showLoading);
    this.accountRefreshPromise = refresh;
    void refresh.finally(() => {
      if (this.accountRefreshPromise === refresh) this.accountRefreshPromise = null;
    });
    return refresh;
  }

  private async performAccountRefresh(showLoading: boolean): Promise<void> {
    const stableAccountState = this.accountState;
    const sessionToken = getSessionToken();
    if (showLoading && this.accountState.kind !== "ready") {
      this.accountState = {
        kind: "loading",
        message: "Checking your account.",
      };
      this.render();
    }

    try {
      const selfCheck = await fetchAuthSelfCheck(this.plugin.settings.serverUrl);
      this.accountLinks = selfCheck.synapsehub;
      if (selfCheck.configured && sessionToken) {
        const whoami = await fetchWhoami(this.plugin.settings.serverUrl, sessionToken);
        if (getSessionToken() !== sessionToken) return;

        let interconnect: InterconnectStatusResponse | null = null;
        let membership = membershipFromProduct(whoami.product);

        // Identity is the primary Account content. Show it before optional
        // membership and interconnect refreshes complete.
        this.accountState = buildAccountStateFromWhoami(whoami, null, membership);
        this.render();

        const [interconnectResult, entitlementResult] = await Promise.allSettled([
          this.bootstrapInterconnect(sessionToken),
          fetchEntitlementSummary(this.plugin.settings.serverUrl, sessionToken),
        ]);
        if (getSessionToken() !== sessionToken) return;
        if (interconnectResult.status === "fulfilled") {
          interconnect = interconnectResult.value;
        }
        if (entitlementResult.status === "fulfilled") {
          membership = membershipFromSummary(entitlementResult.value);
        }
        this.accountState = buildAccountStateFromWhoami(whoami, interconnect, membership);
        this.docferryAvailable = interconnect?.grant_contract_ready ?? false;
        this.docferryCapabilities = new Set(
          interconnect?.supported_business_capabilities ?? [],
        );
        if (
          membership === "docferry-pro" &&
          this.docferryCapabilities.has("docferry.usage.read")
        ) {
          try {
            const usage = await fetchDocFerryUsage(this.plugin.settings.serverUrl, sessionToken);
            if (getSessionToken() !== sessionToken) return;
            this.docferryUsage = {
              remaining: usage.media_to_note.remaining,
              resetsAt: usage.media_to_note.resets_at,
              used: usage.media_to_note.used,
            };
          } catch {
            this.docferryUsage = null;
          }
        } else {
          this.docferryUsage = null;
        }
      } else {
        this.accountState = buildAccountStateFromSelfCheck(selfCheck);
        this.docferryAvailable = false;
        this.docferryCapabilities.clear();
      }
    } catch (error) {
      if (getSessionToken() !== sessionToken) return;
      if (sessionToken && isInvalidSessionError(error)) {
        await this.clearInvalidSession(error, sessionToken);
        return;
      } else if (
        stableAccountState.kind === "ready" &&
        isRecoverableConnectionError(error)
      ) {
        this.accountState = stableAccountState;
      } else {
        this.accountState = buildAccountStateFromError(error);
      }
    }

    this.render();
  }

  private openLogin(options: { prompt?: "login"; screenHint?: "signup" } = {}): void {
    const clientState = createPendingLoginState();
    const loginUrl = buildLoginUrl(this.plugin.settings.serverUrl, {
      ...options,
      clientState,
    });
    this.accountState = {
      kind: "loading",
      message: "Finish sign-in in your browser, then return to Obsidian.",
    };
    this.render();
    this.startLoginCompletionPolling(clientState);
    window.open(loginUrl, "_blank", "noopener,noreferrer");
    new Notice("Complete sign-in in your browser, then return to Obsidian.");
  }

  private async switchAccount(): Promise<void> {
    await this.startFreshLogin({ prompt: "login" });
  }

  private async createAccount(): Promise<void> {
    await this.startFreshLogin({ prompt: "login", screenHint: "signup" });
  }

  private async startFreshLogin(options: {
    prompt?: "login";
    screenHint?: "signup";
  }): Promise<void> {
    const token = getSessionToken();
    this.stopLoginCompletionPolling();
    clearPendingLoginState();
    clearSessionToken();
    this.resetAccountScopedUi();
    if (!await this.clearAccountScopedPendingParse()) {
      this.accountState = {
        kind: "error",
        message: "Previous sign-in data could not be cleared. Restart Obsidian and try again.",
      };
      this.render();
      return;
    }
    this.accountState = {
      kind: "logged-out",
      message: options.screenHint === "signup"
        ? "Opening Bondie account creation."
        : "Opening hosted login for another Bondie account.",
    };
    this.render();

    if (token) {
      try {
        await logoutSession(this.plugin.settings.serverUrl, token);
      } catch {
        // A local clear is still enough to force the next product exchange.
      }
    }

    this.openLogin(options);
  }

  private async signOutOfBondie(): Promise<void> {
    const token = getSessionToken();
    if (!token) {
      this.accountState = { kind: "logged-out", message: "No product session is active." };
      this.render();
      return;
    }

    try {
      const result = await globalLogoutSession(this.plugin.settings.serverUrl, token);
      if (!isCurrentSessionToken(token)) return;
      this.stopLoginCompletionPolling();
      clearPendingLoginState();
      clearSessionToken();
      this.resetAccountScopedUi();
      const pendingCleared = await this.clearAccountScopedPendingParse();
      this.accountState = {
        kind: "logged-out",
        message: pendingCleared
          ? "Signed out of Bondie on participating products."
          : "Signed out. Restart Obsidian to clear interrupted task data.",
      };
      this.render();
      this.openExternal(result.continue_logout_url);
    } catch (error) {
      if (!isCurrentSessionToken(token)) return;
      if (await this.clearInvalidSession(error, token)) return;
      this.accountState = buildAccountStateFromError(error);
      this.render();
      new Notice(error instanceof Error ? error.message : "Bondie sign-out failed.");
    }
  }

  private openExternal(url: string | null | undefined): void {
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  private async openAccountLink(
    key: "account_center_url" | "account_security_url" | "devices_url" | "privacy_url" | "profile_settings_url",
  ): Promise<void> {
    if (!this.accountLinks) {
      await this.refreshAccountStatus(false);
    }
    const url = this.accountLinks?.[key];
    if (!url) {
      new Notice("Account Center is temporarily unavailable.");
      return;
    }
    this.openExternal(url);
  }

  async completeLoginCode(rawCode: string, state: string): Promise<void> {
    const code = normalizeLoginCode(rawCode);
    if (!code) {
      new Notice("Sign-in could not be completed. Please try again.");
      return;
    }

    this.accountState = {
      kind: "loading",
      message: "Finishing sign-in.",
    };
    this.render();

    try {
      const exchanged = await exchangeLoginCode(this.plugin.settings.serverUrl, code, state);
      await this.acceptLoginExchange(exchanged, state);
    } catch (error) {
      if (getSessionToken() && await matchesCompletedLoginState(state)) return;
      const pendingAttempt = this.loginPollAttemptPromise;
      if (error instanceof BondieApiError && error.code === "AUTH_EXCHANGE_INVALID" && pendingAttempt) {
        await Promise.race([
          pendingAttempt.catch(() => undefined),
          delay(LOGIN_ATTEMPT_SETTLE_TIMEOUT_MS),
        ]);
        if (getSessionToken() && await matchesCompletedLoginState(state)) return;
      }
      this.accountState = buildAccountStateFromError(error);
      new Notice(friendlyErrorMessage(error, "Sign-in could not be completed. Please try again."));
      this.render();
    }
  }

  private startLoginCompletionPolling(state: string): void {
    if (this.loginPollState === state && this.loginPollPromise) return;
    const generation = ++this.loginPollGeneration;
    this.loginPollState = state;
    const promise = this.pollLoginCompletion(state, generation);
    this.loginPollPromise = promise;
    void promise.finally(() => {
      if (this.loginPollGeneration === generation) {
        this.loginPollPromise = null;
        this.loginPollState = null;
      }
    });
  }

  private stopLoginCompletionPolling(): void {
    this.loginPollGeneration += 1;
    this.loginPollPromise = null;
    this.loginPollState = null;
  }

  private async pollLoginCompletion(state: string, generation: number): Promise<void> {
    const startedAt = Date.now();
    while (
      this.loginPollGeneration === generation &&
      Date.now() - startedAt < LOGIN_COMPLETION_TIMEOUT_MS
    ) {
      if (getSessionToken()) {
        clearPendingLoginState();
        return;
      }
      const attempt = this.completePendingLoginAttempt(state, generation);
      this.loginPollAttemptPromise = attempt;
      try {
        await attempt;
        if (getSessionToken()) return;
      } catch (error) {
        if (error instanceof BondieApiError && !error.retryable) {
          clearPendingLoginState();
          this.accountState = buildAccountStateFromError(error);
          this.render();
          return;
        }
      } finally {
        if (this.loginPollAttemptPromise === attempt) this.loginPollAttemptPromise = null;
      }
      const elapsed = Date.now() - startedAt;
      await delay(elapsed < 60_000 ? 2_000 : 5_000);
    }

    if (this.loginPollGeneration === generation && !getSessionToken()) {
      clearPendingLoginState();
      this.accountState = {
        kind: "logged-out",
        message: "Sign-in took too long. Start again when you are ready.",
      };
      this.render();
    }
  }

  private async acceptLoginExchange(
    exchanged: TokenExchangeResponse,
    completedState: string,
  ): Promise<void> {
    this.resetAccountScopedUi();
    clearSessionToken();
    if (!await this.clearAccountScopedPendingParse()) {
      throw new Error("Previous sign-in data could not be cleared safely.");
    }
    const sessionPersisted = setSessionToken(exchanged.access_token);
    await markLoginStateCompleted(completedState);
    clearPendingLoginState();
    this.stopLoginCompletionPolling();
    let interconnect: InterconnectStatusResponse | null = null;
    let whoami: WhoamiResponse | null = null;
    let membership = membershipFromProduct(exchanged.product);
    try {
      whoami = await fetchWhoami(this.plugin.settings.serverUrl, exchanged.access_token);
      membership = membershipFromProduct(whoami.product);
    } catch {
      // The account remains connected when optional display details are unavailable.
    }
    try {
      interconnect = await this.bootstrapInterconnect(exchanged.access_token);
    } catch {
      // The user can parse while instance registration is retried from Account refresh.
    }
    try {
      membership = membershipFromSummary(
        await fetchEntitlementSummary(this.plugin.settings.serverUrl, exchanged.access_token),
      );
    } catch {
      // The exchanged product snapshot remains a safe fallback.
    }
    if (!isCurrentSessionToken(exchanged.access_token)) return;
    this.accountState = {
      docferryAvailable: interconnect?.grant_contract_ready ?? false,
      displayUser: whoami?.display_user ?? null,
      kind: "ready",
      membership,
      message: sessionPersisted
        ? "Connected to Bondie."
        : "Connected for this visit. Sign in again after restarting Obsidian.",
      productInstanceId:
        interconnect?.source_product_instance_id ?? exchanged.product_instance_id,
      productSubjectId: exchanged.product_subject_id,
    };
    this.docferryAvailable = interconnect?.grant_contract_ready ?? false;
    this.docferryCapabilities = new Set(interconnect?.supported_business_capabilities ?? []);
    this.activeWorkspacePanel = "home";
    this.render();
    new Notice(sessionPersisted
      ? "Bondie-Docferry account connected."
      : "Connected, but Obsidian could not save this sign-in securely.");
  }

  private async bootstrapInterconnect(token: string): Promise<InterconnectStatusResponse> {
    const platform = getPlatformSnapshot();
    return bootstrapInterconnect(this.plugin.settings.serverUrl, token, {
      client_instance_id: this.plugin.settings.clientInstanceId,
      platform: platform.label.toLowerCase(),
      plugin_version: this.plugin.manifest.version,
    });
  }

  private async clearLocalSession(): Promise<void> {
    const token = getSessionToken();
    this.stopLoginCompletionPolling();
    clearPendingLoginState();
    clearSessionToken();
    this.resetAccountScopedUi();
    const pendingCleared = await this.clearAccountScopedPendingParse();
    this.accountState = {
      kind: "logged-out",
      message: pendingCleared
        ? "Local Bondie session cleared."
        : "Signed out. Restart Obsidian to clear interrupted task data.",
    };
    this.render();

    if (!token) {
      return;
    }

    try {
      await logoutSession(this.plugin.settings.serverUrl, token);
    } catch {
      // Clearing local state is the important mobile recovery behavior.
    }
  }

  private resetAccountScopedUi(): void {
    this.parseGeneration += 1;
    this.activeJob = null;
    this.activeProgress = 0;
    this.activeResult = null;
    this.activeShareMessage = null;
    this.activeShareUrl = null;
    this.activityMessage = "";
    this.activityState = "idle";
    this.cancelRequested = false;
    this.currentUrl = "";
    this.docferryAvailable = false;
    this.docferryCapabilities.clear();
    this.docferryShares = [];
    this.docferryUsage = null;
    this.importingShareId = null;
    this.isParsing = false;
    this.isSaving = false;
    this.isSharing = false;
    this.linkMessage = "";
    this.processingExpanded = false;
    this.remoteJobs = [];
    this.shareOffset = 0;
    this.shareActionId = null;
    this.shareTotal = 0;
    this.sharesMessage = "";
    this.sharesState = "idle";
  }

  private async clearAccountScopedPendingParse(): Promise<boolean> {
    const pending = this.plugin.settings.pendingParse;
    if (!pending) return true;
    this.plugin.settings.pendingParse = null;
    try {
      await this.plugin.saveSettings();
      return true;
    } catch {
      this.plugin.settings.pendingParse = pending;
      return false;
    }
  }

  private async clearInvalidSession(error: unknown, token: string): Promise<boolean> {
    if (!isInvalidSessionError(error) || !isCurrentSessionToken(token)) return false;
    this.stopLoginCompletionPolling();
    clearPendingLoginState();
    clearSessionToken();
    this.resetAccountScopedUi();
    await this.clearAccountScopedPendingParse();
    this.activeWorkspacePanel = "account";
    this.accountState = {
      kind: "logged-out",
      message: "Your session expired. Sign in again.",
    };
    this.render();
    return true;
  }

  private isCurrentParse(generation: number, token: string): boolean {
    return this.parseGeneration === generation && isCurrentSessionToken(token);
  }

  private async completePendingLoginAttempt(state: string, generation: number): Promise<void> {
    const exchanged = await exchangePendingLogin(this.plugin.settings.serverUrl, state);
    if (this.loginPollGeneration !== generation || !exchanged) return;
    await this.acceptLoginExchange(exchanged, state);
  }

  private setStatus(message: string): void {
    if (this.statusEl) {
      this.statusEl.setText(message);
      this.statusEl.toggleClass("is-hidden", !message);
    }
  }

  private setRemoteParseStatus(job: RemoteParseJob): void {
    this.activeProgress = Math.max(0, Math.min(100, job.progress));
    this.setStatus(`${friendlyParseStatus(job.stage)} ${this.activeProgress}%`);
  }

  private focusUrlInput(): void {
    window.setTimeout(() => {
      this.urlInput?.focus();
    }, 0);
  }

  private async advanceParseStage(stage: LocalParseStage, statusText: string): Promise<void> {
    if (!this.activeJob) {
      return;
    }

    this.activeJob = advanceLocalParseJob(this.activeJob, stage, statusText);
    this.setStatus(statusText);
  }

  private async saveActiveResult(): Promise<void> {
    if (!this.activeResult || this.isSaving) {
      return;
    }

    await this.saveCompletedResult(this.activeResult, { openNote: true, showCompletion: false });
  }

  private findSavedActiveResult(): LocalHistoryItem | null {
    if (!this.activeResult) return null;
    const existing = this.plugin.settings.localHistory.find(
      (item) =>
        this.activeResult !== null &&
        matchesCaptureHistory(item, this.activeResult.parseJobId, this.activeResult.sourceUrl) &&
        Boolean(item.filePath),
    );
    if (!existing?.filePath) return null;
    return this.app.vault.getAbstractFileByPath(existing.filePath) instanceof TFile
      ? existing
      : null;
  }

  private async saveCompletedResult(
    result: ParseResult,
    options: { openNote: boolean; showCompletion: boolean },
  ): Promise<boolean> {
    if (this.isSaving) return false;

    this.isSaving = true;
    await this.advanceParseStage("saving", "Saving note to vault.");

    try {
      const existing = this.plugin.settings.localHistory.find(
        (item) =>
          matchesCaptureHistory(item, result.parseJobId, result.sourceUrl) &&
          Boolean(item.filePath),
      );
      if (existing?.filePath && this.app.vault.getAbstractFileByPath(existing.filePath) instanceof TFile) {
        await this.advanceParseStage("saved", `Already saved to ${existing.filePath}.`);
        if (options.openNote) await this.openHistoryItem(existing);
        if (options.showCompletion) this.openNoteReadyModal(existing);
        else new Notice("This note is already saved.");
        return true;
      }
      const saved = await saveParseResultToVault(this.app, this.plugin.settings, result);
      this.plugin.settings.localHistory = upsertLocalHistoryItem(
        this.plugin.settings.localHistory,
        createLocalHistoryItem({
          filePath: saved.path,
          remoteJobId: result.parseJobId,
          sourceUrl: result.sourceUrl,
          status: "saved",
          title: result.title,
        }),
      );
      await this.plugin.saveSettings();
      await this.advanceParseStage("saved", `Saved to ${saved.path}.`);
      const history = this.findSavedActiveResult();
      if (options.openNote) {
        const leaf = this.app.workspace.getLeaf("tab");
        await leaf.openFile(saved.file, { active: true });
        await this.app.workspace.revealLeaf(leaf);
      }
      if (options.showCompletion && history) this.openNoteReadyModal(history);
      else new Notice(`Saved to ${saved.path}`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save note.";
      await this.advanceParseStage("failed", message);
      new Notice(`${message} Review the result in Bondie-Docferry and save again.`);
      return false;
    } finally {
      this.isSaving = false;
      this.render();
    }
  }

  private openNoteReadyModal(history: LocalHistoryItem): void {
    new NoteReadyModal(this.app, {
      canShare: Boolean(this.docferryAvailable && this.activeResult?.parseJobId),
      onOpenNote: () => this.openHistoryItem(history),
      onShare: () => this.shareActiveResult({ confirmed: true }),
      title: this.activeResult?.title ?? history.title,
    }).open();
  }

  private async copyMarkdown(): Promise<void> {
    if (!this.activeResult) {
      return;
    }

    if (!navigator.clipboard?.writeText) {
      new Notice("Clipboard write is unavailable.");
      return;
    }

    try {
      await navigator.clipboard.writeText(this.activeResult.markdown);
      new Notice("Markdown copied.");
    } catch {
      new Notice("Clipboard write was blocked.");
    }
  }

  private async shareActiveResult(options: { confirmed?: boolean } = {}): Promise<void> {
    const token = getSessionToken();
    const requestedResult = this.activeResult;
    const parseJobId = requestedResult?.parseJobId;
    if (!token || !requestedResult || !parseJobId || !this.docferryAvailable || this.isSharing) {
      return;
    }

    if (!options.confirmed) {
      const confirmed = await confirmPublicShare(this.app);
      if (!confirmed) {
        return;
      }
    }
    if (
      !isCurrentSessionToken(token) ||
      !shareRequestMatchesActiveResult(parseJobId, this.activeResult?.parseJobId)
    ) {
      return;
    }

    this.isSharing = true;
    this.activeShareMessage = null;
    this.activeShareUrl = null;
    this.render();
    try {
      const share = await publishDocFerryShare(
        this.plugin.settings.serverUrl,
        token,
        parseJobId,
        createIdempotencyKey(parseJobId),
      );
      if (!isCurrentSessionToken(token)) return;
      this.plugin.settings.localHistory = upsertLocalHistoryItem(
        this.plugin.settings.localHistory,
        createLocalHistoryItem({
          remoteJobId: requestedResult.parseJobId,
          sourceUrl: requestedResult.sourceUrl,
          status: "shared",
          title: requestedResult.title,
        }),
      );
      await this.plugin.saveSettings();

      if (shareRequestMatchesActiveResult(parseJobId, this.activeResult?.parseJobId)) {
        this.activeShareUrl = share.url;
        this.activeShareMessage = {
          kind: "ready",
          text: "Anyone with this link can view the note.",
        };
        new Notice("Public link created.");
      } else {
        new Notice("Public link created for the previous note. Find it in shares.");
      }
    } catch (error) {
      if (!isCurrentSessionToken(token)) return;
      if (await this.clearInvalidSession(error, token)) return;
      const message = shareFailureMessage(error);
      if (shareRequestMatchesActiveResult(parseJobId, this.activeResult?.parseJobId)) {
        this.activeShareMessage = { kind: "error", text: message };
      }
      new Notice(message);
    } finally {
      this.isSharing = false;
      this.render();
    }
  }

  private async copyShareUrl(): Promise<void> {
    if (!this.activeShareUrl || !navigator.clipboard?.writeText) {
      new Notice("Clipboard access is unavailable. Open the link instead.");
      return;
    }
    try {
      await navigator.clipboard.writeText(this.activeShareUrl);
      new Notice("Link copied.");
    } catch {
      new Notice("Clipboard access was blocked. Open the link instead.");
    }
  }

  private async openHistoryItem(item: LocalHistoryItem): Promise<void> {
    if (!item.filePath) {
      return;
    }

    const file = this.app.vault.getAbstractFileByPath(item.filePath);
    if (!(file instanceof TFile)) {
      new Notice("Saved note was not found.");
      return;
    }

    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.openFile(file, { active: true });
    await this.app.workspace.revealLeaf(leaf);
  }
}

function confirmPublicShare(app: App): Promise<boolean> {
  return confirmAction(app, {
    confirmLabel: "Create public link",
    message: "Anyone with the link can view this note. Your vault and account details are not shared.",
    title: "Create a public link?",
  });
}

interface NoteReadyOptions {
  canShare: boolean;
  onOpenNote: () => void | Promise<void>;
  onShare: () => void | Promise<void>;
  title: string;
}

class NoteReadyModal extends Modal {
  constructor(
    app: App,
    private readonly options: NoteReadyOptions,
  ) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass("bdf-note-ready-modal");
    this.titleEl.setText("Saved privately");
    this.contentEl.createEl("p", {
      cls: "bdf-note-ready-title",
      text: this.options.title,
    });
    this.contentEl.createEl("p", {
      cls: "bdf-note-ready-detail",
      text: this.options.canShare
        ? "The note is in your vault. Keep it private, or create a public link that anyone with the link can view."
        : "The note is in your vault and stays private unless you share it later.",
    });
    const actions = this.contentEl.createDiv({ cls: "bdf-modal-actions bdf-note-ready-actions" });
    const openNote = actions.createEl("button", {
      cls: "mod-cta",
      text: "Open note",
      type: "button",
    });
    openNote.addEventListener("click", () => {
      this.close();
      void this.options.onOpenNote();
    });
    if (this.options.canShare) {
      const share = actions.createEl("button", { text: "Share", type: "button" });
      share.addEventListener("click", () => {
        this.close();
        void this.options.onShare();
      });
    }
    const keepPrivate = actions.createEl("button", {
      cls: "bdf-keep-private",
      text: "Keep private",
      type: "button",
    });
    keepPrivate.addEventListener("click", () => this.close());
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

interface ConfirmActionOptions {
  confirmLabel: string;
  message: string;
  title: string;
}

function confirmAction(app: App, options: ConfirmActionOptions): Promise<boolean> {
  return new Promise((resolve) => {
    new ConfirmActionModal(app, options, resolve).open();
  });
}

class ConfirmActionModal extends Modal {
  private resolved = false;

  constructor(
    app: App,
    private readonly options: ConfirmActionOptions,
    private readonly resolveResult: (confirmed: boolean) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(this.options.title);
    this.contentEl.createEl("p", {
      text: this.options.message,
    });
    const actions = this.contentEl.createDiv({ cls: "bdf-modal-actions" });
    const cancel = actions.createEl("button", { text: "Cancel", type: "button" });
    cancel.addEventListener("click", () => this.finish(false));
    const confirm = actions.createEl("button", {
      cls: "mod-cta",
      text: this.options.confirmLabel,
      type: "button",
    });
    confirm.addEventListener("click", () => this.finish(true));
  }

  onClose(): void {
    if (!this.resolved) this.finish(false);
    this.contentEl.empty();
  }

  private finish(result: boolean): void {
    if (this.resolved) return;
    this.resolved = true;
    this.resolveResult(result);
    this.close();
  }
}

function editShareAccess(
  app: App,
  detail: DocFerryShareDetailResponse,
): Promise<DocFerryShareAccessUpdate | null> {
  return new Promise((resolve) => {
    new ShareAccessModal(app, detail, resolve).open();
  });
}

class ShareAccessModal extends Modal {
  private resolved = false;

  constructor(
    app: App,
    private readonly detail: DocFerryShareDetailResponse,
    private readonly resolveResult: (update: DocFerryShareAccessUpdate | null) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText("Manage public link");
    const form = this.contentEl.createEl("form", { cls: "bdf-share-access-form" });
    const titleInput = createModalTextInput(form, "Title", this.detail.title);

    const passwordField = createModalField(form, "Password");
    const passwordMode = passwordField.createEl("select", {
      attr: { "aria-label": "Password action" },
    });
    addSelectOption(passwordMode, "keep", this.detail.password_enabled ? "Keep password" : "No change");
    addSelectOption(passwordMode, "set", this.detail.password_enabled ? "Change password" : "Add password");
    if (this.detail.password_enabled) addSelectOption(passwordMode, "clear", "Remove password");
    const passwordInput = passwordField.createEl("input", {
      attr: {
        "aria-label": "New password",
        autocomplete: "new-password",
        placeholder: "New password",
        type: "password",
      },
    });
    passwordInput.hidden = true;
    passwordMode.addEventListener("change", () => {
      passwordInput.hidden = passwordMode.value !== "set";
      if (!passwordInput.hidden) passwordInput.focus();
    });

    const expiryField = createModalField(form, "Expiry");
    const expiryMode = expiryField.createEl("select", {
      attr: { "aria-label": "Expiry action" },
    });
    addSelectOption(expiryMode, "keep", this.detail.expires_at ? "Keep expiry" : "No change");
    addSelectOption(expiryMode, "set", this.detail.expires_at ? "Change expiry" : "Set expiry");
    if (this.detail.expires_at) addSelectOption(expiryMode, "clear", "Remove expiry");
    const expiryInput = expiryField.createEl("input", {
      attr: {
        "aria-label": "Expiry date and time",
        type: "datetime-local",
      },
      value: this.detail.expires_at ? toDatetimeLocalValue(this.detail.expires_at) : "",
    });
    expiryInput.hidden = true;
    expiryMode.addEventListener("change", () => {
      expiryInput.hidden = expiryMode.value !== "set";
      if (!expiryInput.hidden) expiryInput.focus();
    });

    const error = form.createDiv({ cls: "bdf-form-error" });
    const actions = form.createDiv({ cls: "bdf-modal-actions" });
    const cancel = actions.createEl("button", { text: "Cancel", type: "button" });
    cancel.addEventListener("click", () => this.finish(null));
    const save = actions.createEl("button", {
      cls: "mod-cta",
      text: "Save changes",
      type: "submit",
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const title = titleInput.value.trim();
      if (!title) {
        error.setText("Add a title for this public link.");
        titleInput.focus();
        return;
      }
      const update: DocFerryShareAccessUpdate = {
        expiration_mode: expiryMode.value as DocFerryShareAccessUpdate["expiration_mode"],
        password_mode: passwordMode.value as DocFerryShareAccessUpdate["password_mode"],
        title,
      };
      if (update.password_mode === "set") {
        if (!passwordInput.value) {
          error.setText("Enter the new password.");
          passwordInput.focus();
          return;
        }
        update.password = passwordInput.value;
      }
      if (update.expiration_mode === "set") {
        const expiry = new Date(expiryInput.value);
        if (!expiryInput.value || Number.isNaN(expiry.getTime()) || expiry.getTime() <= Date.now()) {
          error.setText("Choose a future expiry date and time.");
          expiryInput.focus();
          return;
        }
        update.expires_at = expiry.toISOString();
      }
      save.disabled = true;
      this.finish(update);
    });
  }

  onClose(): void {
    if (!this.resolved) this.finish(null);
    this.contentEl.empty();
  }

  private finish(update: DocFerryShareAccessUpdate | null): void {
    if (this.resolved) return;
    this.resolved = true;
    this.resolveResult(update);
    this.close();
  }
}

function createModalField(parent: HTMLElement, label: string): HTMLElement {
  const field = parent.createDiv({ cls: "bdf-modal-field" });
  field.createEl("label", { text: label });
  return field;
}

function createModalTextInput(parent: HTMLElement, label: string, value: string): HTMLInputElement {
  const field = createModalField(parent, label);
  return field.createEl("input", {
    attr: { "aria-label": label, type: "text" },
    value,
  });
}

function addSelectOption(select: HTMLSelectElement, value: string, label: string): void {
  select.createEl("option", { text: label, value });
}

function toDatetimeLocalValue(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function isRemoteTerminal(job: RemoteParseJob): boolean {
  return job.stage === "complete" || job.stage === "failed" || job.stage === "cancelled";
}

function toViewParseResult(result: RemoteParseResult): ParseResult {
  return {
    createdAt: result.created_at,
    fileStem: `${result.created_at.slice(0, 10)} ${result.title}`,
    host: result.source_host,
    markdown: result.markdown,
    parseJobId: result.parse_job_id,
    sourceUrl: result.source_url,
    summary: result.summary,
    title: result.title,
  };
}

function createIdempotencyKey(parseJobId: string): string {
  return `bdf_share_${parseJobId}`.slice(0, 128);
}

function createParseRequestKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `bdf_parse_${Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")}`;
}

class TerminalParseError extends Error {
  constructor() {
    super("The source could not be turned into a note.");
    this.name = "TerminalParseError";
  }
}

function normalizePublicShareReference(sourceUrl: string): string {
  try {
    const parsed = new URL(sourceUrl);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return sourceUrl.trim();
  }
}

function formatHistoryDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return date.toLocaleString([], {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  });
}

function formatResetDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "later";
  return date.toLocaleDateString([], {
    day: "numeric",
    month: "short",
  });
}

function shareStatusLabel(status: string): string {
  switch (status) {
    case "published":
      return "Published";
    case "password_protected":
      return "Password protected";
    case "expired":
      return "Expired";
    case "stopped":
      return "Stopped";
    default:
      return status.replace(/_/g, " ");
  }
}

function friendlyParseStatus(stage: RemoteParseJob["stage"]): string {
  switch (stage) {
    case "received":
    case "metadata":
      return "Reading the link";
    case "transcript":
      return "Preparing the transcript";
    case "structure":
      return "Organizing key ideas";
    case "template":
      return "Writing your note";
    case "complete":
      return "Note ready";
    case "cancelled":
      return "Cancelled";
    case "failed":
      return "Could not create note";
  }
}

function friendlyErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof TerminalParseError) {
    return "This link could not be turned into a note. Try another article, audio, or video link.";
  }
  if (error instanceof BondieApiError) {
    if (isInvalidSessionError(error)) return "Your session expired. Sign in again.";
    if (error.code === "MEDIA_PRO_REQUIRED") {
      return "This feature is included with DocFerry Pro. Open Account & membership.";
    }
    if (
      error.code === "MEDIA_CONNECTION_NOT_READY" ||
      error.code === "MEDIA_DOCFERRY_NOT_READY"
    ) {
      return DOCFERRY_CONNECTION_PENDING_MESSAGE;
    }
    if (error.code.includes("QUOTA")) return "Your current usage limit has been reached.";
    if (error.code.includes("SOURCE") || error.code.includes("URL")) {
      return "This link is not supported yet. Try another article, audio, or video link.";
    }
    if (error.retryable || error.status >= 500) {
      return "The service is temporarily unavailable. Try again in a moment.";
    }
  }
  if (error instanceof TypeError) {
    return "Check your connection and try again.";
  }
  return fallback;
}

function friendlyImportError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("password")) return "This link is password protected and cannot be imported yet.";
  if (message.includes("no longer available")) return "This shared note is no longer available.";
  if (message.includes("too large")) return "This shared note is too large to import on mobile.";
  if (message.includes("production DocFerry share URL") || message.includes("share URL")) {
    return "Paste a valid DocFerry share link.";
  }
  return friendlyErrorMessage(error, "The note could not be imported. Check the link and try again.");
}

type AccountPanelState =
  | {
      kind: "idle" | "loading" | "logged-out";
      message: string;
    }
  | {
      kind: "not-configured";
      details: AuthSelfCheckResponse | null;
      message: string;
      missingKeys: string[];
    }
  | {
      docferryAvailable: boolean;
      displayUser: DisplayUser | null;
      kind: "ready";
      membership: "docferry-pro" | "free";
      message: string;
      productInstanceId: string | null;
      productSubjectId: string | null;
    }
  | {
      kind: "error" | "server-unavailable";
      code?: string;
      message: string;
    };

function buildAccountStateFromSelfCheck(selfCheck: AuthSelfCheckResponse): AccountPanelState {
  if (!selfCheck.configured) {
    return {
      kind: "not-configured",
      details: selfCheck,
      message: "Account sign-in is temporarily unavailable.",
      missingKeys: selfCheck.missing_config_keys,
    };
  }

  if (!getSessionToken()) {
    return {
      kind: "logged-out",
      message: selfCheck.login_available
        ? "Sign in with your Bondie account to create notes and manage DocFerry shares."
        : "Account sign-in is temporarily unavailable.",
    };
  }

  return {
    kind: "loading",
    message: "Checking current session.",
  };
}

function buildAccountStateFromWhoami(
  whoami: WhoamiResponse,
  interconnect: InterconnectStatusResponse | null,
  membership = membershipFromProduct(whoami.product),
): AccountPanelState {
  if (!whoami.authenticated) {
    return {
      kind: "logged-out",
      message: "Current session is not authenticated.",
    };
  }

  return {
    docferryAvailable: interconnect?.grant_contract_ready ?? false,
    displayUser: whoami.display_user ?? null,
    kind: "ready",
    membership,
    message: "Connected to Bondie.",
    productInstanceId:
      interconnect?.source_product_instance_id ?? whoami.product_instance_id,
    productSubjectId: whoami.product_subject_id,
  };
}

function renderAccountIdentity(
  parent: HTMLElement,
  user: DisplayUser | null,
  connectionMessage: string,
): void {
  const identity = parent.createDiv({ cls: "bdf-account-identity" });
  const avatar = identity.createDiv({
    attr: { "aria-hidden": "true" },
    cls: "bdf-account-avatar",
  });
  const fallback = initialsFromDisplayUser(user);
  const pictureUrl = safeAvatarUrl(user?.picture);
  if (pictureUrl) {
    const image = avatar.createEl("img", {
      attr: {
        alt: "",
        decoding: "async",
        loading: "lazy",
        referrerpolicy: "no-referrer",
        src: pictureUrl,
      },
    });
    image.addEventListener("error", () => {
      image.remove();
      avatar.setText(fallback);
    }, { once: true });
  } else {
    avatar.setText(fallback);
  }

  const details = identity.createDiv({ cls: "bdf-account-identity-copy" });
  const displayName = displayNameFromUser(user);
  details.createDiv({
    attr: { "aria-level": "3", role: "heading" },
    cls: "bdf-card-title",
    text: displayName,
  });
  if (user?.email && user.email !== displayName) {
    details.createEl("p", { cls: "bdf-account-email", text: user.email });
  }
  details.createEl("p", { cls: "bdf-account-message", text: connectionMessage });
}

function safeAvatarUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function membershipFromProduct(product: Record<string, unknown> | null): "docferry-pro" | "free" {
  const entitlements = product?.entitlements;
  if (!Array.isArray(entitlements)) return "free";

  return entitlements.some((value) => {
    if (!value || typeof value !== "object") return false;
    const entitlement = value as Record<string, unknown>;
    return entitlement.key === "bondie-docferry.pro" && entitlement.status === "active";
  })
    ? "docferry-pro"
    : "free";
}

function membershipFromSummary(
  summary: EntitlementSummaryResponse,
): "docferry-pro" | "free" {
  return summary.plan === "docferry_pro" && summary.membership_status === "active"
    ? "docferry-pro"
    : "free";
}

function buildAccountStateFromError(error: unknown): AccountPanelState {
  if (error instanceof BondieApiError) {
    if (error.code === "AUTH_NOT_CONFIGURED") {
      return {
        kind: "not-configured",
        details: null,
        message: error.message,
        missingKeys: [],
      };
    }

    if ([
      "AUTH_REQUIRED",
      "AUTH_SESSION_INVALID",
      "AUTH_SESSION_REFRESH_REQUIRED",
      "AUTH_SESSION_REVOKED",
    ].includes(error.code)) {
      return {
        kind: "logged-out",
        message: "Your session expired. Sign in again.",
      };
    }

    return {
      code: error.code,
      kind: "error",
      message: friendlyErrorMessage(
        error,
        "Your account could not be checked. Try again in a moment.",
      ),
    };
  }

  return {
    kind: "server-unavailable",
    message: friendlyErrorMessage(error, "Your account could not be checked. Try again in a moment."),
  };
}

function isInvalidSessionError(error: unknown): boolean {
  return error instanceof BondieApiError && [
    "AUTH_REQUIRED",
    "AUTH_SESSION_INVALID",
    "AUTH_SESSION_REFRESH_REQUIRED",
    "AUTH_SESSION_REVOKED",
  ].includes(error.code);
}

function isCurrentSessionToken(token: string): boolean {
  return getSessionToken() === token;
}

function isRecoverableConnectionError(error: unknown): boolean {
  return error instanceof TypeError ||
    (error instanceof BondieApiError && (error.retryable || error.status >= 500));
}

function accountHeading(state: AccountPanelState): string {
  switch (state.kind) {
    case "ready":
      return "Signed in";
    case "not-configured":
      return "Sign-in unavailable";
    case "logged-out":
      return "Sign in to Bondie";
    case "server-unavailable":
      return "Server unavailable";
    case "loading":
      return "Checking";
    case "error":
      return "Sign-in needs attention";
    case "idle":
      return "Account";
  }
}

function accountStatusLabel(state: AccountPanelState): string {
  switch (state.kind) {
    case "ready":
      return "Connected";
    case "logged-out":
      return "Not signed in";
    case "loading":
      return "Checking";
    case "server-unavailable":
      return "Service unavailable";
    case "not-configured":
    case "error":
      return "Needs attention";
    case "idle":
      return "Not checked";
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}
