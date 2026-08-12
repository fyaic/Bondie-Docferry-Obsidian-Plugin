import { setIcon } from "obsidian";

export function createSection(parent: HTMLElement, title: string): HTMLElement {
  const section = parent.createDiv({ cls: "bdf-section" });
  section.createDiv({
    attr: { "aria-level": "2", role: "heading" },
    cls: "bdf-section-title",
    text: title,
  });
  return section;
}

export function createStatusPill(parent: HTMLElement, label: string, variant: "ok" | "muted" | "warn"): void {
  const pill = parent.createDiv({ cls: `bdf-pill bdf-pill-${variant}` });
  pill.setText(label);
}

export function createIconButton(
  parent: HTMLElement,
  icon: string,
  label: string,
  onClick: () => void | Promise<void>,
): HTMLButtonElement {
  const button = parent.createEl("button", {
    attr: { "aria-label": label, type: "button" },
    cls: "bdf-icon-button",
  });
  const iconEl = button.createSpan({ cls: "bdf-icon" });
  setIcon(iconEl, icon);
  button.createSpan({ cls: "bdf-button-label", text: label });
  button.addEventListener("click", () => {
    void onClick();
  });
  return button;
}

export function createIconOnlyButton(
  parent: HTMLElement,
  icon: string,
  label: string,
  onClick: () => void | Promise<void>,
): HTMLButtonElement {
  const button = parent.createEl("button", {
    attr: { "aria-label": label, title: label, type: "button" },
    cls: "bdf-icon-only-button",
  });
  setIcon(button, icon);
  button.addEventListener("click", () => {
    void onClick();
  });
  return button;
}

export function createEmptyState(parent: HTMLElement, title: string, detail: string): void {
  const empty = parent.createDiv({ cls: "bdf-empty" });
  empty.createEl("strong", { text: title });
  empty.createSpan({ text: detail });
}
