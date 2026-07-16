fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "credential_vault_get",
            "credential_vault_set",
            "credential_vault_delete",
        ]),
    ))
    .expect("failed to build DarkBear desktop context");
}
