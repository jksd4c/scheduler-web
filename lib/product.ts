export const APP_MODE = process.env.APP_MODE || "BETA_FREE";

export const PRODUCT_NAME = "公平排班";
export const PRODUCT_VERSION_LABEL = "公平排班 v0.1 免费测试服";
export const PRODUCT_TAGLINE = "公平、透明、可解释的科室排班工具";
export const PRODUCT_SUBTAGLINE = "让排班有依据，让公平看得见。";
export const PRODUCT_AUTHOR = "by: jks";

export function isBetaFreeMode() {
  return APP_MODE === "BETA_FREE";
}
