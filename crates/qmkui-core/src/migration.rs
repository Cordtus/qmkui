use serde_json::Value;

pub const SUPPORTED_PROJECT_SCHEMA_VERSION: &str = "0.1.0";

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum MigrationError {
    #[error("project JSON is missing schemaVersion")]
    MissingVersion,
    #[error("project schema version {0} is not supported")]
    UnsupportedVersion(String),
}

/// Brings a raw project payload to the current supported schema. Today the
/// schema is still `0.1.0`, so this validates and passes through; future
/// migrations run here before the catalog/core contract is consumed.
pub fn migrate_project(value: Value) -> Result<Value, MigrationError> {
    let version = value
        .get("schemaVersion")
        .and_then(Value::as_str)
        .ok_or(MigrationError::MissingVersion)?;
    if version != SUPPORTED_PROJECT_SCHEMA_VERSION {
        return Err(MigrationError::UnsupportedVersion(version.to_owned()));
    }
    Ok(value)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn passes_through_current_version() {
        let value = json!({ "schemaVersion": "0.1.0", "id": "proj" });
        let migrated = migrate_project(value.clone()).expect("migrates");
        assert_eq!(migrated, value);
    }

    #[test]
    fn rejects_missing_version() {
        assert_eq!(
            migrate_project(json!({ "id": "proj" })),
            Err(MigrationError::MissingVersion)
        );
    }

    #[test]
    fn rejects_unsupported_version() {
        assert_eq!(
            migrate_project(json!({ "schemaVersion": "9.9.9" })),
            Err(MigrationError::UnsupportedVersion("9.9.9".to_owned()))
        );
    }
}
