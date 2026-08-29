/** Design preview routes — Options 1–6. */

/** Hub page listing all layout options (Option 1–6). */
export const DESIGN_HUB_PATH = "/design-preview";

export type DesignVariant =
  | "option1"
  | "option2"
  | "option3"
  | "option4"
  | "option5"
  | "option6";

export interface ParsedDesignPath {
  variant: DesignVariant;
  appPath: string;
  isPreviewRoute: boolean;
}

export function parseDesignPath(rawPath: string): ParsedDesignPath {
  const path = rawPath.replace(/\/+$/, "") || "/";

  if (path === "/option-1" || path.startsWith("/option-1/")) {
    return { variant: "option1", appPath: path.slice("/option-1".length) || "/", isPreviewRoute: true };
  }
  if (path === "/option-2" || path.startsWith("/option-2/")) {
    return { variant: "option2", appPath: path.slice("/option-2".length) || "/", isPreviewRoute: true };
  }
  if (path === "/option-3" || path.startsWith("/option-3/")) {
    return { variant: "option3", appPath: path.slice("/option-3".length) || "/", isPreviewRoute: true };
  }
  if (path === "/option-4" || path.startsWith("/option-4/")) {
    return { variant: "option4", appPath: path.slice("/option-4".length) || "/", isPreviewRoute: true };
  }
  if (path === "/option-5" || path.startsWith("/option-5/")) {
    return { variant: "option5", appPath: path.slice("/option-5".length) || "/", isPreviewRoute: true };
  }
  if (path === "/option-6" || path.startsWith("/option-6/")) {
    return { variant: "option6", appPath: path.slice("/option-6".length) || "/", isPreviewRoute: true };
  }

  return { variant: "option1", appPath: path, isPreviewRoute: false };
}

export function designHomeHref(variant: DesignVariant): string {
  if (variant === "option2") return "/option-2";
  if (variant === "option3") return "/option-3";
  if (variant === "option4") return "/option-4";
  if (variant === "option5") return "/option-5";
  if (variant === "option6") return "/option-6";
  return "/option-1";
}

export function designDeskHref(variant: DesignVariant): string {
  if (variant === "option2") return "/option-2/dashboard";
  if (variant === "option3") return "/option-3/dashboard";
  if (variant === "option4") return "/option-4/dashboard";
  if (variant === "option5") return "/option-5/dashboard";
  if (variant === "option6") return "/option-6/dashboard";
  return "/option-1/dashboard";
}

export function designGetStartedHref(_variant: DesignVariant): string {
  return "/get-started";
}

export function variantPublicHome(variant: DesignVariant): string {
  if (variant === "option2") return "/option-2";
  if (variant === "option3") return "/option-3";
  if (variant === "option4") return "/option-4";
  if (variant === "option5") return "/option-5";
  if (variant === "option6") return "/option-6";
  return "/";
}

export function variantPublicDesk(variant: DesignVariant): string {
  if (variant === "option2") return "/option-2/dashboard";
  if (variant === "option3") return "/option-3/dashboard";
  if (variant === "option4") return "/option-4/dashboard";
  if (variant === "option5") return "/option-5/dashboard";
  if (variant === "option6") return "/option-6/dashboard";
  return "/dashboard";
}
