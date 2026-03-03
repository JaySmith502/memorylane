use crate::models::OutputFormat;
use image::codecs::jpeg::JpegEncoder;
use image::{imageops::FilterType, DynamicImage};
use std::fs::File;
use std::io::{BufWriter, Write};
use std::path::Path;

pub(crate) fn resize_if_needed(image: DynamicImage, max_dimension: Option<u32>) -> DynamicImage {
    let Some(max_dimension) = max_dimension else {
        return image;
    };

    if max_dimension == 0 {
        return image;
    }

    let width = image.width();
    let height = image.height();
    let longest_edge = width.max(height);
    if longest_edge <= max_dimension {
        return image;
    }

    let scale = max_dimension as f64 / longest_edge as f64;
    let target_width = ((width as f64 * scale).round() as u32).max(1);
    let target_height = ((height as f64 * scale).round() as u32).max(1);
    image.resize_exact(target_width, target_height, FilterType::Triangle)
}

pub(crate) fn output_extension(format: OutputFormat) -> &'static str {
    match format {
        OutputFormat::Jpeg => "jpg",
        OutputFormat::Png => "png",
    }
}

pub(crate) fn write_image(
    image: &DynamicImage,
    output_path: &Path,
    format: OutputFormat,
    quality: u8,
) -> Result<(), String> {
    let file = File::create(output_path).map_err(|error| {
        format!(
            "Could not create output file {}: {error}",
            output_path.display()
        )
    })?;
    let mut writer = BufWriter::new(file);

    match format {
        OutputFormat::Jpeg => {
            let mut encoder = JpegEncoder::new_with_quality(&mut writer, quality);
            encoder
                .encode_image(image)
                .map_err(|error| format!("JPEG encode failed: {error}"))?;
        }
        OutputFormat::Png => {
            image
                .write_to(&mut writer, image::ImageFormat::Png)
                .map_err(|error| format!("PNG encode failed: {error}"))?;
        }
    }

    writer
        .flush()
        .map_err(|error| format!("Failed to flush output image: {error}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{output_extension, resize_if_needed};
    use crate::models::OutputFormat;
    use image::{DynamicImage, ImageBuffer, Rgba};

    #[test]
    fn resize_if_needed_preserves_smaller_images() {
        let image = DynamicImage::ImageRgba8(ImageBuffer::<Rgba<u8>, Vec<u8>>::new(640, 480));

        let resized = resize_if_needed(image, Some(1280));

        assert_eq!(resized.width(), 640);
        assert_eq!(resized.height(), 480);
    }

    #[test]
    fn resize_if_needed_scales_larger_images() {
        let image = DynamicImage::ImageRgba8(ImageBuffer::<Rgba<u8>, Vec<u8>>::new(3840, 2160));

        let resized = resize_if_needed(image, Some(1920));

        assert_eq!(resized.width(), 1920);
        assert_eq!(resized.height(), 1080);
    }

    #[test]
    fn output_extension_matches_existing_file_names() {
        assert_eq!(output_extension(OutputFormat::Jpeg), "jpg");
        assert_eq!(output_extension(OutputFormat::Png), "png");
    }
}
