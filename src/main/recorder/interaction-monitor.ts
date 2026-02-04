import { uIOhook, UiohookMouseEvent } from 'uiohook-napi';
import { INTERACTION_MONITOR_CONFIG } from '../../shared/constants';
import { InteractionContext } from '../../shared/types';

// State
let isRunning = false;
let clickDebounceTimeoutId: NodeJS.Timeout | null = null;
let typingSessionTimeoutId: NodeJS.Timeout | null = null;
let isTyping = false;
let typingSessionKeyCount = 0;
let typingSessionStartTime = 0;

// Callback for when interaction triggers a capture
type OnInteractionCallback = (context: InteractionContext) => void;
const interactionCallbacks: OnInteractionCallback[] = [];

/**
 * Handle mouse click events
 */
function handleMouseClick(event: UiohookMouseEvent): void {
  if (!INTERACTION_MONITOR_CONFIG.TRACK_CLICKS) {
    return;
  }

  console.log('[Interaction Monitor] Mouse click detected:', { x: event.x, y: event.y, button: event.button });

  // Clear any existing click debounce timeout
  if (clickDebounceTimeoutId) {
    clearTimeout(clickDebounceTimeoutId);
  }

  // Schedule notification after delay (to let UI update)
  clickDebounceTimeoutId = setTimeout(() => {
    const context: InteractionContext = {
      type: 'click',
      timestamp: Date.now() - INTERACTION_MONITOR_CONFIG.CAPTURE_DELAY_MS,
      clickPosition: {
        x: event.x,
        y: event.y,
      },
    };

    // Notify all callbacks
    interactionCallbacks.forEach((callback) => {
      try {
        callback(context);
      } catch (error) {
        console.error('Error in interaction callback:', error);
      }
    });
  }, INTERACTION_MONITOR_CONFIG.CAPTURE_DELAY_MS);
}

/**
 * Handle keyboard events (if enabled)
 * Tracks "typing sessions" - emits event when user pauses typing
 */
function handleKeyboard(): void {
  if (!INTERACTION_MONITOR_CONFIG.TRACK_KEYBOARD) {
    return;
  }

  const now = Date.now();

  // Clear any existing typing session timeout
  if (typingSessionTimeoutId) {
    clearTimeout(typingSessionTimeoutId);
  }

  // Mark that user is typing and track session
  if (!isTyping) {
    isTyping = true;
    typingSessionKeyCount = 0;
    typingSessionStartTime = now;
    console.log('[Interaction Monitor] Typing session started');
  }

  // Increment key count
  typingSessionKeyCount++;

  // Set timeout to detect when typing stops
  typingSessionTimeoutId = setTimeout(() => {
    if (!isTyping) return;

    isTyping = false;
    const endTime = Date.now();
    const durationMs = endTime - typingSessionStartTime - INTERACTION_MONITOR_CONFIG.CAPTURE_DELAY_MS;

    console.log(`[Interaction Monitor] Typing session ended: ${typingSessionKeyCount} keys over ${durationMs}ms`);

    const context: InteractionContext = {
      type: 'keyboard',
      timestamp: endTime,
      keyCount: typingSessionKeyCount,
      durationMs: durationMs,
    };

    // Notify all callbacks
    interactionCallbacks.forEach((callback) => {
      try {
        callback(context);
      } catch (error) {
        console.error('Error in interaction callback:', error);
      }
    });

    // Reset session tracking
    typingSessionKeyCount = 0;
    typingSessionStartTime = 0;
  }, INTERACTION_MONITOR_CONFIG.TYPING_SESSION_TIMEOUT_MS);
}

/**
 * Start monitoring user interactions
 */
export function startInteractionMonitoring(): void {
  if (isRunning) {
    console.log('[Interaction Monitor] Already running');
    return;
  }

  if (!INTERACTION_MONITOR_CONFIG.ENABLED) {
    console.log('[Interaction Monitor] Disabled in config');
    return;
  }

  try {
    console.log('[Interaction Monitor] Starting');
    isRunning = true;

    // Register event handlers
    if (INTERACTION_MONITOR_CONFIG.TRACK_CLICKS) {
      uIOhook.on('click', handleMouseClick);
    }

    if (INTERACTION_MONITOR_CONFIG.TRACK_KEYBOARD) {
      uIOhook.on('keydown', handleKeyboard);
    }

    // Start the hook
    uIOhook.start();
    console.log('[Interaction Monitor] uiohook started successfully');
  } catch (error) {
    console.error('[Interaction Monitor] Failed to start:', error);
    isRunning = false;
    throw error;
  }
}

/**
 * Stop monitoring user interactions
 */
export function stopInteractionMonitoring(): void {
  if (!isRunning) {
    console.log('[Interaction Monitor] Not running');
    return;
  }

  try {
    console.log('[Interaction Monitor] Stopping');
    isRunning = false;
    isTyping = false;
    typingSessionKeyCount = 0;
    typingSessionStartTime = 0;

    // Clear any pending click debounce
    if (clickDebounceTimeoutId) {
      clearTimeout(clickDebounceTimeoutId);
      clickDebounceTimeoutId = null;
    }

    // Clear any pending typing session timeout
    if (typingSessionTimeoutId) {
      clearTimeout(typingSessionTimeoutId);
      typingSessionTimeoutId = null;
    }

    // Stop the hook
    uIOhook.stop();

    // Remove event listeners
    uIOhook.removeAllListeners();
  } catch (error) {
    console.error('[Interaction Monitor] Failed to stop:', error);
  }
}

/**
 * Register a callback to be notified when interactions trigger captures
 */
export function onInteraction(callback: OnInteractionCallback): void {
  interactionCallbacks.push(callback);
}

/**
 * Check if interaction monitoring is currently running
 */
export function isMonitoring(): boolean {
  return isRunning;
}
