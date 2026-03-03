use crate::capture::capture_bitmap;
use crate::image_output::{output_extension, resize_if_needed, write_image};
use crate::models::{DaemonConfig, FrameEvent, SharedState};
use crate::util::{emit_json_line, log_error, now_ms};
use image::{DynamicImage, GenericImageView};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

fn capture_once(
    config: &DaemonConfig,
    shared_state: &Arc<Mutex<SharedState>>,
    sequence: &AtomicU64,
) -> Result<(), String> {
    let state = shared_state
        .lock()
        .map_err(|_| "Shared state mutex was poisoned".to_string())?
        .clone();

    let image = capture_bitmap(state.target.display_bounds)?;
    let resized = resize_if_needed(DynamicImage::ImageRgba8(image), config.max_dimension);
    let timestamp = now_ms();
    let sequence_number = sequence.fetch_add(1, Ordering::Relaxed);
    let output_path = config.output_dir.join(format!(
        "frame-{timestamp}-{sequence_number}.{}",
        output_extension(config.format)
    ));

    write_image(&resized, &output_path, config.format, config.quality)?;

    let (width, height) = resized.dimensions();
    emit_json_line(&FrameEvent {
        filepath: output_path.to_string_lossy().to_string(),
        timestamp,
        width,
        height,
        display_id: state.target.display_id,
    });

    Ok(())
}

fn sleep_for_interval(interval_ms: u64, running: &AtomicBool) {
    let interval = Duration::from_millis(interval_ms.max(1));
    let deadline = Instant::now() + interval;

    while running.load(Ordering::Relaxed) {
        let now = Instant::now();
        if now >= deadline {
            break;
        }

        let remaining = deadline.saturating_duration_since(now);
        let step = remaining.min(Duration::from_millis(50));
        thread::sleep(step);
    }
}

pub(crate) fn run_capture_loop(
    config: DaemonConfig,
    shared_state: Arc<Mutex<SharedState>>,
    running: Arc<AtomicBool>,
) -> thread::JoinHandle<()> {
    thread::spawn(move || {
        let sequence = AtomicU64::new(0);

        while running.load(Ordering::Relaxed) {
            if let Err(error) = capture_once(&config, &shared_state, &sequence) {
                log_error(&error);
            }

            let interval_ms = match shared_state.lock() {
                Ok(state) => state.interval_ms,
                Err(_) => {
                    log_error("Shared state mutex was poisoned");
                    break;
                }
            };
            sleep_for_interval(interval_ms, &running);
        }
    })
}
