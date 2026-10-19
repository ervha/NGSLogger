use std::path::{Path, PathBuf};

use tauri::webview::WebviewWindowBuilder;
use tauri::Manager;
use tauri::WebviewUrl;
use tauri_plugin_fs::FsExt;

/// ダイアログで選んだログフォルダを、次回起動まで覚えておくファイル名。
/// exe 隣の data\ に置く。画面からの書き込み権限は与えない。
const LOG_FOLDER_FILE: &str = "log-folder.txt";

/// PSO2 NGS（PC）がログを書く場所。Documents からの相対パス。
/// Documents 自体は `%USERPROFILE%\Documents` に連結しない。
const OFFICIAL_LOG_PARTS: &[&str] = &["SEGA", "PHANTASYSTARONLINE2", "log"];

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

/// Windows の `\\?\` 付きパスを、画面に出しやすい形に戻す。
fn portable_path(path: &Path) -> PathBuf {
    #[cfg(windows)]
    {
        let text = path.to_string_lossy();
        if let Some(stripped) = text.strip_prefix(r"\\?\") {
            return PathBuf::from(stripped);
        }
    }
    path.to_path_buf()
}

fn format_remembered_log_folder(path: &Path) -> String {
    format!("{}\n", portable_path(path).display())
}

fn parse_remembered_log_folder(text: &str) -> Option<PathBuf> {
    let line = text.lines().next()?.trim().trim_start_matches('\u{feff}');
    if line.is_empty() {
        None
    } else {
        Some(PathBuf::from(line))
    }
}

/// 記録してよいのは、実在するフォルダで、ダイアログがすでにスコープへ足したものだけ。
fn persisted_directory_is_acceptable(path: &Path, already_allowed: bool) -> Result<(), String> {
    if !path.is_dir() {
        return Err("フォルダではありません".to_string());
    }
    if !already_allowed {
        return Err(
            "このフォルダは許可されていません。フォルダ選択ダイアログで選んでください".to_string(),
        );
    }
    Ok(())
}

fn remembered_log_folder_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if let Ok(base) = portable_dir() {
        if dir_is_writable(&base) {
            let data = base.join("data");
            std::fs::create_dir_all(&data).map_err(|error| error.to_string())?;
            return Ok(data.join(LOG_FOLDER_FILE));
        }
    }
    // exe の隣に書けないときは %LOCALAPPDATA% へ逃がす。
    let local = app
        .path()
        .app_local_data_dir()
        .map_err(|error| error.to_string())?;
    std::fs::create_dir_all(&local).map_err(|error| error.to_string())?;
    Ok(local.join(LOG_FOLDER_FILE))
}

/// `documents` は Known Folder の結果をそのまま渡す。`Documents` という名前は足さない。
fn official_log_dir_from(documents: &Path) -> PathBuf {
    let mut dir = documents.to_path_buf();
    for part in OFFICIAL_LOG_PARTS {
        dir.push(part);
    }
    dir
}

/// 公式ログフォルダ。Windows では `FOLDERID_Documents`（`SHGetKnownFolderPath`）。
/// Tauri の `document_dir` がそれを呼ぶ。OneDrive に移したドキュメントも、その実パスになる。
fn official_log_dir(app: &tauri::AppHandle) -> Option<PathBuf> {
    let documents = app.path().document_dir().ok()?;
    Some(official_log_dir_from(&documents))
}

fn allow_official_log_dir(app: &tauri::AppHandle) {
    let Some(dir) = official_log_dir(app) else {
        return;
    };
    let _ = app.fs_scope().allow_directory(&dir, true);
}

fn read_remembered_log_folder(app: &tauri::AppHandle) -> Option<PathBuf> {
    let file = remembered_log_folder_file(app).ok()?;
    let text = std::fs::read_to_string(file).ok()?;
    let path = parse_remembered_log_folder(&text)?;
    path.is_dir().then_some(path)
}

fn restore_remembered_log_scope(app: &tauri::AppHandle) {
    if let Ok(file) = remembered_log_folder_file(app) {
        // 画面の fs 権限から、記録ファイル自体は読めなくする。
        let _ = app.fs_scope().forbid_file(&file);
    }
    if let Some(dir) = read_remembered_log_folder(app) {
        let _ = app.fs_scope().allow_directory(&dir, true);
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

/// ダイアログが許可したログフォルダだけを、次回起動用に記録する。
/// 画面から任意のパスを足すことはできない。
#[tauri::command]
fn remember_log_directory(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let canonical = PathBuf::from(path)
        .canonicalize()
        .map_err(|_| "フォルダを確認できません".to_string())?;
    persisted_directory_is_acceptable(&canonical, app.fs_scope().is_allowed(&canonical))?;
    let file = remembered_log_folder_file(&app)?;
    std::fs::write(&file, format_remembered_log_folder(&canonical))
        .map_err(|error| error.to_string())?;
    let _ = app.fs_scope().forbid_file(&file);
    Ok(())
}

/// 前回ダイアログで選ばれ、記録してあるログフォルダ。無ければ null。
#[tauri::command]
fn remembered_log_directory(app: tauri::AppHandle) -> Option<String> {
    read_remembered_log_folder(&app).map(|path| path.to_string_lossy().into_owned())
}

/// 公式ログフォルダの実パス。フォルダがまだ無いときは null。
/// ダイアログで別の場所を選んでいるときは、画面側がそちらを優先する。
#[tauri::command]
fn official_log_directory(app: tauri::AppHandle) -> Option<String> {
    let dir = official_log_dir(&app)?;
    if !dir.is_dir() {
        return None;
    }
    Some(portable_path(&dir).to_string_lossy().into_owned())
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

    let builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
        .title("メセタ帳")
        .inner_size(1100.0, 760.0);

    #[cfg(windows)]
    let builder = if let Some(dir) = webview_dir {
        builder.data_directory(dir)
    } else {
        builder
    };
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
        // 同じ SQL を後で流すためのプラグイン。パスを data に限定できるまで、
        // 画面からの load / execute は capability で許可しない。
        .plugin(tauri_plugin_sql::Builder::default().build())
        .setup(|app| {
            restore_remembered_log_scope(app.handle());
            allow_official_log_dir(app.handle());
            open_main_window(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_portable_dir,
            remember_log_directory,
            remembered_log_directory,
            official_log_directory
        ])
        .run(tauri::generate_context!())
        .expect("メセタ帳の起動に失敗しました");
}

#[cfg(test)]
mod tests {
    use super::{
        format_remembered_log_folder, official_log_dir_from, parse_remembered_log_folder,
        persisted_directory_is_acceptable,
    };

    #[test]
    fn remembered_path_roundtrip() {
        let path = std::path::Path::new("/tmp/PHANTASYSTARONLINE2/log");
        let text = format_remembered_log_folder(path);
        assert_eq!(parse_remembered_log_folder(&text).as_deref(), Some(path));
    }

    #[test]
    fn remembered_path_ignores_blank_bom_and_extra_lines() {
        assert!(parse_remembered_log_folder("  \n").is_none());
        assert!(parse_remembered_log_folder("\u{feff}\nC:\\logs").is_none());
        assert_eq!(
            parse_remembered_log_folder("\u{feff}C:\\SEGA\\log\nignored\n").as_deref(),
            Some(std::path::Path::new("C:\\SEGA\\log"))
        );
    }

    #[test]
    fn official_log_dir_follows_the_documents_folder_it_is_given() {
        let onedrive = std::path::Path::new(r"C:\Users\alice\OneDrive\Documents");
        assert_eq!(
            official_log_dir_from(onedrive),
            onedrive
                .join("SEGA")
                .join("PHANTASYSTARONLINE2")
                .join("log")
        );
        let localized = std::path::Path::new(r"D:\クラウド\ドキュメント");
        assert_eq!(
            official_log_dir_from(localized),
            localized
                .join("SEGA")
                .join("PHANTASYSTARONLINE2")
                .join("log")
        );
    }

    #[test]
    fn only_an_allowed_directory_can_be_remembered() {
        let dir = std::env::temp_dir().join(format!("meseta-ledger-scope-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("not-a-dir.txt");
        std::fs::write(&file, b"x").unwrap();

        assert!(persisted_directory_is_acceptable(&dir, true).is_ok());
        assert!(persisted_directory_is_acceptable(&dir, false).is_err());
        assert!(persisted_directory_is_acceptable(&file, true).is_err());
        assert!(persisted_directory_is_acceptable(
            std::path::Path::new("/no/such/meseta/dir"),
            true
        )
        .is_err());

        std::fs::remove_dir_all(&dir).unwrap();
    }
}
