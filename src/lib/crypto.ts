import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

/**
 * 备份加密工具类
 * 采用 AES-256-GCM 算法，确保内容加密且不可篡改
 */
export class BackupCrypto {
  private static readonly ALGORITHM = "aes-256-gcm";
  private static readonly IV_LENGTH = 12;
  private static readonly SALT_LENGTH = 16;
  private static readonly KEY_LENGTH = 32;

  /**
   * 加密数据
   */
  static encrypt(data: string, password: string): Buffer {
    const salt = randomBytes(this.SALT_LENGTH);
    const key = scryptSync(password, salt, this.KEY_LENGTH);
    const iv = randomBytes(this.IV_LENGTH);

    const cipher = createCipheriv(this.ALGORITHM, key, iv);
    
    const encrypted = Buffer.concat([
      cipher.update(data, "utf8"),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    // 结构：Salt (16) + IV (12) + AuthTag (16) + EncryptedData
    return Buffer.concat([salt, iv, authTag, encrypted]);
  }

  /**
   * 解密数据
   */
  static decrypt(encryptedBuffer: Buffer, password: string): string {
    const salt = encryptedBuffer.subarray(0, this.SALT_LENGTH);
    const iv = encryptedBuffer.subarray(this.SALT_LENGTH, this.SALT_LENGTH + this.IV_LENGTH);
    const authTag = encryptedBuffer.subarray(
      this.SALT_LENGTH + this.IV_LENGTH,
      this.SALT_LENGTH + this.IV_LENGTH + 16
    );
    const encryptedData = encryptedBuffer.subarray(this.SALT_LENGTH + this.IV_LENGTH + 16);

    const key = scryptSync(password, salt, this.KEY_LENGTH);
    const decipher = createDecipheriv(this.ALGORITHM, key, iv);
    
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encryptedData),
      decipher.final(),
    ]);

    return decrypted.toString("utf8");
  }
}
