use base64::{engine::general_purpose, Engine as _};
use enigo::{Button, Coordinate, Direction, Enigo, Keyboard, Mouse, Settings};
use image::ImageOutputFormat;
use std::io::Cursor;

#[tauri::command]
fn move_mouse(x: i32, y: i32) -> Result<(), String> {
    let mut enigo =
        Enigo::new(&Settings::default()).map_err(|e| format!("Failed to init enigo: {:?}", e))?;
    enigo
        .move_mouse(x, y, Coordinate::Abs)
        .map_err(|e| format!("Failed to move mouse: {:?}", e))?;
    Ok(())
}

#[tauri::command]
fn click_mouse(button: String) -> Result<(), String> {
    let mut enigo =
        Enigo::new(&Settings::default()).map_err(|e| format!("Failed to init enigo: {:?}", e))?;
    let btn = match button.as_str() {
        "left" => Button::Left,
        "right" => Button::Right,
        "middle" => Button::Middle,
        _ => return Err("Invalid button".to_string()),
    };
    enigo
        .button(btn, Direction::Click)
        .map_err(|e| format!("Failed to click: {:?}", e))?;
    Ok(())
}

#[tauri::command]
fn mouse_down(button: String) -> Result<(), String> {
    let mut enigo =
        Enigo::new(&Settings::default()).map_err(|e| format!("Failed to init enigo: {:?}", e))?;
    let btn = match button.as_str() {
        "left" => Button::Left,
        "right" => Button::Right,
        "middle" => Button::Middle,
        _ => return Err("Invalid button".to_string()),
    };
    enigo
        .button(btn, Direction::Press)
        .map_err(|e| format!("Failed to press mouse: {:?}", e))?;
    Ok(())
}

#[tauri::command]
fn mouse_up(button: String) -> Result<(), String> {
    let mut enigo =
        Enigo::new(&Settings::default()).map_err(|e| format!("Failed to init enigo: {:?}", e))?;
    let btn = match button.as_str() {
        "left" => Button::Left,
        "right" => Button::Right,
        "middle" => Button::Middle,
        _ => return Err("Invalid button".to_string()),
    };
    enigo
        .button(btn, Direction::Release)
        .map_err(|e| format!("Failed to release mouse: {:?}", e))?;
    Ok(())
}

#[tauri::command]
fn scroll_wheel(delta_x: i32, delta_y: i32) -> Result<(), String> {
    let mut enigo =
        Enigo::new(&Settings::default()).map_err(|e| format!("Failed to init enigo: {:?}", e))?;

    // Enigo 0.3 scroll API usually takes x and y or just one axis depending on implementation.
    // Checking standard usage: scroll(x, y) might not be standard in all traits.
    // Based on typical Enigo usage:
    // enigo.scroll(y, Direction::Vertical)
    // enigo.scroll(x, Direction::Horizontal)

    if delta_y != 0 {
        enigo
            .scroll(delta_y, enigo::Axis::Vertical)
            .map_err(|e| format!("Failed to scroll vertical: {:?}", e))?;
    }
    if delta_x != 0 {
        enigo
            .scroll(delta_x, enigo::Axis::Horizontal)
            .map_err(|e| format!("Failed to scroll horizontal: {:?}", e))?;
    }
    Ok(())
}

#[tauri::command]
fn type_text(text: String) -> Result<(), String> {
    let mut enigo =
        Enigo::new(&Settings::default()).map_err(|e| format!("Failed to init enigo: {:?}", e))?;
    enigo
        .text(&text)
        .map_err(|e| format!("Failed to type: {:?}", e))?;
    Ok(())
}

#[tauri::command]
fn press_key(key: String, modifiers: Vec<String>) -> Result<(), String> {
    let mut enigo =
        Enigo::new(&Settings::default()).map_err(|e| format!("Failed to init enigo: {:?}", e))?;

    // Handle specific keys mapping if needed. For now assuming 'key' is a string char or known key name.
    // Enigo Key parsing can be complex. We will try to map common ones manually or use key! macro if we could,
    // but here we likely need to parse string to Key enum.

    // Simple implementation for modifiers:
    for modifier in &modifiers {
        let key = match modifier.as_str() {
            "Control" | "Ctrl" => Some(enigo::Key::Control),
            "Shift" => Some(enigo::Key::Shift),
            "Alt" | "Option" => Some(enigo::Key::Alt),
            "Meta" | "Command" | "Super" => Some(enigo::Key::Meta),
            _ => None,
        };
        if let Some(k) = key {
            enigo
                .key(k, Direction::Press)
                .map_err(|e| format!("Failed to press modifier: {:?}", e))?;
        }
    }

    // Now press the actual key
    // Mapping string to enigo::Key is tricky without a large match.
    // Let's support single characters and some special names.
    if key.len() == 1 {
        let char = key.chars().next().unwrap();
        enigo
            .key(enigo::Key::Unicode(char), Direction::Click)
            .map_err(|e| format!("Failed to click key: {:?}", e))?;
    } else {
        // Handle special keys
        let k = match key.to_lowercase().as_str() {
            "enter" | "return" => Some(enigo::Key::Return),
            "backspace" => Some(enigo::Key::Backspace),
            "tab" => Some(enigo::Key::Tab),
            "space" => Some(enigo::Key::Space),
            "escape" | "esc" => Some(enigo::Key::Escape),
            "left" | "arrowleft" => Some(enigo::Key::LeftArrow),
            "right" | "arrowright" => Some(enigo::Key::RightArrow),
            "up" | "arrowup" => Some(enigo::Key::UpArrow),
            "down" | "arrowdown" => Some(enigo::Key::DownArrow),
            _ => None, // Fallback or ignore
        };
        if let Some(target) = k {
            enigo
                .key(target, Direction::Click)
                .map_err(|e| format!("Failed to click special key: {:?}", e))?;
        }
    }

    // Release modifiers
    for modifier in &modifiers {
        let key = match modifier.as_str() {
            "Control" | "Ctrl" => Some(enigo::Key::Control),
            "Shift" => Some(enigo::Key::Shift),
            "Alt" | "Option" => Some(enigo::Key::Alt),
            "Meta" | "Command" | "Super" => Some(enigo::Key::Meta),
            _ => None,
        };
        if let Some(k) = key {
            enigo
                .key(k, Direction::Release)
                .map_err(|e| format!("Failed to release modifier: {:?}", e))?;
        }
    }

    Ok(())
}

#[derive(serde::Serialize)]
struct ScreenCaptureResponse {
    image: String,
    original_width: u32,
    original_height: u32,
    logical_width: u32,
    logical_height: u32,
    scaled_width: u32,
    scaled_height: u32,
    scale_factor: f32,
    x_offset: i32,
    y_offset: i32,
}

#[tauri::command]
fn capture_screen() -> Result<ScreenCaptureResponse, String> {
    let screens =
        screenshots::Screen::all().map_err(|e| format!("Failed to get screens: {:?}", e))?;
    let screen = screens.first().ok_or("No screen found")?;

    let scale_factor = screen.display_info.scale_factor;
    // Get original dimensions (screenshots crate might differ in API, checking docs or assuming standard)
    // screen.display_info.width / height are usually available or capture() returns an image with dims.
    // Let's perform capture first.
    let image = screen
        .capture()
        .map_err(|e| format!("Failed to capture screen: {:?}", e))?;

    let original_width = image.width();
    let original_height = image.height();

    // Correctly calculate logical dimensions based on the actual captured pixels
    let logical_width = (original_width as f32 / scale_factor) as u32;
    let logical_height = (original_height as f32 / scale_factor) as u32;

    let x_offset = screen.display_info.x;
    let y_offset = screen.display_info.y;

    let dynamic_image = image::DynamicImage::ImageRgba8(image);

    let resized = dynamic_image.resize(1024, 1024, image::imageops::FilterType::Lanczos3);

    let scaled_width = resized.width();
    let scaled_height = resized.height();

    let mut bytes: Vec<u8> = Vec::new();
    resized
        .write_to(&mut Cursor::new(&mut bytes), ImageOutputFormat::Jpeg(75))
        .map_err(|e| format!("Failed to encode image: {:?}", e))?;

    let base64_image = general_purpose::STANDARD.encode(&bytes);

    Ok(ScreenCaptureResponse {
        image: base64_image,
        original_width,
        original_height,
        logical_width,
        logical_height,
        scaled_width,
        scaled_height,
        scale_factor,
        x_offset,
        y_offset,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            move_mouse,
            click_mouse,
            mouse_down,
            mouse_up,
            scroll_wheel,
            press_key,
            type_text,
            capture_screen
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
