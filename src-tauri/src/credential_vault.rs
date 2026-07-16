use keyring::v1::{Entry, Error};

const SERVICE: &str = "chat.darkbear.desktop";
const MAX_PAYLOAD_BYTES: usize = 64 * 1024;

fn username(record: &str) -> Result<&'static str, String> {
    match record {
        "settings-v1" => Ok("settings-v1"),
        "credentials-v1" => Ok("credentials-v1"),
        _ => Err("unsupported credential-vault record".into()),
    }
}

fn entry(record: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, username(record)?).map_err(|_| "credential vault unavailable".into())
}

#[tauri::command]
pub async fn credential_vault_get(record: String) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || match entry(&record)?.get_password() {
        Ok(payload) if payload.len() <= MAX_PAYLOAD_BYTES => Ok(Some(payload)),
        Ok(_) => Err("credential-vault record exceeds size limit".into()),
        Err(Error::NoEntry) => Ok(None),
        Err(_) => Err("credential vault read failed".into()),
    })
    .await
    .map_err(|_| "credential vault task failed".to_string())?
}

#[tauri::command]
pub async fn credential_vault_set(record: String, payload: String) -> Result<(), String> {
    if payload.is_empty() || payload.len() > MAX_PAYLOAD_BYTES {
        return Err("credential-vault payload has invalid size".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        entry(&record)?
            .set_password(&payload)
            .map_err(|_| "credential vault write failed".into())
    })
    .await
    .map_err(|_| "credential vault task failed".to_string())?
}

#[tauri::command]
pub async fn credential_vault_delete(record: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || match entry(&record)?.delete_credential() {
        Ok(()) | Err(Error::NoEntry) => Ok(()),
        Err(_) => Err("credential vault delete failed".into()),
    })
    .await
    .map_err(|_| "credential vault task failed".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_fixed_record_names() {
        assert_eq!(username("settings-v1"), Ok("settings-v1"));
        assert_eq!(username("credentials-v1"), Ok("credentials-v1"));
        assert!(username("../../arbitrary").is_err());
        assert!(username("settings-v2").is_err());
    }
}
