fn main() {
    // アプリ自身のコマンドは、ここに挙げたものだけ capability で許可できる。
    // プラグインコマンド（fs / dialog / sql）は従来どおり各プラグインの権限で足す。
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "get_portable_dir",
            "remember_log_directory",
            "remembered_log_directory",
        ]),
    ))
    .expect("failed to run tauri-build");
}
