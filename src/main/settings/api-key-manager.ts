import { app, safeStorage } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

export type KeySource = 'stored' | 'env' | 'none';

export interface KeyStatus {
  hasKey: boolean;
  source: KeySource;
  maskedKey: string | null;
}

export class ApiKeyManager {
  private configPath: string;
  private cachedKey: string | null = null;

  constructor() {
    this.configPath = path.join(app.getPath('userData'), 'secure-config.json');
  }

  /**
   * Save API key using Electron's safeStorage for encryption
   */
  public saveApiKey(key: string): void {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Secure storage is not available on this system');
    }

    const encrypted = safeStorage.encryptString(key);
    const config = { apiKey: encrypted.toString('base64') };

    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
    this.cachedKey = key;

    console.log('[ApiKeyManager] API key saved securely');
  }

  /**
   * Get the API key with priority: stored > env > null
   */
  public getApiKey(): string | null {
    // Return cached key if available
    if (this.cachedKey) {
      return this.cachedKey;
    }

    // Try stored key first
    const storedKey = this.getStoredKey();
    if (storedKey) {
      this.cachedKey = storedKey;
      return storedKey;
    }

    // Fallback to environment variable
    const envKey = process.env.OPENROUTER_API_KEY;
    if (envKey) {
      return envKey;
    }

    return null;
  }

  /**
   * Get the stored key from encrypted storage
   */
  private getStoredKey(): string | null {
    if (!fs.existsSync(this.configPath)) {
      return null;
    }

    if (!safeStorage.isEncryptionAvailable()) {
      console.warn('[ApiKeyManager] Secure storage not available, cannot decrypt key');
      return null;
    }

    try {
      const configData = fs.readFileSync(this.configPath, 'utf-8');
      const config = JSON.parse(configData);

      if (!config.apiKey) {
        return null;
      }

      const encryptedBuffer = Buffer.from(config.apiKey, 'base64');
      return safeStorage.decryptString(encryptedBuffer);
    } catch (error) {
      console.error('[ApiKeyManager] Error reading stored key:', error);
      return null;
    }
  }

  /**
   * Check if there's a stored key (not env)
   */
  public hasStoredApiKey(): boolean {
    return this.getStoredKey() !== null;
  }

  /**
   * Delete the stored API key
   */
  public deleteApiKey(): void {
    if (fs.existsSync(this.configPath)) {
      fs.unlinkSync(this.configPath);
      console.log('[ApiKeyManager] API key deleted');
    }
    this.cachedKey = null;
  }

  /**
   * Get the source of the current API key
   */
  public getKeySource(): KeySource {
    if (this.getStoredKey()) {
      return 'stored';
    }
    if (process.env.OPENROUTER_API_KEY) {
      return 'env';
    }
    return 'none';
  }

  /**
   * Get current key status for UI display
   */
  public getKeyStatus(): KeyStatus {
    const key = this.getApiKey();
    const source = this.getKeySource();

    return {
      hasKey: key !== null,
      source,
      maskedKey: key ? this.maskKey(key) : null,
    };
  }

  /**
   * Mask API key for display (show first 7 and last 4 characters)
   */
  private maskKey(key: string): string {
    if (key.length <= 12) {
      return '****';
    }
    return `${key.substring(0, 7)}...${key.substring(key.length - 4)}`;
  }
}
