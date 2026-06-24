use crate::error::OrbitError;
use crate::make_wheel_window_transparent;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use windows_sys::Win32::Foundation::POINT;
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, VIRTUAL_KEY, VK_0, VK_1, VK_2, VK_3, VK_4, VK_5, VK_6, VK_7, VK_8, VK_9,
    VK_BACK, VK_CONTROL, VK_DELETE, VK_DOWN, VK_END, VK_ESCAPE, VK_F1, VK_F10, VK_F11, VK_F12,
    VK_F13, VK_F14, VK_F15, VK_F16, VK_F17, VK_F18, VK_F19, VK_F2, VK_F20, VK_F21, VK_F22, VK_F23,
    VK_F24, VK_F3, VK_F4, VK_F5, VK_F6, VK_F7, VK_F8, VK_F9, VK_HOME, VK_INSERT, VK_LEFT, VK_LWIN,
    VK_MENU, VK_NEXT, VK_OEM_1, VK_OEM_2, VK_OEM_3, VK_OEM_4, VK_OEM_5, VK_OEM_6, VK_OEM_7,
    VK_OEM_COMMA, VK_OEM_MINUS, VK_OEM_PERIOD, VK_OEM_PLUS, VK_PRIOR, VK_RETURN, VK_RIGHT, VK_RWIN,
    VK_SHIFT, VK_SPACE, VK_TAB, VK_UP,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    GetCursorPos, GetSystemMetrics, SM_CXSCREEN, SM_CYSCREEN,
};

static SHORTCUT_WATCH_TOKEN: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Copy, Debug)]
enum WatchKey {
    Single(VIRTUAL_KEY),
    Either(VIRTUAL_KEY, VIRTUAL_KEY),
}

pub fn sync_trigger_shortcut(app: &AppHandle, shortcut: &str) -> Result<(), OrbitError> {
    let shortcut_keys = parse_shortcut_keys(shortcut)?;
    let shortcut = Shortcut::new(
        Some(shortcut_keys.modifiers),
        shortcut_keys.code.expect("已检查主按键"),
    );
    let manager = app.global_shortcut();
    manager
        .unregister_all()
        .map_err(|error| OrbitError::Shortcut(format!("清理旧快捷键失败：{error}")))?;
    manager
        .on_shortcut(shortcut, move |app, _, event| match event.state() {
            ShortcutState::Pressed => {
                let _ = show_wheel_window(app);
                start_shortcut_release_watcher(app.clone(), shortcut_keys.watch_keys.clone());
            }
            ShortcutState::Released => {
                if !shortcut_keys
                    .watch_keys
                    .iter()
                    .all(|key| is_watch_key_down(*key))
                {
                    let _ = release_wheel_selection(app);
                }
            }
        })
        .map_err(|error| OrbitError::Shortcut(format!("注册触发快捷键失败：{error}")))?;

    Ok(())
}

fn start_shortcut_release_watcher(app: AppHandle, watch_keys: Vec<WatchKey>) {
    let token = SHORTCUT_WATCH_TOKEN.fetch_add(1, Ordering::SeqCst) + 1;
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(60));
        while SHORTCUT_WATCH_TOKEN.load(Ordering::SeqCst) == token {
            if !watch_keys.iter().all(|key| is_watch_key_down(*key)) {
                let _ = release_wheel_selection(&app);
                return;
            }

            std::thread::sleep(Duration::from_millis(16));
        }
    });
}

fn is_watch_key_down(key: WatchKey) -> bool {
    match key {
        WatchKey::Single(key) => is_virtual_key_down(key),
        WatchKey::Either(left, right) => is_virtual_key_down(left) || is_virtual_key_down(right),
    }
}

fn is_virtual_key_down(key: VIRTUAL_KEY) -> bool {
    unsafe { GetAsyncKeyState(i32::from(key)) < 0 }
}

pub fn normalize_shortcut(value: &str) -> Option<String> {
    let mut modifiers = Vec::new();
    let mut main_key = None;

    for part in value
        .split('+')
        .map(str::trim)
        .filter(|part| !part.is_empty())
    {
        if let Some(modifier) = normalize_modifier(part) {
            if !modifiers.contains(&modifier) {
                modifiers.push(modifier);
            }
            continue;
        }

        let normalized_main_key = normalize_code(part)?;
        if main_key.is_some() {
            return None;
        }
        main_key = Some(normalized_main_key);
    }

    let main_key = main_key?;
    if modifiers.is_empty() {
        return None;
    }

    let mut parts = Vec::new();
    for modifier in ["Ctrl", "Alt", "Shift", "Win"] {
        if modifiers.contains(&modifier) {
            parts.push(modifier);
        }
    }
    parts.push(main_key);
    Some(parts.join("+"))
}

fn show_wheel_window(app: &AppHandle) -> Result<(), tauri::Error> {
    if let Some(window) = app.get_webview_window("wheel") {
        make_wheel_window_transparent(&window);
        if let Some(size) = wheel_size(app) {
            let position = centered_window_position(size);
            window.set_size(LogicalSize::new(f64::from(size), f64::from(size)))?;
            window.set_position(LogicalPosition::new(position.x, position.y))?;
        }
        window.show()?;
        window.set_focus()?;
        let _ = window.emit("orbit:wheel:shortcut-open", ());
    }

    Ok(())
}

fn wheel_size(app: &AppHandle) -> Option<u16> {
    let state = app.try_state::<crate::state::AppState>()?;
    state.config.read().ok().map(|config| config.wheel.size_px)
}

fn centered_window_position(wheel_size_px: u16) -> WindowPosition {
    let size = i32::from(wheel_size_px);
    let cursor = cursor_position().unwrap_or_else(|| WindowPosition {
        x: size / 2,
        y: size / 2,
    });
    let max_x = unsafe { GetSystemMetrics(SM_CXSCREEN) }.saturating_sub(size);
    let max_y = unsafe { GetSystemMetrics(SM_CYSCREEN) }.saturating_sub(size);

    WindowPosition {
        x: (cursor.x - size / 2).clamp(0, max_x.max(0)),
        y: (cursor.y - size / 2).clamp(0, max_y.max(0)),
    }
}

fn cursor_position() -> Option<WindowPosition> {
    let mut point = POINT { x: 0, y: 0 };
    let ok = unsafe { GetCursorPos(&mut point) };
    if ok == 0 {
        return None;
    }

    Some(WindowPosition {
        x: point.x,
        y: point.y,
    })
}

struct WindowPosition {
    x: i32,
    y: i32,
}

fn release_wheel_selection(app: &AppHandle) -> Result<(), tauri::Error> {
    if let Some(window) = app.get_webview_window("wheel") {
        let release_token = SHORTCUT_WATCH_TOKEN.load(Ordering::SeqCst);
        let _ = window.emit("orbit:wheel:shortcut-release", ());
        schedule_shortcut_release_hide(app.clone(), release_token);
    }

    Ok(())
}

fn schedule_shortcut_release_hide(app: AppHandle, release_token: u64) {
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(120));
        if SHORTCUT_WATCH_TOKEN.load(Ordering::SeqCst) != release_token {
            return;
        }

        if let Some(window) = app.get_webview_window("wheel") {
            let _ = window.hide();
        }
    });
}

#[derive(Clone, Debug)]
struct ShortcutKeys {
    modifiers: Modifiers,
    code: Option<Code>,
    watch_keys: Vec<WatchKey>,
}

fn parse_shortcut_keys(value: &str) -> Result<ShortcutKeys, OrbitError> {
    let Some(value) = normalize_shortcut(value) else {
        return Err(OrbitError::Shortcut(
            "触发快捷键必须使用 Ctrl、Alt、Shift 或 Win 与另一个按键组合".to_string(),
        ));
    };
    let mut modifiers = Modifiers::empty();
    let mut code = None;
    let mut watch_keys = Vec::new();

    for part in value
        .split('+')
        .map(str::trim)
        .filter(|part| !part.is_empty())
    {
        if let Some((modifier, virtual_key)) = parse_modifier(part) {
            modifiers |= modifier;
            watch_keys.push(virtual_key);
            continue;
        }

        if code.is_some() {
            return Err(OrbitError::Shortcut(
                "触发快捷键只能包含一个主按键".to_string(),
            ));
        }
        code = Some(parse_code(part)?);
        watch_keys.push(parse_virtual_key(part)?);
    }

    if modifiers.is_empty() || code.is_none() {
        return Err(OrbitError::Shortcut(
            "触发快捷键必须使用 Ctrl、Alt、Shift 或 Win 与另一个按键组合".to_string(),
        ));
    }

    Ok(ShortcutKeys {
        modifiers,
        code,
        watch_keys,
    })
}

fn normalize_modifier(value: &str) -> Option<&'static str> {
    match value.to_ascii_lowercase().as_str() {
        "ctrl" | "control" => Some("Ctrl"),
        "alt" => Some("Alt"),
        "shift" => Some("Shift"),
        "win" | "meta" | "cmd" | "command" | "super" => Some("Win"),
        _ => None,
    }
}

fn parse_modifier(value: &str) -> Option<(Modifiers, WatchKey)> {
    match value.to_ascii_lowercase().as_str() {
        "ctrl" | "control" => Some((Modifiers::CONTROL, WatchKey::Single(VK_CONTROL))),
        "alt" => Some((Modifiers::ALT, WatchKey::Single(VK_MENU))),
        "shift" => Some((Modifiers::SHIFT, WatchKey::Single(VK_SHIFT))),
        "win" | "meta" | "cmd" | "command" | "super" => {
            Some((Modifiers::SUPER, WatchKey::Either(VK_LWIN, VK_RWIN)))
        }
        _ => None,
    }
}

fn normalize_code(value: &str) -> Option<&'static str> {
    let upper = value.to_ascii_uppercase();
    if upper.len() == 1 {
        let character = upper.as_bytes()[0] as char;
        if character.is_ascii_uppercase() || character.is_ascii_digit() {
            return match character {
                'A' => Some("A"),
                'B' => Some("B"),
                'C' => Some("C"),
                'D' => Some("D"),
                'E' => Some("E"),
                'F' => Some("F"),
                'G' => Some("G"),
                'H' => Some("H"),
                'I' => Some("I"),
                'J' => Some("J"),
                'K' => Some("K"),
                'L' => Some("L"),
                'M' => Some("M"),
                'N' => Some("N"),
                'O' => Some("O"),
                'P' => Some("P"),
                'Q' => Some("Q"),
                'R' => Some("R"),
                'S' => Some("S"),
                'T' => Some("T"),
                'U' => Some("U"),
                'V' => Some("V"),
                'W' => Some("W"),
                'X' => Some("X"),
                'Y' => Some("Y"),
                'Z' => Some("Z"),
                '0' => Some("0"),
                '1' => Some("1"),
                '2' => Some("2"),
                '3' => Some("3"),
                '4' => Some("4"),
                '5' => Some("5"),
                '6' => Some("6"),
                '7' => Some("7"),
                '8' => Some("8"),
                '9' => Some("9"),
                _ => None,
            };
        }
    }

    match value.to_ascii_lowercase().as_str() {
        "arrowdown" => Some("ArrowDown"),
        "arrowleft" => Some("ArrowLeft"),
        "arrowright" => Some("ArrowRight"),
        "arrowup" => Some("ArrowUp"),
        "backquote" => Some("Backquote"),
        "backslash" => Some("Backslash"),
        "backspace" => Some("Backspace"),
        "bracketleft" => Some("BracketLeft"),
        "bracketright" => Some("BracketRight"),
        "comma" => Some("Comma"),
        "delete" => Some("Delete"),
        "end" => Some("End"),
        "enter" => Some("Enter"),
        "equal" => Some("Equal"),
        "esc" | "escape" => Some("Escape"),
        "home" => Some("Home"),
        "insert" => Some("Insert"),
        "minus" => Some("Minus"),
        "pagedown" => Some("PageDown"),
        "pageup" => Some("PageUp"),
        "period" => Some("Period"),
        "quote" => Some("Quote"),
        "semicolon" => Some("Semicolon"),
        "slash" => Some("Slash"),
        "space" => Some("Space"),
        "tab" => Some("Tab"),
        _ if upper.starts_with('F') => match upper.as_str() {
            "F1" => Some("F1"),
            "F2" => Some("F2"),
            "F3" => Some("F3"),
            "F4" => Some("F4"),
            "F5" => Some("F5"),
            "F6" => Some("F6"),
            "F7" => Some("F7"),
            "F8" => Some("F8"),
            "F9" => Some("F9"),
            "F10" => Some("F10"),
            "F11" => Some("F11"),
            "F12" => Some("F12"),
            "F13" => Some("F13"),
            "F14" => Some("F14"),
            "F15" => Some("F15"),
            "F16" => Some("F16"),
            "F17" => Some("F17"),
            "F18" => Some("F18"),
            "F19" => Some("F19"),
            "F20" => Some("F20"),
            "F21" => Some("F21"),
            "F22" => Some("F22"),
            "F23" => Some("F23"),
            "F24" => Some("F24"),
            _ => None,
        },
        _ => None,
    }
}

fn parse_code(value: &str) -> Result<Code, OrbitError> {
    let upper = value.to_ascii_uppercase();
    if upper.len() == 1 {
        let character = upper.as_bytes()[0] as char;
        if character.is_ascii_alphabetic() {
            return Ok(match character {
                'A' => Code::KeyA,
                'B' => Code::KeyB,
                'C' => Code::KeyC,
                'D' => Code::KeyD,
                'E' => Code::KeyE,
                'F' => Code::KeyF,
                'G' => Code::KeyG,
                'H' => Code::KeyH,
                'I' => Code::KeyI,
                'J' => Code::KeyJ,
                'K' => Code::KeyK,
                'L' => Code::KeyL,
                'M' => Code::KeyM,
                'N' => Code::KeyN,
                'O' => Code::KeyO,
                'P' => Code::KeyP,
                'Q' => Code::KeyQ,
                'R' => Code::KeyR,
                'S' => Code::KeyS,
                'T' => Code::KeyT,
                'U' => Code::KeyU,
                'V' => Code::KeyV,
                'W' => Code::KeyW,
                'X' => Code::KeyX,
                'Y' => Code::KeyY,
                'Z' => Code::KeyZ,
                _ => unreachable!("已检查 ASCII 字母"),
            });
        }

        if character.is_ascii_digit() {
            return Ok(match character {
                '0' => Code::Digit0,
                '1' => Code::Digit1,
                '2' => Code::Digit2,
                '3' => Code::Digit3,
                '4' => Code::Digit4,
                '5' => Code::Digit5,
                '6' => Code::Digit6,
                '7' => Code::Digit7,
                '8' => Code::Digit8,
                '9' => Code::Digit9,
                _ => unreachable!("已检查 ASCII 数字"),
            });
        }
    }

    match value {
        "ArrowDown" => Ok(Code::ArrowDown),
        "ArrowLeft" => Ok(Code::ArrowLeft),
        "ArrowRight" => Ok(Code::ArrowRight),
        "ArrowUp" => Ok(Code::ArrowUp),
        "Backquote" => Ok(Code::Backquote),
        "Backslash" => Ok(Code::Backslash),
        "Backspace" => Ok(Code::Backspace),
        "BracketLeft" => Ok(Code::BracketLeft),
        "BracketRight" => Ok(Code::BracketRight),
        "Comma" => Ok(Code::Comma),
        "Delete" => Ok(Code::Delete),
        "End" => Ok(Code::End),
        "Enter" => Ok(Code::Enter),
        "Equal" => Ok(Code::Equal),
        "Escape" => Ok(Code::Escape),
        "Home" => Ok(Code::Home),
        "Insert" => Ok(Code::Insert),
        "Minus" => Ok(Code::Minus),
        "PageDown" => Ok(Code::PageDown),
        "PageUp" => Ok(Code::PageUp),
        "Period" => Ok(Code::Period),
        "Quote" => Ok(Code::Quote),
        "Semicolon" => Ok(Code::Semicolon),
        "Slash" => Ok(Code::Slash),
        "Space" => Ok(Code::Space),
        "Tab" => Ok(Code::Tab),
        _ if upper.starts_with('F') => parse_function_key(&upper),
        _ => Err(OrbitError::Shortcut(format!("不支持的触发按键：{value}"))),
    }
}

fn parse_virtual_key(value: &str) -> Result<WatchKey, OrbitError> {
    let upper = value.to_ascii_uppercase();
    if upper.len() == 1 {
        let character = upper.as_bytes()[0] as char;
        if character.is_ascii_alphabetic() {
            return Ok(WatchKey::Single((character as u16) as VIRTUAL_KEY));
        }

        if character.is_ascii_digit() {
            return Ok(WatchKey::Single(match character {
                '0' => VK_0,
                '1' => VK_1,
                '2' => VK_2,
                '3' => VK_3,
                '4' => VK_4,
                '5' => VK_5,
                '6' => VK_6,
                '7' => VK_7,
                '8' => VK_8,
                '9' => VK_9,
                _ => unreachable!("已检查 ASCII 数字"),
            }));
        }
    }

    let virtual_key = match value {
        "ArrowDown" => VK_DOWN,
        "ArrowLeft" => VK_LEFT,
        "ArrowRight" => VK_RIGHT,
        "ArrowUp" => VK_UP,
        "Backquote" => VK_OEM_3,
        "Backslash" => VK_OEM_5,
        "Backspace" => VK_BACK,
        "BracketLeft" => VK_OEM_4,
        "BracketRight" => VK_OEM_6,
        "Comma" => VK_OEM_COMMA,
        "Delete" => VK_DELETE,
        "End" => VK_END,
        "Enter" => VK_RETURN,
        "Equal" => VK_OEM_PLUS,
        "Escape" => VK_ESCAPE,
        "Home" => VK_HOME,
        "Insert" => VK_INSERT,
        "Minus" => VK_OEM_MINUS,
        "PageDown" => VK_NEXT,
        "PageUp" => VK_PRIOR,
        "Period" => VK_OEM_PERIOD,
        "Quote" => VK_OEM_7,
        "Semicolon" => VK_OEM_1,
        "Slash" => VK_OEM_2,
        "Space" => VK_SPACE,
        "Tab" => VK_TAB,
        _ if upper.starts_with('F') => parse_function_virtual_key(&upper)?,
        _ => return Err(OrbitError::Shortcut(format!("不支持的触发按键：{value}"))),
    };

    Ok(WatchKey::Single(virtual_key))
}

fn parse_function_key(value: &str) -> Result<Code, OrbitError> {
    match value {
        "F1" => Ok(Code::F1),
        "F2" => Ok(Code::F2),
        "F3" => Ok(Code::F3),
        "F4" => Ok(Code::F4),
        "F5" => Ok(Code::F5),
        "F6" => Ok(Code::F6),
        "F7" => Ok(Code::F7),
        "F8" => Ok(Code::F8),
        "F9" => Ok(Code::F9),
        "F10" => Ok(Code::F10),
        "F11" => Ok(Code::F11),
        "F12" => Ok(Code::F12),
        "F13" => Ok(Code::F13),
        "F14" => Ok(Code::F14),
        "F15" => Ok(Code::F15),
        "F16" => Ok(Code::F16),
        "F17" => Ok(Code::F17),
        "F18" => Ok(Code::F18),
        "F19" => Ok(Code::F19),
        "F20" => Ok(Code::F20),
        "F21" => Ok(Code::F21),
        "F22" => Ok(Code::F22),
        "F23" => Ok(Code::F23),
        "F24" => Ok(Code::F24),
        _ => Err(OrbitError::Shortcut(format!("不支持的功能键：{value}"))),
    }
}

fn parse_function_virtual_key(value: &str) -> Result<VIRTUAL_KEY, OrbitError> {
    match value {
        "F1" => Ok(VK_F1),
        "F2" => Ok(VK_F2),
        "F3" => Ok(VK_F3),
        "F4" => Ok(VK_F4),
        "F5" => Ok(VK_F5),
        "F6" => Ok(VK_F6),
        "F7" => Ok(VK_F7),
        "F8" => Ok(VK_F8),
        "F9" => Ok(VK_F9),
        "F10" => Ok(VK_F10),
        "F11" => Ok(VK_F11),
        "F12" => Ok(VK_F12),
        "F13" => Ok(VK_F13),
        "F14" => Ok(VK_F14),
        "F15" => Ok(VK_F15),
        "F16" => Ok(VK_F16),
        "F17" => Ok(VK_F17),
        "F18" => Ok(VK_F18),
        "F19" => Ok(VK_F19),
        "F20" => Ok(VK_F20),
        "F21" => Ok(VK_F21),
        "F22" => Ok(VK_F22),
        "F23" => Ok(VK_F23),
        "F24" => Ok(VK_F24),
        _ => Err(OrbitError::Shortcut(format!("不支持的功能键：{value}"))),
    }
}

#[cfg(test)]
mod tests {
    use super::normalize_shortcut;
    use super::parse_shortcut_keys;

    #[test]
    fn accepts_modifier_combo() {
        assert!(parse_shortcut_keys("Ctrl+Shift+K").is_ok());
        assert!(parse_shortcut_keys("Alt+Space").is_ok());
    }

    #[test]
    fn parses_release_watch_keys_for_shortcut() {
        let keys = super::parse_shortcut_keys("Alt+Space").expect("应该解析快捷键");

        assert_eq!(keys.watch_keys.len(), 2);
    }

    #[test]
    fn rejects_single_key() {
        let error = parse_shortcut_keys("Space").expect_err("应该拒绝单键");

        assert!(error.to_string().contains("触发快捷键"));
    }

    #[test]
    fn normalizes_shortcut_parts() {
        assert_eq!(
            normalize_shortcut("shift+ctrl+k"),
            Some("Ctrl+Shift+K".to_string())
        );
        assert_eq!(
            normalize_shortcut("meta+space"),
            Some("Win+Space".to_string())
        );
    }
}
