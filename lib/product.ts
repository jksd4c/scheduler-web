export const APP_MODE = process.env.APP_MODE || "BETA_FREE";

export const PRODUCT_NAME = "公平排班";
export const PRODUCT_VERSION_LABEL = "公平排班 v0.1 免费测试服";
export const PRODUCT_TAGLINE = "公平，公平，还是他妈的公平";
export const PRODUCT_AUTHOR = "by: jks";

export function isBetaFreeMode() {
  return APP_MODE === "BETA_FREE";
}
