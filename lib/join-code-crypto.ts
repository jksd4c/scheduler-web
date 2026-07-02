import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";

function getEncryptionKey() {
  const secret = process.env.JOIN_CODE_ENCRYPTION_KEY || process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("JOIN_CODE_ENCRYPTION_KEY_OR_AUTH_SECRET_MISSING");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptJoinCode(code: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(code, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

export function decryptJoinCode(encryptedCode: string | null | undefined) {
  if (!encryptedCode) return null;
  const [version, ivText, tagText, dataText] = encryptedCode.split(":");
  if (version !== "v1" || !ivText || !tagText || !dataText) return null;
  const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataText, "base64url")), decipher.final()]).toString("utf8");
}
