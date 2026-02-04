import { desktopCapturer } from 'electron';
import { VISUAL_DETECTOR_CONFIG } from '../../shared/constants';

// State
let previousHash: string | null = null;
let detectorIntervalId: NodeJS.Timeout | null = null;
let isRunning = false;

// Callback for when significant change is detected
type OnChangeDetectedCallback = () => void;
const changeCallbacks: OnChangeDetectedCallback[] = [];

/**
 * Calculate difference hash (dHash) for perceptual comparison
 * Fast and resilient to minor changes like cursor movement
 */
function calculateDHash(buffer: Buffer, width: number, height: number): string {
  const grayscale: number[] = [];

  // Convert to grayscale
  for (let i = 0; i < buffer.length; i += 4) {
    const r = buffer[i];
    const g = buffer[i + 1];
    const b = buffer[i + 2];
    const gray = Math.floor(0.299 * r + 0.587 * g + 0.114 * b);
    grayscale.push(gray);
  }

  // Build hash by comparing adjacent pixels
  let hash = '';
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width - 1; x++) {
      const idx = y * width + x;
      hash += grayscale[idx] < grayscale[idx + 1] ? '1' : '0';
    }
  }

  return hash;
}

/**
 * Calculate Hamming distance between two hashes
 * Returns percentage difference (0-100)
 */
function hammingDistance(hash1: string | null, hash2: string | null): number {
  if (hash1 == null || hash2 == null || hash1.length !== hash2.length) return 100;

  let distance = 0;
  for (let i = 0; i < hash1.length; i++) {
    if (hash1[i] !== hash2[i]) distance++;
  }

  return (distance / hash1.length) * 100;
}

/**
 * Capture a lightweight sample of the screen for comparison
 */
async function captureSample(): Promise<Buffer> {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: VISUAL_DETECTOR_CONFIG.SAMPLE_WIDTH,
      height: VISUAL_DETECTOR_CONFIG.SAMPLE_HEIGHT,
    },
  });

  if (sources.length === 0) {
    throw new Error('No screen sources available for sampling');
  }

  const primarySource = sources[0];
  const thumbnail = primarySource.thumbnail;

  // Get raw bitmap data for comparison
  return thumbnail.toBitmap();
}

/**
 * Check for visual changes and trigger callbacks if threshold exceeded
 * Simplified: just calculate hamming distance and notify if >= threshold
 */
async function checkForChanges(): Promise<void> {
  try {
    const currentImageData = await captureSample();
    const currentHash = calculateDHash(
      currentImageData,
      VISUAL_DETECTOR_CONFIG.SAMPLE_WIDTH,
      VISUAL_DETECTOR_CONFIG.SAMPLE_HEIGHT
    );

    const difference = hammingDistance(previousHash, currentHash);

    console.log(`[Visual Detector] Hamming distance: ${difference.toFixed(1)}%`);

    // Single threshold check - binary decision
    if (difference >= VISUAL_DETECTOR_CONFIG.DHASH_THRESHOLD_PERCENT) {
      console.log(`[Visual Detector] Significant change detected (>=${VISUAL_DETECTOR_CONFIG.DHASH_THRESHOLD_PERCENT}%) - notifying callbacks`);

      // Notify all callbacks
      changeCallbacks.forEach((callback) => {
        try {
          callback();
        } catch (error) {
          console.error('Error in change detection callback:', error);
        }
      });
    }

    // Store current hash for next comparison
    previousHash = currentHash;
  } catch (error) {
    console.error('Error checking for visual changes:', error);
  }
}

/**
 * Manually trigger an immediate visual check
 * Used by coordinator when interaction occurs
 */
export function triggerImmediateCheck(): void {
  if (!isRunning) {
    console.log('[Visual Detector] Cannot trigger check - not running');
    return;
  }

  console.log('[Visual Detector] Immediate check triggered');
  checkForChanges();
}

/**
 * Start monitoring for visual changes
 */
export function startVisualDetection(): void {
  if (isRunning) {
    console.log('[Visual Detector] Already running');
    return;
  }

  if (!VISUAL_DETECTOR_CONFIG.ENABLED) {
    console.log('[Visual Detector] Disabled in config');
    return;
  }

  console.log(`[Visual Detector] Starting (${VISUAL_DETECTOR_CONFIG.SAMPLE_INTERVAL_MS}ms interval, ${VISUAL_DETECTOR_CONFIG.DHASH_THRESHOLD_PERCENT}% threshold)`);
  isRunning = true;
  previousHash = null;

  // Start periodic checking
  detectorIntervalId = setInterval(() => {
    checkForChanges();
  }, VISUAL_DETECTOR_CONFIG.SAMPLE_INTERVAL_MS);

  // Do initial check
  checkForChanges();
}

/**
 * Stop monitoring for visual changes
 */
export function stopVisualDetection(): void {
  if (!isRunning) {
    console.log('[Visual Detector] Not running');
    return;
  }

  console.log('[Visual Detector] Stopping');
  isRunning = false;

  if (detectorIntervalId) {
    clearInterval(detectorIntervalId);
    detectorIntervalId = null;
  }

  previousHash = null;
}

/**
 * Register a callback to be notified when significant changes are detected
 */
export function onChangeDetected(callback: OnChangeDetectedCallback): void {
  changeCallbacks.push(callback);
}

/**
 * Check if visual detection is currently running
 */
export function isDetecting(): boolean {
  return isRunning;
}
