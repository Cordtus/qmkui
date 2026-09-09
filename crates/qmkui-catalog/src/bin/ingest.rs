//! Deterministic QMK catalog ingestion.
//!
//! Walks a QMK firmware checkout for `keyboards/**/info.json` files and emits
//! a catalog JSON file matching the `qmkui-catalog` schema.
//!
//! Usage:
//!   cargo run -p qmkui-catalog --bin ingest \
//!     --qmk-path <QMK_CHECKOUT> --out <CATALOG_JSON> [--commit <HASH>]

use qmkui_catalog::ingest_qmk_boards;
use std::env;
use std::path::{Path, PathBuf};

fn main() -> Result<(), String> {
    let args: Vec<String> = env::args().skip(1).collect();
    let qmk_path = flag_value(&args, "--qmk-path").ok_or_else(|| {
        "missing --qmk-path <QMK_CHECKOUT> (a checkout of QMK firmware)".to_owned()
    })?;
    let out =
        flag_value(&args, "--out").ok_or_else(|| "missing --out <CATALOG_JSON>".to_owned())?;
    let commit = flag_value(&args, "--commit");

    let root = PathBuf::from(&qmk_path);
    let keyboards_dir = root.join("keyboards");
    if !keyboards_dir.is_dir() {
        return Err(format!(
            "{} is not a QMK checkout (no keyboards/ directory)",
            qmk_path
        ));
    }

    let mut boards: Vec<(String, String)> = Vec::new();
    collect_info_json(&keyboards_dir, &keyboards_dir, &mut boards)?;
    if boards.is_empty() {
        return Err("no keyboards/**/info.json files found under {keyboards_dir}".to_owned());
    }

    let pairs: Vec<(String, &str)> = boards
        .iter()
        .map(|(path, content)| (path.clone(), content.as_str()))
        .collect();
    let mut catalog = ingest_qmk_boards(&pairs).map_err(|error| error.to_string())?;
    if let Some(commit) = commit {
        for definition in &mut catalog {
            definition.qmk_commit = Some(commit.clone());
        }
    }

    let serialized = serde_json::to_string_pretty(&catalog).map_err(|error| error.to_string())?;
    std::fs::write(&out, format!("{serialized}\n"))
        .map_err(|error| format!("could not write {out}: {error}"))?;
    println!("Wrote {} boards to {out}", catalog.len());
    Ok(())
}

fn flag_value(args: &[String], name: &str) -> Option<String> {
    args.iter()
        .position(|arg| arg == name)
        .and_then(|index| args.get(index + 1))
        .cloned()
}

/// Recursively collects `info.json` files under `dir`, recording each board's
/// `keyboards/`-relative QMK path. `root` is the `keyboards/` directory used to
/// strip the prefix.
fn collect_info_json(
    dir: &Path,
    root: &Path,
    boards: &mut Vec<(String, String)>,
) -> Result<(), String> {
    let entries = std::fs::read_dir(dir)
        .map_err(|error| format!("could not read {}: {error}", dir.display()))?;
    for entry in entries {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        if path.is_dir() {
            collect_info_json(&path, root, boards)?;
        } else if path.file_name().is_some_and(|name| name == "info.json") {
            let relative = path.strip_prefix(root).map_err(|error| error.to_string())?;
            let qmk_keyboard = relative
                .parent()
                .map(|parent| parent.to_string_lossy().replace('\\', "/"))
                .ok_or_else(|| format!("unexpected info.json at {}", path.display()))?;
            let content = std::fs::read_to_string(&path)
                .map_err(|error| format!("could not read {}: {error}", path.display()))?;
            boards.push((qmk_keyboard, content));
        }
    }
    Ok(())
}
