/**
 * MemoryLane - Main Process Entry Point
 * 
 * Supports two modes:
 * - Recorder Mode (default): Full tray app with screenshot capture and processing
 * - MCP Server Mode (--mcp flag): Headless server for AI assistant integration
 */

// Detect MCP mode FIRST, before any heavy imports
const isMCPMode = process.argv.includes('--mcp');

// In MCP mode, redirect console.log to stderr immediately
// MCP protocol requires stdout to be used ONLY for JSON-RPC messages
if (isMCPMode) {
  const originalLog = console.log.bind(console);
  console.log = (...args: unknown[]) => {
    console.error(...args);
  };
  // Keep a reference to write to stdout if needed (for debugging only)
  (console as unknown as { _originalLog: typeof originalLog })._originalLog = originalLog;
}

import { app, Tray, Menu, nativeImage } from 'electron';
import path from 'node:path';
import { EventProcessor } from './processor/index';
import { EmbeddingService } from './processor/embedding';
import { StorageService } from './processor/storage';
import { SemanticClassifierService } from './processor/semantic-classifier';
import { ApiKeyManager } from './settings/api-key-manager';
import { initSettingsIPC, openSettingsWindow } from './settings/settings-window';
import { Screenshot } from '../shared/types';
import dotenv from 'dotenv';

try {
  dotenv.config();
} catch (e) {
  // cwd might not be available in packaged app context — expected, we don't need .env there
}

// Prevent app from quitting when all windows are closed (tray app or MCP server)
app.on('window-all-closed', () => {
  // Don't quit - this is a tray app or MCP server
});

// macOS: Hide dock icon (for both modes - tray app and MCP server)
if (process.platform === 'darwin') {
  app.dock?.hide();
}

if (isMCPMode) {
  // ============================================
  // MCP SERVER MODE
  // ============================================
  // Headless mode - no tray, no recorder, just search services

  app.on('ready', async () => {
    console.log('[MCP Mode] Starting MemoryLane MCP Server...');

    try {
      // Initialize API key manager for secure key storage
      const apiKeyManager = new ApiKeyManager();

      // Initialize only the services needed for search
      const embeddingService = new EmbeddingService();
      const storageService = new StorageService(StorageService.getDefaultDbPath());
      const classifierService = new SemanticClassifierService(apiKeyManager.getApiKey() || undefined);
      const processor = new EventProcessor(embeddingService, storageService, classifierService);

      console.log('[MCP Mode] Services initialized');

      // Dynamically import MCP server to avoid loading it in recorder mode
      const { MemoryLaneMCPServer } = await import('./mcp/server');
      const mcpServer = new MemoryLaneMCPServer(processor);

      // Start the server (this will use stdio transport)
      await mcpServer.start();

      console.log('[MCP Mode] MCP Server started successfully');
    } catch (error) {
      console.error('[MCP Mode] Fatal error starting MCP server:', error);
      app.quit();
      process.exit(1);
    }
  });

} else {
  // ============================================
  // RECORDER MODE (Default)
  // ============================================
  // Full tray app with screenshot capture and processing
  
  // Dynamically import recorder modules only in recorder mode
  // This avoids loading heavy modules (OCR, interaction monitor) in MCP mode
  let recorder: typeof import('./recorder/recorder');
  let interactionMonitor: typeof import('./recorder/interaction-monitor');

  let tray: Tray | null = null;
  let processor: EventProcessor | null = null;
  let apiKeyManager: ApiKeyManager | null = null;

  const initRecorderMode = async () => {
    // Dynamic imports for recorder-specific modules
    recorder = await import('./recorder/recorder');
    interactionMonitor = await import('./recorder/interaction-monitor');

    // Initialize API key manager for secure key storage
    apiKeyManager = new ApiKeyManager();

    // Initialize Processor Services
    const embeddingService = new EmbeddingService();
    const storageService = new StorageService(StorageService.getDefaultDbPath());
    const classifierService = new SemanticClassifierService(apiKeyManager.getApiKey() || undefined);
    processor = new EventProcessor(embeddingService, storageService, classifierService);

    // Initialize settings IPC handlers (pass classifier so it can be updated when key changes)
    initSettingsIPC(apiKeyManager, classifierService);
  };

  const createTray = () => {
    // Try to load custom icon, fall back to default
    // In dev: __dirname is out/main, assets is at ../../assets
    // In production: assets are in resources/assets
    const isDev = !app.isPackaged;
    const iconPath = isDev
      ? path.join(__dirname, '../../assets/tray-icon.png')
      : path.join(process.resourcesPath, 'assets/tray-icon.png');
    let icon: Electron.NativeImage;

    try {
      icon = nativeImage.createFromPath(iconPath);
      if (icon.isEmpty()) {
        icon = nativeImage.createEmpty();
      }
    } catch {
      icon = nativeImage.createEmpty();
    }

    tray = new Tray(icon);
    tray.setToolTip('MemoryLane - Screen Capture');

    void updateTrayMenu();

    // Register a callback to process screenshots
    recorder.onScreenshot(async (screenshot: Screenshot) => {
      console.log(`[Main] Screenshot captured: ${screenshot.id}`);

      if (processor) {
        try {
          await processor.processScreenshot(screenshot);
          console.log(`[Main] Screenshot processed successfully: ${screenshot.id}`);
          // Refresh tray menu to show updated usage stats
          void updateTrayMenu();
        } catch (error) {
          console.error(`[Main] Error processing screenshot ${screenshot.id}:`, error);
        }
      }
    });

    // Subscribe to interaction events - pass them to the processor for aggregation
    interactionMonitor.onInteraction((event) => {
      if (processor) {
        processor.addInteractionEvent(event);
      }
    });
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatNumber = (num: number): string => {
    return num.toLocaleString();
  };

  const buildUsageStatsSubmenu = async (): Promise<Electron.MenuItemConstructorOptions[]> => {
    const submenu: Electron.MenuItemConstructorOptions[] = [];

    if (!processor) {
      submenu.push({
        label: 'Stats not available',
        enabled: false
      });
      return submenu;
    }

    const classifier = processor.getClassifierService();
    const storage = processor.getStorageService();

    if (classifier) {
      const usageTracker = classifier.getUsageTracker();
      const stats = usageTracker.getStats();

      submenu.push(
        {
          label: `API Requests: ${formatNumber(stats.requestCount)}`,
          enabled: false
        },
        {
          label: `Tokens: ${formatNumber(stats.promptTokens)} (prompt) / ${formatNumber(stats.completionTokens)} (completion)`,
          enabled: false
        },
        {
          label: `Est. Cost: $${stats.totalCost.toFixed(4)}`,
          enabled: false
        }
      );
    } else {
      submenu.push(
        {
          label: 'API tracking unavailable (no API key)',
          enabled: false
        }
      );
    }

    submenu.push({ type: 'separator' });

    try {
      const screenshotCount = await storage.countRows();
      const dbSize = storage.getDbSize();

      submenu.push(
        {
          label: `Screenshots: ${formatNumber(screenshotCount)}`,
          enabled: false
        },
        {
          label: `Database: ${formatBytes(dbSize)}`,
          enabled: false
        }
      );
    } catch (error) {
      console.error('Error fetching storage stats:', error);
      submenu.push({
        label: 'Storage stats unavailable',
        enabled: false
      });
    }

    return submenu;
  };

  const updateTrayMenu = async () => {
    if (!tray) return;

    const isCapturing = recorder.isCapturingNow();

    const usageStatsSubmenu = await buildUsageStatsSubmenu();

    const contextMenu = Menu.buildFromTemplate([
      {
        label: isCapturing ? 'Stop Capture' : 'Start Capture',
        click: () => {
          if (isCapturing) {
            recorder.stopCapture();
            interactionMonitor.stopInteractionMonitoring();
          } else {
            recorder.startCapture();
            try {
              interactionMonitor.startInteractionMonitoring();
            } catch (error) {
              console.error('Failed to start interaction monitoring:', error);
              console.log('Continuing without interaction monitoring');
            }
          }
          void updateTrayMenu();
        },
      },
      {
        label: 'Capture Now',
        click: async () => {
          try {
            const screenshot = await recorder.captureNow();
            console.log('Manual capture successful:', screenshot.id);
          } catch (error) {
            console.error('Manual capture failed:', error);
          }
        },
      },
      {
        label: 'Test Search: "MemoryLane"',
        click: async () => {
          if (!processor) {
            console.error('[Test Search] Processor not initialized');
            return;
          }

          try {
            console.log('[Test Search] Starting search for "MemoryLane"...');
            const results = await processor.search('MemoryLane');

            console.log('\n=== FTS Results ===');
            results.fts.forEach((event, idx) => {
              console.log(`${idx + 1}. [${event.id}] ${new Date(event.timestamp).toISOString()}`);
              console.log(`   Text: ${event.text.substring(0, 100)}${event.text.length > 100 ? '...' : ''}`);
            });

            console.log('\n=== Vector Results ===');
            results.vector.forEach((event, idx) => {
              console.log(`${idx + 1}. [${event.id}] ${new Date(event.timestamp).toISOString()}`);
              console.log(`   Text: ${event.text.substring(0, 100)}${event.text.length > 100 ? '...' : ''}`);
            });

            console.log('\n[Test Search] Complete\n');
          } catch (error) {
            console.error('[Test Search] Error:', error);
          }
        },
      },
      { type: 'separator' },
      {
        label: 'Usage Stats',
        submenu: usageStatsSubmenu
      },
      {
        label: 'Settings...',
        click: () => {
          openSettingsWindow();
        },
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          recorder.stopCapture();
          interactionMonitor.stopInteractionMonitoring();
          app.quit();
        },
      },
    ]);

    tray.setContextMenu(contextMenu);
  };

  // This method will be called when Electron has finished initialization
  app.on('ready', async () => {
    await initRecorderMode();
    createTray();
    console.log('MemoryLane started. Screenshots will be saved to:', recorder.getScreenshotsDir());
  });
}
