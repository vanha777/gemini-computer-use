use enigo::{Button, Coordinate, Direction, Enigo, Keyboard, Mouse, Settings};

#[tauri::command]
fn move_mouse(x: i32, y: i32) -> Result<(), String> {
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| format!("Failed to init enigo: {:?}", e))?;
    enigo.move_mouse(x, y, Coordinate::Abs).map_err(|e| format!("Failed to move mouse: {:?}", e))?;
    Ok(())
}

#[tauri::command]
fn click_mouse(button: String) -> Result<(), String> {
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| format!("Failed to init enigo: {:?}", e))?;
    let btn = match button.as_str() {
        "left" => Button::Left,
        "right" => Button::Right,
        "middle" => Button::Middle,
        _ => return Err("Invalid button".to_string()),
    };
    enigo.button(btn, Direction::Click).map_err(|e| format!("Failed to click: {:?}", e))?;
    Ok(())
}

#[tauri::command]
fn type_text(text: String) -> Result<(), String> {
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| format!("Failed to init enigo: {:?}", e))?;
    enigo.text(&text).map_err(|e| format!("Failed to type: {:?}", e))?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![move_mouse, click_mouse, type_text])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
