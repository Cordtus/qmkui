//! Filesystem-backed project store for the native shell. Atomic writes via
//! temp-file + rename; the injectable root keeps it testable.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSummary {
    pub id: String,
    pub name: String,
    pub keyboard_id: String,
    pub qmk_keyboard: String,
    pub updated_at: String,
}

pub struct ProjectStore {
    root: PathBuf,
}

impl ProjectStore {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }

    pub fn default_root() -> PathBuf {
        let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_owned());
        PathBuf::from(home).join(".local/share/qmkui/projects")
    }

    fn path_for(&self, id: &str) -> PathBuf {
        self.root.join(format!("{id}.json"))
    }

    pub fn save(&self, id: &str, project_json: &str) -> std::io::Result<()> {
        fs::create_dir_all(&self.root)?;
        let final_path = self.path_for(id);
        let temp_path = self.root.join(format!("{id}.json.tmp"));
        fs::write(&temp_path, project_json)?;
        fs::rename(&temp_path, &final_path)?;
        Ok(())
    }

    pub fn load(&self, id: &str) -> std::io::Result<Option<String>> {
        let path = self.path_for(id);
        if !path.exists() {
            return Ok(None);
        }
        fs::read_to_string(path).map(Some)
    }

    pub fn list(&self) -> Vec<ProjectSummary> {
        let mut summaries = Vec::new();
        let Ok(entries) = fs::read_dir(&self.root) else {
            return summaries;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().is_none_or(|ext| ext != "json") {
                continue;
            }
            let Ok(contents) = fs::read_to_string(&path) else {
                continue;
            };
            let Ok(value) = serde_json::from_str::<serde_json::Value>(&contents) else {
                continue;
            };
            let Some(summary) = summary_of(&value, &path) else {
                continue;
            };
            summaries.push(summary);
        }
        summaries.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
        summaries
    }

    pub fn remove(&self, id: &str) -> std::io::Result<bool> {
        let path = self.path_for(id);
        if !path.exists() {
            return Ok(false);
        }
        fs::remove_file(path)?;
        Ok(true)
    }
}

fn summary_of(value: &serde_json::Value, path: &Path) -> Option<ProjectSummary> {
    let updated_at = path
        .metadata()
        .ok()
        .and_then(|meta| meta.modified().ok())
        .map(|time| {
            let duration = time
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default();
            duration.as_millis().to_string()
        })
        .unwrap_or_default();
    Some(ProjectSummary {
        id: value.get("id")?.as_str()?.to_owned(),
        name: value.get("name")?.as_str()?.to_owned(),
        keyboard_id: value.get("target")?.get("keyboardId")?.as_str()?.to_owned(),
        qmk_keyboard: value
            .get("target")?
            .get("qmkKeyboard")?
            .as_str()?
            .to_owned(),
        updated_at,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_projects() {
        let root = std::env::temp_dir().join(format!("qmkui-store-{}", std::process::id()));
        let store = ProjectStore::new(root.clone());
        let project = r#"{"id":"p1","name":"One","target":{"keyboardId":"k","qmkKeyboard":"k/l"}}"#;

        store.save("p1", project).expect("saves");
        assert_eq!(store.load("p1").expect("loads").as_deref(), Some(project));
        assert_eq!(store.list()[0].id, "p1");
        assert_eq!(store.list()[0].qmk_keyboard, "k/l");
        assert!(store.remove("p1").expect("removes"));
        assert!(store.load("p1").expect("loads").is_none());

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn ignores_corrupt_entries() {
        let root = std::env::temp_dir().join(format!("qmkui-store-corrupt-{}", std::process::id()));
        let store = ProjectStore::new(root.clone());
        store
            .save(
                "good",
                r#"{"id":"good","name":"G","target":{"keyboardId":"k","qmkKeyboard":"k/l"}}"#,
            )
            .expect("saves");
        fs::create_dir_all(&root).expect("dir");
        fs::write(root.join("bad.json"), "{not json").expect("writes corrupt");

        assert_eq!(store.list().len(), 1);
        let _ = fs::remove_dir_all(&root);
    }
}
