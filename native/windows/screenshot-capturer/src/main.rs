mod capture;
mod commands;
mod config;
mod daemon;
mod image_output;
mod models;
mod util;

use crate::capture::{initialize_dpi_awareness, resolve_primary_target};
use crate::commands::apply_command;
use crate::config::parse_args;
use crate::daemon::run_capture_loop;
use crate::models::SharedState;
use crate::util::log_error;
use std::fs;
use std::io::{self, BufRead};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

fn main() {
    if let Err(error) = initialize_dpi_awareness() {
        log_error(&format!("Could not set DPI awareness: {error}"));
    }

    let config = match parse_args() {
        Ok(config) => config,
        Err(error) => {
            log_error(&error);
            std::process::exit(1);
        }
    };

    if let Err(error) = fs::create_dir_all(&config.output_dir) {
        log_error(&format!(
            "Could not create output directory {}: {error}",
            config.output_dir.display()
        ));
        std::process::exit(1);
    }

    let initial_target = match config.initial_target.clone() {
        Some(target) => target,
        None => match resolve_primary_target() {
            Ok(target) => target,
            Err(error) => {
                log_error(&error);
                std::process::exit(1);
            }
        },
    };

    let shared_state = Arc::new(Mutex::new(SharedState {
        interval_ms: config.interval_ms,
        target: initial_target,
    }));
    let running = Arc::new(AtomicBool::new(true));
    let capture_thread = run_capture_loop(config, Arc::clone(&shared_state), Arc::clone(&running));

    let stdin = io::stdin();
    for line in stdin.lock().lines() {
        match line {
            Ok(line) => {
                if let Err(error) = apply_command(&line, &shared_state) {
                    log_error(&error);
                }
            }
            Err(error) => {
                log_error(&format!("Failed to read stdin: {error}"));
                break;
            }
        }
    }

    running.store(false, Ordering::Relaxed);
    let _ = capture_thread.join();
}
