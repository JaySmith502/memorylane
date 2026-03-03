use crate::models::{CaptureTarget, DaemonConfig, DisplayBounds, OutputFormat};
use std::path::PathBuf;

fn parse_positive_u64(value: &str, flag: &str) -> Result<u64, String> {
    let parsed = value
        .parse::<u64>()
        .map_err(|_| format!("Invalid value for {flag}: {value}"))?;
    if parsed == 0 {
        return Err(format!("{flag} must be greater than zero"));
    }
    Ok(parsed)
}

fn parse_i32(value: &str, flag: &str) -> Result<i32, String> {
    value
        .parse::<i32>()
        .map_err(|_| format!("Invalid value for {flag}: {value}"))
}

fn parse_i64(value: &str, flag: &str) -> Result<i64, String> {
    value
        .parse::<i64>()
        .map_err(|_| format!("Invalid value for {flag}: {value}"))
}

fn parse_output_format(value: &str) -> Result<OutputFormat, String> {
    match value {
        "jpeg" | "jpg" => Ok(OutputFormat::Jpeg),
        "png" => Ok(OutputFormat::Png),
        other => Err(format!("Unsupported image format: {other}")),
    }
}

pub(crate) fn parse_args() -> Result<DaemonConfig, String> {
    parse_args_from(std::env::args())
}

fn parse_args_from<I, S>(args: I) -> Result<DaemonConfig, String>
where
    I: IntoIterator<Item = S>,
    S: Into<String>,
{
    let args: Vec<String> = args.into_iter().map(Into::into).collect();

    let mut output_dir: Option<PathBuf> = None;
    let mut interval_ms = 1000_u64;
    let mut max_dimension: Option<u32> = None;
    let mut format = OutputFormat::Jpeg;
    let mut quality = 80_u8;
    let mut display_id: Option<i64> = None;
    let mut x: Option<i32> = None;
    let mut y: Option<i32> = None;
    let mut width: Option<i32> = None;
    let mut height: Option<i32> = None;

    let mut i = 1_usize;
    while i < args.len() {
        let flag = args[i].as_str();
        i += 1;
        if i >= args.len() {
            return Err(format!("Missing value for {flag}"));
        }

        match flag {
            "--outputDir" => output_dir = Some(PathBuf::from(&args[i])),
            "--intervalMs" => interval_ms = parse_positive_u64(&args[i], flag)?,
            "--maxDimension" => {
                let parsed = parse_positive_u64(&args[i], flag)?;
                max_dimension = Some(u32::try_from(parsed).map_err(|_| {
                    format!("{flag} is too large to fit into a 32-bit dimension: {parsed}")
                })?);
            }
            "--format" => format = parse_output_format(&args[i])?,
            "--quality" => {
                let parsed = parse_positive_u64(&args[i], flag)?;
                if parsed > 100 {
                    return Err("--quality must be between 1 and 100".to_string());
                }
                quality = parsed as u8;
            }
            "--displayId" => display_id = Some(parse_i64(&args[i], flag)?),
            "--x" => x = Some(parse_i32(&args[i], flag)?),
            "--y" => y = Some(parse_i32(&args[i], flag)?),
            "--width" => width = Some(parse_i32(&args[i], flag)?),
            "--height" => height = Some(parse_i32(&args[i], flag)?),
            other => return Err(format!("Unknown argument: {other}")),
        }
        i += 1;
    }

    let output_dir = output_dir.ok_or_else(|| "--outputDir is required".to_string())?;

    let initial_target = match (display_id, x, y, width, height) {
        (Some(display_id), Some(x), Some(y), Some(width), Some(height)) => {
            if width <= 0 || height <= 0 {
                return Err("Initial display bounds must be positive".to_string());
            }
            Some(CaptureTarget {
                display_id,
                display_bounds: DisplayBounds {
                    x,
                    y,
                    width,
                    height,
                },
            })
        }
        (None, None, None, None, None) => None,
        _ => {
            return Err(
                "Initial display target requires --displayId, --x, --y, --width, and --height"
                    .to_string(),
            );
        }
    };

    Ok(DaemonConfig {
        output_dir,
        interval_ms,
        max_dimension,
        format,
        quality,
        initial_target,
    })
}

#[cfg(test)]
mod tests {
    use super::parse_args_from;
    use crate::models::{CaptureTarget, DisplayBounds, OutputFormat};
    use std::path::PathBuf;

    #[test]
    fn parses_minimal_arguments_with_defaults() {
        let config = parse_args_from(["app", "--outputDir", "captures"]).unwrap();

        assert_eq!(config.output_dir, PathBuf::from("captures"));
        assert_eq!(config.interval_ms, 1000);
        assert_eq!(config.max_dimension, None);
        assert_eq!(config.format, OutputFormat::Jpeg);
        assert_eq!(config.quality, 80);
        assert_eq!(config.initial_target, None);
    }

    #[test]
    fn parses_initial_target_when_all_bounds_are_present() {
        let config = parse_args_from([
            "app",
            "--outputDir",
            "captures",
            "--displayId",
            "5",
            "--x",
            "10",
            "--y",
            "20",
            "--width",
            "1280",
            "--height",
            "720",
        ])
        .unwrap();

        assert_eq!(
            config.initial_target,
            Some(CaptureTarget {
                display_id: 5,
                display_bounds: DisplayBounds {
                    x: 10,
                    y: 20,
                    width: 1280,
                    height: 720,
                },
            })
        );
    }

    #[test]
    fn rejects_partial_initial_target() {
        let error = parse_args_from([
            "app",
            "--outputDir",
            "captures",
            "--displayId",
            "5",
            "--x",
            "10",
        ])
        .unwrap_err();

        assert_eq!(
            error,
            "Initial display target requires --displayId, --x, --y, --width, and --height"
        );
    }
}
