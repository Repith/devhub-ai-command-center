import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes
} from "node:crypto";

export class TokenCrypto {
  public encrypt(secret: string, value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key(secret), iv);
    const encrypted = Buffer.concat([
      cipher.update(value, "utf8"),
      cipher.final()
    ]);
    const tag = cipher.getAuthTag();
    return [iv, tag, encrypted]
      .map((part) => part.toString("base64url"))
      .join(".");
  }

  public decrypt(secret: string, value: string): string {
    const [ivText, tagText, encryptedText] = value.split(".");
    if (!ivText || !tagText || !encryptedText) {
      throw new Error("Encrypted token payload is malformed.");
    }
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key(secret),
      Buffer.from(ivText, "base64url")
    );
    decipher.setAuthTag(Buffer.from(tagText, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedText, "base64url")),
      decipher.final()
    ]).toString("utf8");
  }
}

export const tokenCrypto = new TokenCrypto();

function key(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}
