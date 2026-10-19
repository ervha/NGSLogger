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

/// `canonicalize` やダイアログが返す `\\?\` 付きパスを、保存・復元・スコープで同じ表記にする。
///
/// ディスク文字付き（`\\?\C:\...`）は dunce と同じ条件のときだけ `C:\...` にする。
/// `\\?\UNC\サーバ\共有\...` は `\\サーバ\共有\...` にする。長いパス、予約デバイス名、
/// `..`、`\\.\` や `\\?\GLOBALROOT` はそのまま残す。I/O はしないので、Linux でもテストできる。
fn simplify_verbatim_path(path: &str) -> String {
    let path = trim_trailing_windows_sep(path);
    let Some(rest) = path.strip_prefix(r"\\?\") else {
        return path.to_string();
    };
    if let Some(simplified) = simplify_verbatim_disk(path, rest) {
        return simplified;
    }
    if let Some(simplified) = simplify_verbatim_unc(rest) {
        return simplified;
    }
    path.to_string()
}

fn trim_trailing_windows_sep(path: &str) -> &str {
    if path.len() <= 3 || !path.ends_with('\\') {
        return path;
    }
    let trimmed = path.trim_end_matches('\\');
    if trimmed.ends_with(':') {
        return &path[..trimmed.len() + 1];
    }
    if trimmed.len() < 2 {
        return path;
    }
    trimmed
}

fn windows_utf16_len(text: &str) -> usize {
    text.chars()
        .map(|ch| if (ch as u32) <= 0xFFFF { 1 } else { 2 })
        .sum()
}

fn exceeds_legacy_max_path(path: &str) -> bool {
    path.len() > 260 && windows_utf16_len(path) > 260
}

fn simplify_verbatim_disk(original: &str, rest: &str) -> Option<String> {
    let mut chars = rest.chars();
    let drive = chars.next()?;
    if !drive.is_ascii_alphabetic() || chars.next() != Some(':') {
        return None;
    }
    let body = rest.get(2..)?;
    let body = if body.is_empty() {
        ""
    } else {
        body.strip_prefix('\\')?
    };
    if !windows_components_are_safe(body) || exceeds_legacy_max_path(original) {
        return None;
    }
    Some(rest.to_string())
}

fn simplify_verbatim_unc(rest: &str) -> Option<String> {
    let tail = rest.strip_prefix(r"UNC\")?;
    let mut parts = tail.split('\\').collect::<Vec<_>>();
    if parts.last() == Some(&"") {
        parts.pop();
    }
    if parts.len() < 2 || !parts.iter().copied().all(is_safe_windows_component) {
        return None;
    }
    let simplified = format!("\\\\{tail}");
    let simplified = trim_trailing_windows_sep(&simplified).to_string();
    if exceeds_legacy_max_path(&simplified) {
        return None;
    }
    Some(simplified)
}

const RESERVED_WINDOWS_NAMES: &[&str] = &[
    "AUX", "NUL", "PRN", "CON", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

fn windows_components_are_safe(body: &str) -> bool {
    let mut parts: Vec<&str> = body.split('\\').collect();
    if parts.last() == Some(&"") {
        parts.pop();
    }
    parts.iter().copied().all(is_safe_windows_component)
}

fn is_safe_windows_component(name: &str) -> bool {
    if name.is_empty() || name == "." || name == ".." {
        return false;
    }
    if name.len() > 255 && windows_utf16_len(name) > 255 {
        return false;
    }
    if name.bytes().any(|byte| {
        matches!(
            byte,
            0..=31 | b'<' | b'>' | b':' | b'"' | b'/' | b'\\' | b'|' | b'?' | b'*'
        )
    }) {
        return false;
    }
    if matches!(name.as_bytes().last(), Some(b' ' | b'.')) {
        return false;
    }
    !is_reserved_windows_name(name)
}

fn is_reserved_windows_name(name: &str) -> bool {
    let stem = match name.rsplit_once('.') {
        Some((left, _)) if !left.is_empty() => left,
        _ => name,
    };
    let trimmed = stem.trim_end_matches([' ', '.']);
    trimmed.len() <= 4
        && RESERVED_WINDOWS_NAMES
            .iter()
            .any(|reserved| trimmed.eq_ignore_ascii_case(reserved))
}

fn display_log_path(path: &Path) -> PathBuf {
    match path.to_str() {
        Some(text) => PathBuf::from(simplify_verbatim_path(text)),
        None => path.to_path_buf(),
    }
}

/// 実在するフォルダを、記録と fs スコープで使う表記へ揃える。
/// Windows では `dunce::canonicalize` が `\\?\` を外せるときに外し、その後に同じ規則を掛ける。
fn normalize_existing_dir(path: &Path) -> Option<PathBuf> {
    let canonical = dunce::canonicalize(path).ok()?;
    let normalized = display_log_path(&canonical);
    normalized.is_dir().then_some(normalized)
}

fn format_remembered_log_folder(path: &Path) -> String {
    format!("{}\n", display_log_path(path).display())
}

fn parse_remembered_log_folder(text: &str) -> Option<PathBuf> {
    let line = text.lines().next()?.trim().trim_start_matches('\u{feff}');
    if line.is_empty() {
        None
    } else {
        Some(display_log_path(Path::new(line)))
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
/// 返す表記は記録・スコープと同じ規則で `\\?\` を外してある。
fn official_log_dir(app: &tauri::AppHandle) -> Option<PathBuf> {
    let documents = app.path().document_dir().ok()?;
    Some(display_log_path(&official_log_dir_from(&documents)))
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
    normalize_existing_dir(&path)
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
        path: display_log_path(&dir).to_string_lossy().into_owned(),
        writable,
    })
}

/// ダイアログが許可したログフォルダだけを、次回起動用に記録する。
/// 画面から任意のパスを足すことはできない。
#[tauri::command]
fn remember_log_directory(app: tauri::AppHandle, path: String) -> Result<String, String> {
    let normalized = normalize_existing_dir(Path::new(&path))
        .ok_or_else(|| "フォルダを確認できません".to_string())?;
    persisted_directory_is_acceptable(&normalized, app.fs_scope().is_allowed(&normalized))?;
    // ダイアログが `\\?\` 付きで許可していても、記録と同じ表記をスコープへ足す。
    let _ = app.fs_scope().allow_directory(&normalized, true);
    let file = remembered_log_folder_file(&app)?;
    std::fs::write(&file, format_remembered_log_folder(&normalized))
        .map_err(|error| error.to_string())?;
    let _ = app.fs_scope().forbid_file(&file);
    Ok(normalized.to_string_lossy().into_owned())
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
    Some(dir.to_string_lossy().into_owned())
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
        display_log_path, format_remembered_log_folder, normalize_existing_dir,
        official_log_dir_from, parse_remembered_log_folder, persisted_directory_is_acceptable,
        simplify_verbatim_path,
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
    fn verbatim_disk_and_unc_paths_share_one_spelling() {
        let disk = r"C:\Users\alice\OneDrive\Documents\SEGA\PHANTASYSTARONLINE2\log";
        let disk_verbatim = r"\\?\C:\Users\alice\OneDrive\Documents\SEGA\PHANTASYSTARONLINE2\log";
        assert_eq!(simplify_verbatim_path(disk_verbatim), disk);
        assert_eq!(simplify_verbatim_path(disk), disk);
        assert_eq!(simplify_verbatim_path(&format!("{disk_verbatim}\\")), disk);

        let localized = r"D:\クラウド\ドキュメント\SEGA\PHANTASYSTARONLINE2\log";
        assert_eq!(
            simplify_verbatim_path(&format!(r"\\?\{localized}")),
            localized
        );

        let unc = r"\\nas\share\SEGA\PHANTASYSTARONLINE2\log";
        let unc_verbatim = r"\\?\UNC\nas\share\SEGA\PHANTASYSTARONLINE2\log";
        assert_eq!(simplify_verbatim_path(unc_verbatim), unc);
        assert_eq!(simplify_verbatim_path(unc), unc);
        assert_eq!(simplify_verbatim_path(&format!("{unc_verbatim}\\")), unc);
    }

    #[test]
    fn verbatim_prefix_is_kept_when_the_legacy_path_would_be_wrong() {
        let reserved = r"\\?\C:\PSO2\COM1";
        assert_eq!(simplify_verbatim_path(reserved), reserved);
        assert_eq!(
            simplify_verbatim_path(r"\\?\C:\PSO2\con.txt"),
            r"\\?\C:\PSO2\con.txt"
        );

        let parent = r"\\?\C:\foo\..\bar";
        assert_eq!(simplify_verbatim_path(parent), parent);

        let long_body = "a".repeat(254);
        let long = format!(r"\\?\C:\{long_body}");
        assert_eq!(long.len(), 261);
        assert_eq!(simplify_verbatim_path(&long), long);
        let borderline = format!(r"\\?\C:\{}", "a".repeat(253));
        assert_eq!(borderline.len(), 260);
        assert_eq!(
            simplify_verbatim_path(&borderline),
            format!(r"C:\{}", "a".repeat(253))
        );

        assert_eq!(simplify_verbatim_path(r"\\.\C:\notdisk"), r"\\.\C:\notdisk");
        assert_eq!(
            simplify_verbatim_path(r"\\?\GLOBALROOT\Device\ImDisk0\path"),
            r"\\?\GLOBALROOT\Device\ImDisk0\path"
        );
        assert_eq!(
            simplify_verbatim_path("/tmp/PHANTASYSTARONLINE2/log"),
            "/tmp/PHANTASYSTARONLINE2/log"
        );
    }

    #[test]
    fn remembered_file_stores_the_same_path_the_scope_will_reopen() {
        let legacy = r"C:\Users\alice\OneDrive\Documents\SEGA\PHANTASYSTARONLINE2\log";
        let verbatim = std::path::Path::new(
            r"\\?\C:\Users\alice\OneDrive\Documents\SEGA\PHANTASYSTARONLINE2\log",
        );
        let unc_verbatim = std::path::Path::new(r"\\?\UNC\nas\share\SEGA\PHANTASYSTARONLINE2\log");
        let stored = format_remembered_log_folder(verbatim);
        assert_eq!(stored, format!("{legacy}\n"));
        assert_eq!(
            format_remembered_log_folder(std::path::Path::new(legacy)),
            stored
        );
        assert_eq!(
            parse_remembered_log_folder(&stored).as_deref(),
            Some(std::path::Path::new(legacy))
        );
        // 以前の起動が \\?\ のまま書き込んでいても、読み直しで同じ表記になる。
        assert_eq!(
            parse_remembered_log_folder(&format!("{}\n", verbatim.display())).as_deref(),
            Some(std::path::Path::new(legacy))
        );
        assert_eq!(
            parse_remembered_log_folder(&format!("{}\n", unc_verbatim.display())).as_deref(),
            Some(std::path::Path::new(
                r"\\nas\share\SEGA\PHANTASYSTARONLINE2\log"
            ))
        );
        let from_verbatim_documents =
            format!(r"\\?\C:\Users\alice\OneDrive\Documents\SEGA\PHANTASYSTARONLINE2\log");
        assert_eq!(simplify_verbatim_path(&from_verbatim_documents), legacy);
    }

    #[test]
    fn existing_directory_normalization_agrees_with_its_canonical_path() {
        let dir =
            std::env::temp_dir().join(format!("meseta-ledger-verbatim-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let normalized = normalize_existing_dir(&dir).unwrap();
        assert_eq!(
            normalized,
            display_log_path(&dunce::canonicalize(&dir).unwrap())
        );
        assert!(!normalized.to_string_lossy().starts_with(r"\\?"));
        std::fs::remove_dir_all(&dir).unwrap();
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
