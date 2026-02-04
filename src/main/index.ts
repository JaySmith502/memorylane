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
import { Screenshot } from '../shared/types';
import dotenv from 'dotenv';

dotenv.config();

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
      // Initialize only the services needed for search
      const embeddingService = new EmbeddingService();
      const storageService = new StorageService(StorageService.getDefaultDbPath());
      const classifierService = new SemanticClassifierService();
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

  const initRecorderMode = async () => {
    // Dynamic imports for recorder-specific modules
    recorder = await import('./recorder/recorder');
    interactionMonitor = await import('./recorder/interaction-monitor');
    
    // Initialize Processor Services
    const embeddingService = new EmbeddingService();
    const storageService = new StorageService(StorageService.getDefaultDbPath());
    const classifierService = new SemanticClassifierService();
    processor = new EventProcessor(embeddingService, storageService, classifierService);
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

    updateTrayMenu();

    // Register a callback to process screenshots
    recorder.onScreenshot(async (screenshot: Screenshot) => {
      console.log(`[Main] Screenshot captured: ${screenshot.id}`);

      if (processor) {
        try {
          await processor.processScreenshot(screenshot);
          console.log(`[Main] Screenshot processed successfully: ${screenshot.id}`);
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

  const updateTrayMenu = () => {
    if (!tray) return;

    const isCapturing = recorder.isCapturingNow();

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
          updateTrayMenu();
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
