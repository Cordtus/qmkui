use crate::BuildError;
use qmkui_core::qmk_json::{export_qmk_keymap, QmkKeymapJson};
use qmkui_core::LayoutContract;
use std::fs;
use std::path::{Path, PathBuf};

/// Writes the exported QMK JSON into a clean staging directory and returns the
/// path to the staged `keymap.json`. Recreating the directory keeps the build
/// input deterministic.
pub fn stage_json_project(
    staging_dir: &Path,
    export: &QmkKeymapJson,
) -> Result<PathBuf, BuildError> {
    if staging_dir.exists() {
        // Only replace a directory this tool created. A typo like `--out .`
        // must not delete an unrelated tree.
        let unrelated = fs::read_dir(staging_dir)?.any(|entry| {
            entry
                .map(|entry| {
                    entry.file_name() != "keymap.json"
                        || !entry
                            .file_type()
                            .map(|kind| kind.is_file())
                            .unwrap_or(false)
                })
                .unwrap_or(true)
        });
        if unrelated {
            return Err(std::io::Error::new(
                std::io::ErrorKind::AlreadyExists,
                format!(
                    "refusing to replace {}: it is not a QMKUI staging directory",
                    staging_dir.display()
                ),
            )
            .into());
        }
        fs::remove_dir_all(staging_dir)?;
    }
    fs::create_dir_all(staging_dir)?;
    let keymap_path = staging_dir.join("keymap.json");
    fs::write(&keymap_path, serde_json::to_vec(export)?)?;
    Ok(keymap_path)
}

/// Convenience wrapper that exports and stages in one call.
pub fn export_and_stage(
    staging_dir: &Path,
    project: &qmkui_core::model::KeyboardProject,
    layout: &LayoutContract,
) -> Result<PathBuf, BuildError> {
    let export = export_qmk_keymap(project, layout)
        .map_err(|error| BuildError::Export(error.to_string()))?;
    stage_json_project(staging_dir, &export)
}
