import crypto from "node:crypto";

const KEY_LENGTH = 64;

export function hashSecret(secret: string) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const hash = crypto.scryptSync(secret, salt, KEY_LENGTH).toString("base64url");
  return `scrypt:${salt}:${hash}`;
}

export function verifySecret(secret: string, storedHash: string) {
  const [scheme, salt, hash] = storedHash.split(":");
  if (scheme !== "scrypt" || !salt || !hash) {
    return false;
  }

  const expected = Buffer.from(hash, "base64url");
  const actual = crypto.scryptSync(secret, salt, expected.length);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

export function createPlainToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("base64url");
}

export function createAccessCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let index = 0; index < 10; index += 1) {
    code += alphabet[crypto.randomInt(alphabet.length)];
  }
  return code.replace(/(.{5})/g, "$1-").replace(/-$/, "");
}
