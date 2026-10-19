// Windows のリリースビルドでは、余計なコンソール窓を出さない。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    meseta_ledger_lib::run();
}
