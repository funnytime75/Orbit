use crate::error::OrbitError;
use crate::make_wheel_window_transparent;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

pub fn sync_trigger_shortcut(app: &AppHandle, shortcut: &str) -> Result<(), OrbitError> {
    let shortcut = parse_shortcut(shortcut)?;
    let manager = app.global_shortcut();
    manager
        .unregister_all()
        .map_err(|error| OrbitError::Shortcut(format!("清理旧快捷键失败：{error}")))?;
    manager
        .on_shortcut(shortcut, |app, _, event| {
            if event.state() == ShortcutState::Pressed {
                let _ = show_wheel_window(app);
            }
        })
        .map_err(|error| OrbitError::Shortcut(format!("注册触发快捷键失败：{error}")))?;

    Ok(())
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
        window.show()?;
        window.set_focus()?;
        let _ = window.emit("orbit:wheel:shortcut-open", ());
    }

    Ok(())
}

fn parse_shortcut(value: &str) -> Result<Shortcut, OrbitError> {
    let Some(value) = normalize_shortcut(value) else {
        return Err(OrbitError::Shortcut(
            "触发快捷键必须使用 Ctrl、Alt、Shift 或 Win 与另一个按键组合".to_string(),
        ));
    };
    let mut modifiers = Modifiers::empty();
    let mut code = None;

    for part in value
        .split('+')
        .map(str::trim)
        .filter(|part| !part.is_empty())
    {
        if let Some(modifier) = parse_modifier(part) {
            modifiers |= modifier;
            continue;
        }

        if code.is_some() {
            return Err(OrbitError::Shortcut(
                "触发快捷键只能包含一个主按键".to_string(),
            ));
        }
        code = Some(parse_code(part)?);
    }

    if modifiers.is_empty() || code.is_none() {
        return Err(OrbitError::Shortcut(
            "触发快捷键必须使用 Ctrl、Alt、Shift 或 Win 与另一个按键组合".to_string(),
        ));
    }

    Ok(Shortcut::new(Some(modifiers), code.expect("已检查主按键")))
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

fn parse_modifier(value: &str) -> Option<Modifiers> {
    match value.to_ascii_lowercase().as_str() {
        "ctrl" | "control" => Some(Modifiers::CONTROL),
        "alt" => Some(Modifiers::ALT),
        "shift" => Some(Modifiers::SHIFT),
        "win" | "meta" | "cmd" | "command" | "super" => Some(Modifiers::SUPER),
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

#[cfg(test)]
mod tests {
    use super::normalize_shortcut;
    use super::parse_shortcut;

    #[test]
    fn accepts_modifier_combo() {
        assert!(parse_shortcut("Ctrl+Shift+K").is_ok());
        assert!(parse_shortcut("Alt+Space").is_ok());
    }

    #[test]
    fn rejects_single_key() {
        let error = parse_shortcut("Space").expect_err("应该拒绝单键");

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
