#[cfg(target_os = "windows")]
mod platform {
    use std::ffi::c_void;
    use std::ptr::null_mut;
    use std::sync::atomic::{AtomicPtr, Ordering};
    use std::sync::mpsc::{self, Sender};
    use std::sync::{Mutex, OnceLock};
    use std::time::{Duration, Instant};

    use serde::Serialize;
    use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager};
    use windows_sys::Win32::Foundation::{HINSTANCE, LPARAM, LRESULT, WPARAM};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, GetSystemMetrics, SetWindowsHookExW, UnhookWindowsHookEx, HC_ACTION, HHOOK,
        MSLLHOOKSTRUCT, SM_CXSCREEN, SM_CYSCREEN, WH_MOUSE_LL, WM_MBUTTONDOWN, WM_MBUTTONUP,
        WM_MOUSEMOVE,
    };

    use crate::action::execute_action;
    use crate::config::model::{ActionConfig, OrbitConfig};
    use crate::error::OrbitError;
    use crate::make_wheel_window_transparent;

    static HOOK_HANDLE: AtomicPtr<c_void> = AtomicPtr::new(null_mut());
    static TRIGGER_STATE: OnceLock<Mutex<TriggerState>> = OnceLock::new();
    static OPERATION_SENDER: OnceLock<Sender<MouseOperation>> = OnceLock::new();

    #[derive(Debug)]
    struct TriggerState {
        app: AppHandle,
        middle_press: Option<MiddlePress>,
        session: Option<WheelSession>,
    }

    #[derive(Debug, Clone, Copy)]
    struct MiddlePress {
        origin: ScreenPoint,
        cursor: ScreenPoint,
        down_at: Instant,
    }

    #[derive(Debug, Clone, Copy)]
    struct WheelSession {
        origin: ScreenPoint,
        cursor: ScreenPoint,
    }

    #[derive(Debug, Clone, Copy, Serialize)]
    #[serde(rename_all = "camelCase")]
    pub(super) struct ScreenPoint {
        pub(super) x: i32,
        pub(super) y: i32,
    }

    #[derive(Debug, Clone, Copy, Serialize)]
    #[serde(rename_all = "camelCase")]
    struct WheelSessionPayload {
        origin: ScreenPoint,
        cursor: ScreenPoint,
        window_position: ScreenPoint,
    }

    pub fn start_mouse_trigger(app: &AppHandle) -> Result<(), OrbitError> {
        TRIGGER_STATE.get_or_init(|| {
            Mutex::new(TriggerState {
                app: app.clone(),
                middle_press: None,
                session: None,
            })
        });
        OPERATION_SENDER.get_or_init(|| start_operation_worker(app));

        if !HOOK_HANDLE.load(Ordering::SeqCst).is_null() {
            return Ok(());
        }

        let hook =
            unsafe { SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_hook_proc), 0 as HINSTANCE, 0) };

        if hook.is_null() {
            return Err(OrbitError::MouseHook(
                "注册 Windows 鼠标监听失败".to_string(),
            ));
        }

        HOOK_HANDLE.store(hook, Ordering::SeqCst);
        Ok(())
    }

    pub fn stop_mouse_trigger() {
        let hook = HOOK_HANDLE.swap(null_mut(), Ordering::SeqCst);
        if !hook.is_null() {
            unsafe {
                UnhookWindowsHookEx(hook as HHOOK);
            }
        }
    }

    unsafe extern "system" fn mouse_hook_proc(
        code: i32,
        w_param: WPARAM,
        l_param: LPARAM,
    ) -> LRESULT {
        if code == HC_ACTION as i32 {
            let event = w_param as u32;
            let mouse = unsafe { &*(l_param as *const MSLLHOOKSTRUCT) };
            let point = ScreenPoint {
                x: mouse.pt.x,
                y: mouse.pt.y,
            };
            handle_mouse_event(event, point);
        }

        unsafe {
            CallNextHookEx(
                HOOK_HANDLE.load(Ordering::SeqCst) as HHOOK,
                code,
                w_param,
                l_param,
            )
        }
    }

    fn handle_mouse_event(event: u32, point: ScreenPoint) {
        let Some(state) = TRIGGER_STATE.get() else {
            return;
        };
        let Ok(mut state) = state.lock() else {
            return;
        };

        let app = state.app.clone();
        let mut operation = None;
        let mut hold_check = None;

        match event {
            WM_MBUTTONDOWN => {
                let press = MiddlePress {
                    origin: point,
                    cursor: point,
                    down_at: Instant::now(),
                };
                state.middle_press = Some(press);
                state.session = None;
                hold_check = Some(press);
            }
            WM_MOUSEMOVE => {
                if let Some(session) = state.session.as_mut() {
                    session.cursor = point;
                    operation = Some(MouseOperation::Move(*session));
                } else if let Some(press) = state.middle_press {
                    let press = MiddlePress {
                        cursor: point,
                        ..press
                    };
                    state.middle_press = Some(press);
                    if should_start_session(&app, press) {
                        let session = WheelSession {
                            origin: press.origin,
                            cursor: point,
                        };
                        state.session = Some(session);
                        operation = Some(MouseOperation::Show(session));
                    }
                }
            }
            WM_MBUTTONUP => {
                let session = state.session.take();
                let press = state.middle_press.take();
                operation = match session {
                    Some(session) => Some(MouseOperation::Finish(session)),
                    None => press
                        .map(|press| MiddlePress {
                            cursor: point,
                            ..press
                        })
                        .filter(|press| should_start_session(&app, *press))
                        .map(|press| {
                            MouseOperation::Finish(WheelSession {
                                origin: press.origin,
                                cursor: point,
                            })
                        }),
                }
            }
            _ => {}
        }

        drop(state);

        if let Some(operation) = operation {
            dispatch_operation(operation);
        }

        if let Some(press) = hold_check {
            schedule_hold_check(app, press);
        }
    }

    fn start_operation_worker(app: &AppHandle) -> Sender<MouseOperation> {
        let (sender, receiver) = mpsc::channel::<MouseOperation>();
        let app = app.clone();
        std::thread::spawn(move || {
            while let Ok(operation) = receiver.recv() {
                operation.run(&app);
            }
        });
        sender
    }

    fn schedule_hold_check(app: AppHandle, press: MiddlePress) {
        let delay = trigger_hold_duration(&app);
        std::thread::spawn(move || {
            std::thread::sleep(delay);
            let Some(state) = TRIGGER_STATE.get() else {
                return;
            };
            let Ok(mut state) = state.lock() else {
                return;
            };
            let Some(current_press) = state.middle_press else {
                return;
            };
            if state.session.is_some() || current_press.down_at != press.down_at {
                return;
            }
            if !should_start_session(&app, current_press) {
                return;
            }

            let session = WheelSession {
                origin: current_press.origin,
                cursor: current_press.cursor,
            };
            state.session = Some(session);
            drop(state);

            dispatch_operation(MouseOperation::Show(session));
        });
    }

    fn dispatch_operation(operation: MouseOperation) {
        if let Some(sender) = OPERATION_SENDER.get() {
            let _ = sender.send(operation);
        }
    }

    enum MouseOperation {
        Show(WheelSession),
        Move(WheelSession),
        Finish(WheelSession),
    }

    impl MouseOperation {
        fn run(self, app: &AppHandle) {
            match self {
                Self::Show(session) => show_wheel(app, session),
                Self::Move(session) => emit_wheel_move(app, session),
                Self::Finish(session) => finish_session(app, session),
            }
        }
    }

    fn should_start_session(app: &AppHandle, press: MiddlePress) -> bool {
        let Some(settings) = read_trigger_settings(app) else {
            return false;
        };

        settings.enabled
            && trigger_threshold_passed(
                press.origin,
                press.cursor,
                press.down_at.elapsed(),
                settings.hold_ms,
                settings.move_threshold_px,
            )
    }

    fn trigger_hold_duration(app: &AppHandle) -> Duration {
        read_trigger_settings(app)
            .map(|settings| Duration::from_millis(u64::from(settings.hold_ms)))
            .unwrap_or_else(|| Duration::from_millis(220))
    }

    pub(super) fn trigger_threshold_passed(
        origin: ScreenPoint,
        cursor: ScreenPoint,
        elapsed: Duration,
        hold_ms: u16,
        move_threshold_px: u16,
    ) -> bool {
        elapsed >= Duration::from_millis(u64::from(hold_ms))
            && distance(origin, cursor) >= f64::from(move_threshold_px)
    }

    fn show_wheel(app: &AppHandle, session: WheelSession) {
        let Some(window) = app.get_webview_window("wheel") else {
            return;
        };
        let Some(config) = read_config(app) else {
            return;
        };
        let size = f64::from(config.wheel.size_px);
        let position = window_position(session.origin, config.wheel.size_px);

        make_wheel_window_transparent(&window);
        let _ = window.set_size(LogicalSize::new(size, size));
        let _ = window.set_position(LogicalPosition::new(position.x, position.y));
        let _ = window.show();
        let _ = window.set_focus();
        let payload = payload(session, position);
        let _ = window.emit("orbit:wheel:start", payload);
    }

    fn emit_wheel_move(app: &AppHandle, session: WheelSession) {
        let Some(window) = app.get_webview_window("wheel") else {
            return;
        };
        let Some(config) = read_config(app) else {
            return;
        };
        let position = window_position(session.origin, config.wheel.size_px);
        let payload = payload(session, position);
        let _ = window.emit("orbit:wheel:move", payload);
    }

    fn finish_session(app: &AppHandle, session: WheelSession) {
        let config = read_config(app);
        let selected_action = config
            .as_ref()
            .and_then(|config| selected_action(config, session));

        if let Some(window) = app.get_webview_window("wheel") {
            if let Some(config) = config.as_ref() {
                let position = window_position(session.origin, config.wheel.size_px);
                let payload = payload(session, position);
                let _ = window.emit("orbit:wheel:end", payload);
            }
            let _ = window.hide();
        }

        if let Some(action) = selected_action {
            if let Some(state) = app.try_state::<crate::state::AppState>() {
                let _ = execute_action(&action, &state.last_action_error);
            }
        }
    }

    fn selected_action(config: &OrbitConfig, session: WheelSession) -> Option<ActionConfig> {
        let menu = config.menus.first()?;
        let index = selected_sector_index(
            session.origin,
            session.cursor,
            menu.sectors.len(),
            config.wheel.start_angle_deg,
            config
                .wheel
                .inner_radius_px
                .max(config.trigger.cancel_distance_px),
            config.wheel.outer_radius_px,
        )?;
        menu.sectors.get(index).map(|sector| sector.action.clone())
    }

    pub(super) fn selected_sector_index(
        origin: ScreenPoint,
        cursor: ScreenPoint,
        sector_count: usize,
        start_angle_deg: i16,
        inner_radius_px: u16,
        outer_radius_px: u16,
    ) -> Option<usize> {
        if sector_count == 0 {
            return None;
        }

        let distance = distance(origin, cursor);
        if distance < f64::from(inner_radius_px) || distance > f64::from(outer_radius_px) {
            return None;
        }

        let dx = f64::from(cursor.x - origin.x);
        let dy = f64::from(cursor.y - origin.y);
        let angle = dy.atan2(dx).to_degrees().rem_euclid(360.0);
        let normalized = (angle - f64::from(start_angle_deg) + 360.0).rem_euclid(360.0);
        Some((normalized / (360.0 / sector_count as f64)).floor() as usize)
    }

    fn payload(session: WheelSession, window_position: ScreenPoint) -> WheelSessionPayload {
        WheelSessionPayload {
            origin: session.origin,
            cursor: session.cursor,
            window_position,
        }
    }

    fn window_position(origin: ScreenPoint, wheel_size_px: u16) -> ScreenPoint {
        let size = i32::from(wheel_size_px);
        let max_x = unsafe { GetSystemMetrics(SM_CXSCREEN) }.saturating_sub(size);
        let max_y = unsafe { GetSystemMetrics(SM_CYSCREEN) }.saturating_sub(size);

        ScreenPoint {
            x: (origin.x - size / 2).clamp(0, max_x.max(0)),
            y: (origin.y - size / 2).clamp(0, max_y.max(0)),
        }
    }

    fn read_config(app: &AppHandle) -> Option<OrbitConfig> {
        let state = app.try_state::<crate::state::AppState>()?;
        state.config.read().ok().map(|config| config.clone())
    }

    fn read_trigger_settings(app: &AppHandle) -> Option<TriggerSettings> {
        let state = app.try_state::<crate::state::AppState>()?;
        let config = state.config.read().ok()?;
        Some(TriggerSettings {
            enabled: config.enabled,
            hold_ms: config.trigger.hold_ms,
            move_threshold_px: config.trigger.move_threshold_px,
        })
    }

    #[derive(Debug, Clone, Copy)]
    struct TriggerSettings {
        enabled: bool,
        hold_ms: u16,
        move_threshold_px: u16,
    }

    fn distance(start: ScreenPoint, end: ScreenPoint) -> f64 {
        let dx = f64::from(end.x - start.x);
        let dy = f64::from(end.y - start.y);
        dx.hypot(dy)
    }
}

#[cfg(not(target_os = "windows"))]
mod platform {
    use tauri::AppHandle;

    use crate::error::OrbitError;

    pub fn start_mouse_trigger(_app: &AppHandle) -> Result<(), OrbitError> {
        Ok(())
    }

    pub fn stop_mouse_trigger() {}
}

#[cfg(all(test, target_os = "windows"))]
mod tests {
    use super::platform::selected_sector_index;
    use super::platform::trigger_threshold_passed;
    use super::platform::ScreenPoint;
    use std::time::Duration;

    #[test]
    fn selects_sector_by_direction() {
        let origin = ScreenPoint { x: 100, y: 100 };

        assert_eq!(
            selected_sector_index(origin, ScreenPoint { x: 100, y: 40 }, 4, -90, 42, 156),
            Some(0)
        );
        assert_eq!(
            selected_sector_index(origin, ScreenPoint { x: 160, y: 100 }, 4, -90, 42, 156),
            Some(1)
        );
    }

    #[test]
    fn dead_zone_cancels_selection() {
        let origin = ScreenPoint { x: 100, y: 100 };

        assert_eq!(
            selected_sector_index(origin, ScreenPoint { x: 110, y: 100 }, 4, -90, 42, 156),
            None
        );
    }

    #[test]
    fn outer_radius_cancels_selection() {
        let origin = ScreenPoint { x: 100, y: 100 };

        assert_eq!(
            selected_sector_index(origin, ScreenPoint { x: 300, y: 100 }, 4, -90, 42, 156),
            None
        );
    }

    #[test]
    fn trigger_threshold_requires_hold_and_move() {
        let origin = ScreenPoint { x: 100, y: 100 };
        let cursor = ScreenPoint { x: 130, y: 100 };

        assert!(trigger_threshold_passed(
            origin,
            cursor,
            Duration::from_millis(240),
            220,
            18
        ));
        assert!(!trigger_threshold_passed(
            origin,
            cursor,
            Duration::from_millis(120),
            220,
            18
        ));
        assert!(!trigger_threshold_passed(
            origin,
            ScreenPoint { x: 108, y: 100 },
            Duration::from_millis(240),
            220,
            18
        ));
    }
}

pub use platform::{start_mouse_trigger, stop_mouse_trigger};
