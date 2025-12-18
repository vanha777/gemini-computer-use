use enigo::{Button, Coordinate, Direction, Enigo, Keyboard, Mouse, Settings};

#[tauri::command]
fn move_mouse(x: i32, y: i32) {
    let mut enigo = Enigo::new(&Settings::default()).unwrap();
    let _ = enigo.move_mouse(x, y, Coordinate::Abs);
}

#[tauri::command]
fn click_mouse(button: String) {
    let mut enigo = Enigo::new(&Settings::default()).unwrap();
    let btn = match button.as_str() {
        "left" => Button::Left,
        "right" => Button::Right,
        "middle" => Button::Middle,
        _ => return,
    };
    let _ = enigo.button(btn, Direction::Click);
}

#[tauri::command]
fn type_text(text: String) {
    let mut enigo = Enigo::new(&Settings::default()).unwrap();
    let _ = enigo.text(&text);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![move_mouse, click_mouse, type_text])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
