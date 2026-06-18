// 发布版本隐藏 Windows 控制台窗口。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    orbit_lib::run()
}
