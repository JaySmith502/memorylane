use crate::models::{CaptureTarget, DisplayBounds};
use image::{ImageBuffer, Rgba};
use std::ffi::c_void;
use std::mem::size_of;
use windows::core::Result as WindowsResult;
use windows::Win32::Foundation::{HWND, POINT};
use windows::Win32::Graphics::Gdi::{
    BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC, GetDIBits,
    GetMonitorInfoW, MonitorFromPoint, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER,
    BI_RGB, CAPTUREBLT, DIB_RGB_COLORS, HGDIOBJ, MONITORINFO, MONITOR_DEFAULTTOPRIMARY, SRCCOPY,
};
use windows::Win32::UI::HiDpi::{
    SetProcessDpiAwarenessContext, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
};

pub(crate) fn initialize_dpi_awareness() -> WindowsResult<()> {
    unsafe { SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2) }
}

pub(crate) fn resolve_primary_target() -> Result<CaptureTarget, String> {
    unsafe {
        let monitor = MonitorFromPoint(POINT { x: 0, y: 0 }, MONITOR_DEFAULTTOPRIMARY);
        if monitor.is_invalid() {
            return Err("Could not resolve primary monitor".to_string());
        }

        let mut info = MONITORINFO::default();
        info.cbSize = size_of::<MONITORINFO>() as u32;
        if !GetMonitorInfoW(monitor, &mut info as *mut MONITORINFO as *mut _).as_bool() {
            return Err("GetMonitorInfoW failed for primary monitor".to_string());
        }

        let rect = info.rcMonitor;
        let width = rect.right.saturating_sub(rect.left);
        let height = rect.bottom.saturating_sub(rect.top);
        if width <= 0 || height <= 0 {
            return Err("Primary monitor reported invalid bounds".to_string());
        }

        Ok(CaptureTarget {
            display_id: 0,
            display_bounds: DisplayBounds {
                x: rect.left,
                y: rect.top,
                width,
                height,
            },
        })
    }
}

pub(crate) fn capture_bitmap(
    bounds: DisplayBounds,
) -> Result<ImageBuffer<Rgba<u8>, Vec<u8>>, String> {
    unsafe {
        let screen_dc = GetDC(Some(HWND::default()));
        if screen_dc.is_invalid() {
            return Err("GetDC failed".to_string());
        }

        let memory_dc = CreateCompatibleDC(Some(screen_dc));
        if memory_dc.is_invalid() {
            let _ = ReleaseDC(Some(HWND::default()), screen_dc);
            return Err("CreateCompatibleDC failed".to_string());
        }

        let bitmap = CreateCompatibleBitmap(screen_dc, bounds.width, bounds.height);
        if bitmap.is_invalid() {
            let _ = DeleteDC(memory_dc);
            let _ = ReleaseDC(Some(HWND::default()), screen_dc);
            return Err("CreateCompatibleBitmap failed".to_string());
        }

        let previous = SelectObject(memory_dc, HGDIOBJ(bitmap.0));
        let result = (|| {
            if BitBlt(
                memory_dc,
                0,
                0,
                bounds.width,
                bounds.height,
                Some(screen_dc),
                bounds.x,
                bounds.y,
                SRCCOPY | CAPTUREBLT,
            )
            .is_err()
            {
                return Err("BitBlt failed".to_string());
            }

            let mut bitmap_info = BITMAPINFO::default();
            bitmap_info.bmiHeader = BITMAPINFOHEADER {
                biSize: size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: bounds.width,
                biHeight: -bounds.height,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            };

            let pixel_len = bounds
                .width
                .checked_mul(bounds.height)
                .and_then(|pixels| pixels.checked_mul(4))
                .ok_or_else(|| "Bitmap dimensions overflowed buffer size".to_string())?;
            let mut pixels = vec![0_u8; pixel_len as usize];

            let scan_lines = GetDIBits(
                memory_dc,
                bitmap,
                0,
                bounds.height as u32,
                Some(pixels.as_mut_ptr() as *mut c_void),
                &mut bitmap_info,
                DIB_RGB_COLORS,
            );
            if scan_lines == 0 {
                return Err("GetDIBits failed".to_string());
            }

            for pixel in pixels.chunks_exact_mut(4) {
                pixel.swap(0, 2);
            }

            ImageBuffer::<Rgba<u8>, Vec<u8>>::from_raw(
                bounds.width as u32,
                bounds.height as u32,
                pixels,
            )
            .ok_or_else(|| "Could not construct RGBA image buffer".to_string())
        })();

        let _ = SelectObject(memory_dc, previous);
        let _ = DeleteObject(bitmap.into());
        let _ = DeleteDC(memory_dc);
        let _ = ReleaseDC(Some(HWND::default()), screen_dc);

        result
    }
}
