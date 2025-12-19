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
fn type_text(text: String) -> Result<(), String> {
    let mut enigo =
        Enigo::new(&Settings::default()).map_err(|e| format!("Failed to init enigo: {:?}", e))?;
    enigo
        .text(&text)
        .map_err(|e| format!("Failed to type: {:?}", e))?;
    Ok(())
}

#[derive(serde::Serialize)]
struct ScreenCaptureResponse {
    image: String,
    original_width: u32,
    original_height: u32,
    scaled_width: u32,
    scaled_height: u32,
    scale_factor: f32,
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
        scaled_width,
        scaled_height,
        scale_factor,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            move_mouse,
            click_mouse,
            type_text,
            capture_screen
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
