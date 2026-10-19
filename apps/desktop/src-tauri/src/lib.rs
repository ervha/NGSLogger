use std::path::{Path, PathBuf};

use tauri::webview::WebviewWindowBuilder;
use tauri::WebviewUrl;

/// exe のあるフォルダ。ポータブル版では、設定と DB をこの隣の data\ に置く。
fn portable_dir() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|error| error.to_string())?;
    exe.parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "実行ファイルのフォルダが分かりません".to_string())
}

fn dir_is_writable(dir: &Path) -> bool {
    let probe = dir.join(".meseta-write-probe");
    match std::fs::write(&probe, b"ok") {
        Ok(()) => {
            let _ = std::fs::remove_file(probe);
            true
        }
        Err(_) => false,
    }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct PortableDir {
    path: String,
    writable: bool,
}

/// 画面から「exe の場所」と「そこに書き込めるか」を聞く。
/// 書けないときは %LOCALAPPDATA% へ逃がす判断を、後で画面側が行う。
#[tauri::command]
fn get_portable_dir() -> Result<PortableDir, String> {
    let dir = portable_dir()?;
    let writable = dir_is_writable(&dir);
    Ok(PortableDir {
        path: dir.to_string_lossy().into_owned(),
        writable,
    })
}

/// WebView2 のキャッシュを exe 隣の data\webview に置く。Windows だけで有効。
fn open_main_window(app: &mut tauri::App) -> tauri::Result<()> {
    let webview_dir = portable_dir().ok().and_then(|dir| {
        if !dir_is_writable(&dir) {
            return None;
        }
        let webview = dir.join("data").join("webview");
        std::fs::create_dir_all(&webview).ok()?;
        Some(webview)
    });

    let mut builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
        .title("メセタ帳")
        .inner_size(1100.0, 760.0);

    #[cfg(windows)]
    if let Some(dir) = webview_dir {
        builder = builder.data_directory(dir);
    }
    #[cfg(not(windows))]
    let _ = webview_dir;

    builder.build()?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .setup(|app| {
            open_main_window(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_portable_dir])
        .run(tauri::generate_context!())
        .expect("メセタ帳の起動に失敗しました");
}
