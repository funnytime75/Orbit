use crate::error::OrbitError;
use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use std::path::Path;

const APP_ICON_SIZE_PX: i32 = 48;
const PNG_MIME_PREFIX: &str = "data:image/png;base64,";

pub fn load_app_icon_data_url(program: &str) -> Result<Option<String>, OrbitError> {
    let path = program.trim();
    if path.is_empty() {
        return Err(OrbitError::AppIcon("应用路径不能为空".to_string()));
    }

    if !is_windows_exe_path(path) {
        return Err(OrbitError::AppIcon(
            "首版只支持 Windows .exe 应用图标".to_string(),
        ));
    }

    extract_app_icon_data_url(path)
}

fn is_windows_exe_path(path: &str) -> bool {
    Path::new(path)
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("exe"))
}

#[cfg(target_os = "windows")]
fn extract_app_icon_data_url(path: &str) -> Result<Option<String>, OrbitError> {
    use core::ffi::c_void;
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Foundation::HANDLE;
    use windows_sys::Win32::Graphics::Gdi::{
        CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, SelectObject, BITMAPINFO,
        BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HBITMAP, HDC, HGDIOBJ,
    };
    use windows_sys::Win32::UI::Shell::ExtractIconExW;
    use windows_sys::Win32::UI::WindowsAndMessaging::{DestroyIcon, DrawIconEx, DI_NORMAL, HICON};

    struct IconHandle(HICON);

    impl Drop for IconHandle {
        fn drop(&mut self) {
            if !self.0.is_null() {
                unsafe {
                    DestroyIcon(self.0);
                }
            }
        }
    }

    struct DeviceContext(HDC);

    impl Drop for DeviceContext {
        fn drop(&mut self) {
            if !self.0.is_null() {
                unsafe {
                    DeleteDC(self.0);
                }
            }
        }
    }

    struct BitmapHandle(HBITMAP);

    impl Drop for BitmapHandle {
        fn drop(&mut self) {
            if !self.0.is_null() {
                unsafe {
                    DeleteObject(self.0 as HGDIOBJ);
                }
            }
        }
    }

    let path_wide: Vec<u16> = std::ffi::OsStr::new(path)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let mut large_icon: HICON = std::ptr::null_mut();
    let mut small_icon: HICON = std::ptr::null_mut();

    let icon_count =
        unsafe { ExtractIconExW(path_wide.as_ptr(), 0, &mut large_icon, &mut small_icon, 1) };

    if icon_count == 0 {
        return Ok(None);
    }

    let selected_icon = if !large_icon.is_null() {
        IconHandle(large_icon)
    } else if !small_icon.is_null() {
        IconHandle(small_icon)
    } else {
        return Ok(None);
    };
    let _unused_small_icon = if !small_icon.is_null() && small_icon != selected_icon.0 {
        Some(IconHandle(small_icon))
    } else {
        None
    };

    let dc = unsafe { CreateCompatibleDC(std::ptr::null_mut()) };
    if dc.is_null() {
        return Err(OrbitError::AppIcon(format!(
            "创建图标绘制上下文失败：{}",
            std::io::Error::last_os_error()
        )));
    }
    let dc = DeviceContext(dc);

    let mut bitmap_info = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: APP_ICON_SIZE_PX,
            biHeight: -APP_ICON_SIZE_PX,
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB,
            biSizeImage: (APP_ICON_SIZE_PX * APP_ICON_SIZE_PX * 4) as u32,
            biXPelsPerMeter: 0,
            biYPelsPerMeter: 0,
            biClrUsed: 0,
            biClrImportant: 0,
        },
        bmiColors: Default::default(),
    };
    let mut bits: *mut c_void = std::ptr::null_mut();
    let bitmap = unsafe {
        CreateDIBSection(
            dc.0,
            &mut bitmap_info,
            DIB_RGB_COLORS,
            &mut bits,
            std::ptr::null_mut::<c_void>() as HANDLE,
            0,
        )
    };
    if bitmap.is_null() || bits.is_null() {
        return Err(OrbitError::AppIcon(format!(
            "创建图标位图失败：{}",
            std::io::Error::last_os_error()
        )));
    }
    let bitmap = BitmapHandle(bitmap);

    let old_object = unsafe { SelectObject(dc.0, bitmap.0 as HGDIOBJ) };
    let drawn = unsafe {
        DrawIconEx(
            dc.0,
            0,
            0,
            selected_icon.0,
            APP_ICON_SIZE_PX,
            APP_ICON_SIZE_PX,
            0,
            std::ptr::null_mut(),
            DI_NORMAL,
        )
    };
    if !old_object.is_null() {
        unsafe {
            SelectObject(dc.0, old_object);
        }
    }
    if drawn == 0 {
        return Err(OrbitError::AppIcon(format!(
            "绘制应用图标失败：{}",
            std::io::Error::last_os_error()
        )));
    }

    let pixel_count = (APP_ICON_SIZE_PX * APP_ICON_SIZE_PX) as usize;
    let bgra = unsafe { std::slice::from_raw_parts(bits.cast::<u8>(), pixel_count * 4) };
    let rgba = bgra_to_rgba(bgra);
    let png_bytes = encode_png_rgba(APP_ICON_SIZE_PX as u32, APP_ICON_SIZE_PX as u32, &rgba)?;
    let encoded = BASE64_STANDARD.encode(png_bytes);

    Ok(Some(format!("{PNG_MIME_PREFIX}{encoded}")))
}

#[cfg(not(target_os = "windows"))]
fn extract_app_icon_data_url(_path: &str) -> Result<Option<String>, OrbitError> {
    Ok(None)
}

fn bgra_to_rgba(bgra: &[u8]) -> Vec<u8> {
    let mut rgba = Vec::with_capacity(bgra.len());
    let has_alpha = bgra.chunks_exact(4).any(|pixel| pixel[3] > 0);

    for pixel in bgra.chunks_exact(4) {
        rgba.push(pixel[2]);
        rgba.push(pixel[1]);
        rgba.push(pixel[0]);
        rgba.push(if has_alpha {
            pixel[3]
        } else if pixel[0] == 0 && pixel[1] == 0 && pixel[2] == 0 {
            0
        } else {
            255
        });
    }

    rgba
}

fn encode_png_rgba(width: u32, height: u32, rgba: &[u8]) -> Result<Vec<u8>, OrbitError> {
    let mut bytes = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut bytes, width, height);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder
            .write_header()
            .map_err(|error| OrbitError::AppIcon(format!("写入图标 PNG 头失败：{error}")))?;
        writer
            .write_image_data(rgba)
            .map_err(|error| OrbitError::AppIcon(format!("写入图标 PNG 数据失败：{error}")))?;
    }

    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::{bgra_to_rgba, is_windows_exe_path};

    #[test]
    fn accepts_exe_path_shape() {
        assert!(is_windows_exe_path("C:\\Program Files\\Orbit\\Orbit.EXE"));
        assert!(!is_windows_exe_path("C:\\Program Files\\Orbit\\Orbit.bat"));
    }

    #[test]
    fn converts_bgra_to_rgba() {
        let rgba = bgra_to_rgba(&[10, 20, 30, 255]);

        assert_eq!(rgba, vec![30, 20, 10, 255]);
    }
}
