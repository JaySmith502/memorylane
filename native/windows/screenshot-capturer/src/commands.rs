use crate::capture::resolve_primary_target;
use crate::models::{CaptureTarget, DisplayBounds, SharedState};
use serde_json::Value;
use std::sync::{Arc, Mutex};

fn parse_command_display_bounds(value: &Value) -> Result<DisplayBounds, String> {
    let x = value
        .get("x")
        .and_then(Value::as_i64)
        .ok_or_else(|| "displayBounds.x is required".to_string())?;
    let y = value
        .get("y")
        .and_then(Value::as_i64)
        .ok_or_else(|| "displayBounds.y is required".to_string())?;
    let width = value
        .get("width")
        .and_then(Value::as_i64)
        .ok_or_else(|| "displayBounds.width is required".to_string())?;
    let height = value
        .get("height")
        .and_then(Value::as_i64)
        .ok_or_else(|| "displayBounds.height is required".to_string())?;

    let x = i32::try_from(x).map_err(|_| "displayBounds.x is out of range".to_string())?;
    let y = i32::try_from(y).map_err(|_| "displayBounds.y is out of range".to_string())?;
    let width =
        i32::try_from(width).map_err(|_| "displayBounds.width is out of range".to_string())?;
    let height =
        i32::try_from(height).map_err(|_| "displayBounds.height is out of range".to_string())?;

    if width <= 0 || height <= 0 {
        return Err("displayBounds must have positive width and height".to_string());
    }

    Ok(DisplayBounds {
        x,
        y,
        width,
        height,
    })
}

pub(crate) fn apply_command(
    line: &str,
    shared_state: &Arc<Mutex<SharedState>>,
) -> Result<(), String> {
    let value: Value = serde_json::from_str(line)
        .map_err(|error| format!("Invalid JSON command: {line} ({error})"))?;

    let mut state = shared_state
        .lock()
        .map_err(|_| "Shared state mutex was poisoned".to_string())?;

    if let Some(interval_ms) = value.get("intervalMs").and_then(Value::as_u64) {
        if interval_ms == 0 {
            return Err("intervalMs must be greater than zero".to_string());
        }
        state.interval_ms = interval_ms;
    }

    let Some(display_id_value) = value.get("displayId") else {
        return Ok(());
    };

    if display_id_value.is_null() {
        state.target = resolve_primary_target()?;
        return Ok(());
    }

    let display_id = display_id_value
        .as_i64()
        .ok_or_else(|| "displayId must be an integer or null".to_string())?;

    let Some(display_bounds_value) = value.get("displayBounds") else {
        if state.target.display_id == display_id {
            return Ok(());
        }
        return Err(format!(
            "displayBounds is required when switching to displayId {display_id}"
        ));
    };

    if display_bounds_value.is_null() {
        if state.target.display_id == display_id {
            return Ok(());
        }
        return Err(format!(
            "displayBounds cannot be null when switching to displayId {display_id}"
        ));
    }

    state.target = CaptureTarget {
        display_id,
        display_bounds: parse_command_display_bounds(display_bounds_value)?,
    };

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::apply_command;
    use crate::models::{CaptureTarget, DisplayBounds, SharedState};
    use std::sync::{Arc, Mutex};

    fn shared_state() -> Arc<Mutex<SharedState>> {
        Arc::new(Mutex::new(SharedState {
            interval_ms: 1000,
            target: CaptureTarget {
                display_id: 1,
                display_bounds: DisplayBounds {
                    x: 0,
                    y: 0,
                    width: 1920,
                    height: 1080,
                },
            },
        }))
    }

    #[test]
    fn updates_interval_without_changing_target() {
        let shared_state = shared_state();

        apply_command(r#"{"intervalMs":250}"#, &shared_state).unwrap();

        let state = shared_state.lock().unwrap().clone();
        assert_eq!(state.interval_ms, 250);
        assert_eq!(state.target.display_id, 1);
    }

    #[test]
    fn switches_target_when_display_bounds_are_provided() {
        let shared_state = shared_state();

        apply_command(
            r#"{"displayId":2,"displayBounds":{"x":100,"y":200,"width":1280,"height":720}}"#,
            &shared_state,
        )
        .unwrap();

        let state = shared_state.lock().unwrap().clone();
        assert_eq!(state.target.display_id, 2);
        assert_eq!(
            state.target.display_bounds,
            DisplayBounds {
                x: 100,
                y: 200,
                width: 1280,
                height: 720,
            }
        );
    }

    #[test]
    fn rejects_switching_target_without_bounds() {
        let shared_state = shared_state();

        let error = apply_command(r#"{"displayId":2}"#, &shared_state).unwrap_err();

        assert_eq!(
            error,
            "displayBounds is required when switching to displayId 2"
        );
    }
}
