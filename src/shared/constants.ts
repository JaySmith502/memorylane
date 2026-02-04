export const CAPTURE_INTERVAL_MS = 30_000; // 30 seconds (legacy fallback)

// Visual Change Detection Configuration (Simplified)
export const VISUAL_DETECTOR_CONFIG = {
  ENABLED: true,
  SAMPLE_INTERVAL_MS: 2000,           // Check every 2s (reduced frequency, less noise)
  DHASH_THRESHOLD_PERCENT: 6,         // Single threshold: hamming distance above threshold => changed
  SAMPLE_WIDTH: 320,                  // Downscale for performance
  SAMPLE_HEIGHT: 180,
  FALLBACK_TIMER_MS: 300_000,         // 5 minutes max between captures
};

// Capture Coordinator Configuration (Global Debouncing)
export const CAPTURE_COORDINATOR_CONFIG = {
  GLOBAL_DEBOUNCE_MS: 5_000,                     // 5s minimum between captures (all triggers)
  INTERACTION_SENSITIVITY_WINDOW_MS: 5_000,      // 5s window after interaction for bypass
  INTERACTION_TRIGGERS_IMMEDIATE_CHECK: true,    // Trigger visual check on interaction
};

// User Interaction Monitoring Configuration
export const INTERACTION_MONITOR_CONFIG = {
  ENABLED: true,
  TRACK_CLICKS: true,
  TRACK_KEYBOARD: true,               // Track typing sessions
  TRACK_SCROLL: false,                // Covered by visual detector
  CAPTURE_DELAY_MS: 500,              // Wait 500ms after click (for UI update)
  TYPING_SESSION_TIMEOUT_MS: 2000,    // Consider typing stopped after 2s of no keys
};

// Context Capture Configuration
export const CONTEXT_CAPTURE_CONFIG = {
  ENABLED: false,                     // Disabled by default (requires permissions)
  CAPTURE_ACTIVE_WINDOW: true,
  CAPTURE_UI_ELEMENTS: true,         // Requires accessibility permissions
  CAPTURE_PRE_POST_SNAPSHOTS: false,  // Doubles storage
  REQUEST_PERMISSIONS_ON_START: true,
};
