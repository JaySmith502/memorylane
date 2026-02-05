import { app } from 'electron';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { CaptureSettings } from '../../shared/types';
import {
  DEFAULT_VISUAL_DETECTOR_CONFIG,
  DEFAULT_INTERACTION_MONITOR_CONFIG,
} from '../../shared/constants';
import log from '../logger';

export interface CaptureSettingsManagerEvents {
  changed: (settings: CaptureSettings) => void;
}

export class CaptureSettingsManager extends EventEmitter {
  private configPath: string;
  private cachedSettings: CaptureSettings | null = null;

  constructor() {
    super();
    this.configPath = path.join(app.getPath('userData'), 'capture-settings.json');
  }

  /**
   * Get default settings from constants
   */
  public getDefaultSettings(): CaptureSettings {
    return {
      visualDetector: {
        enabled: DEFAULT_VISUAL_DETECTOR_CONFIG.ENABLED,
        dhashThresholdPercent: DEFAULT_VISUAL_DETECTOR_CONFIG.DHASH_THRESHOLD_PERCENT,
      },
      interactionMonitor: {
        enabled: DEFAULT_INTERACTION_MONITOR_CONFIG.ENABLED,
        typingSessionTimeoutMs: DEFAULT_INTERACTION_MONITOR_CONFIG.TYPING_SESSION_TIMEOUT_MS,
        scrollSessionTimeoutMs: DEFAULT_INTERACTION_MONITOR_CONFIG.SCROLL_SESSION_TIMEOUT_MS,
      },
    };
  }

  /**
   * Get current settings (merged from stored + defaults)
   */
  public getSettings(): CaptureSettings {
    if (this.cachedSettings) {
      return this.cachedSettings;
    }

    const defaults = this.getDefaultSettings();
    const stored = this.loadStoredSettings();

    // Deep merge stored settings into defaults
    const merged: CaptureSettings = {
      visualDetector: {
        ...defaults.visualDetector,
        ...stored?.visualDetector,
      },
      interactionMonitor: {
        ...defaults.interactionMonitor,
        ...stored?.interactionMonitor,
      },
    };

    this.cachedSettings = merged;
    return merged;
  }

  /**
   * Save settings (partial update supported)
   */
  public saveSettings(partialSettings: Partial<CaptureSettings>): void {
    const current = this.getSettings();

    // Merge partial settings into current
    const updated: CaptureSettings = {
      visualDetector: {
        ...current.visualDetector,
        ...partialSettings.visualDetector,
      },
      interactionMonitor: {
        ...current.interactionMonitor,
        ...partialSettings.interactionMonitor,
      },
    };

    // Save to disk
    fs.writeFileSync(this.configPath, JSON.stringify(updated, null, 2));
    this.cachedSettings = updated;

    log.info('[CaptureSettingsManager] Settings saved');

    // Emit change event
    this.emit('changed', updated);
  }

  /**
   * Reset settings to defaults (delete stored file)
   */
  public resetToDefaults(): void {
    if (fs.existsSync(this.configPath)) {
      fs.unlinkSync(this.configPath);
      log.info('[CaptureSettingsManager] Settings reset to defaults');
    }

    this.cachedSettings = null;
    const defaults = this.getSettings();

    // Emit change event with defaults
    this.emit('changed', defaults);
  }

  /**
   * Check if custom settings exist
   */
  public hasCustomSettings(): boolean {
    return fs.existsSync(this.configPath);
  }

  /**
   * Load stored settings from disk
   */
  private loadStoredSettings(): Partial<CaptureSettings> | null {
    if (!fs.existsSync(this.configPath)) {
      return null;
    }

    try {
      const data = fs.readFileSync(this.configPath, 'utf-8');
      return JSON.parse(data) as Partial<CaptureSettings>;
    } catch (error) {
      log.error('[CaptureSettingsManager] Error reading stored settings:', error);
      return null;
    }
  }

  // Type-safe event emitter methods
  public override on<K extends keyof CaptureSettingsManagerEvents>(
    event: K,
    listener: CaptureSettingsManagerEvents[K]
  ): this {
    return super.on(event, listener);
  }

  public override emit<K extends keyof CaptureSettingsManagerEvents>(
    event: K,
    ...args: Parameters<CaptureSettingsManagerEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }
}
