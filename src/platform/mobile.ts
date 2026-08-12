import { Platform } from "obsidian";

export interface PlatformSnapshot {
  isAndroid: boolean;
  isDesktop: boolean;
  isMobile: boolean;
  isPhone: boolean;
  label: string;
}

export function getPlatformSnapshot(): PlatformSnapshot {
  let label = "Desktop";

  if (Platform.isAndroidApp) {
    label = "Android";
  } else if (Platform.isIosApp) {
    label = "iOS";
  } else if (Platform.isMobileApp) {
    label = "Mobile";
  }

  return {
    isAndroid: Platform.isAndroidApp,
    isDesktop: Platform.isDesktop,
    isMobile: Platform.isMobile,
    isPhone: Platform.isPhone,
    label,
  };
}
