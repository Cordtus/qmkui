use crate::{BuildError, CommandPlan, CommandResult};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;

/// An immutable build record. The artifact id is the sha256 of its firmware
/// bytes, so identical inputs collide and records are content-addressed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Artifact {
    pub id: String,
    pub project_digest: String,
    pub firmware_sha256: String,
    pub qmk_keyboard: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub qmk_version: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub catalog_version: Option<String>,
    pub created_at: String,
}

/// A filesystem artifact store at `<root>/<id>/{firmware,keymap.json,log,meta.json}`.
pub struct ArtifactStore {
    root: PathBuf,
}

impl ArtifactStore {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }

    pub fn store(&self, input: ArtifactInput) -> Result<Artifact, BuildError> {
        let firmware_sha256 = hex_sha256(&input.firmware);
        let id = firmware_sha256.clone();
        let dir = self.root.join(&id);
        if dir.exists() {
            return self
                .load(&id)?
                .ok_or_else(|| BuildError::Metadata(id.clone()));
        }
        fs::create_dir_all(&dir)?;
        fs::write(dir.join("firmware"), &input.firmware)?;
        fs::write(dir.join("keymap.json"), &input.keymap_json)?;
        fs::write(dir.join("log"), &input.log)?;
        let artifact = Artifact {
            id,
            project_digest: input.project_digest,
            firmware_sha256,
            qmk_keyboard: input.qmk_keyboard,
            qmk_version: input.qmk_version,
            catalog_version: input.catalog_version,
            created_at: input.created_at,
        };
        fs::write(dir.join("meta.json"), serde_json::to_vec_pretty(&artifact)?)?;
        Ok(artifact)
    }

    pub fn load(&self, id: &str) -> Result<Option<Artifact>, BuildError> {
        let path = self.root.join(id).join("meta.json");
        if !path.exists() {
            return Ok(None);
        }
        let artifact: Artifact = serde_json::from_slice(&fs::read(path)?)?;
        Ok(Some(artifact))
    }
}

pub struct ArtifactInput {
    pub firmware: Vec<u8>,
    pub keymap_json: Vec<u8>,
    pub log: String,
    pub project_digest: String,
    pub qmk_keyboard: String,
    pub qmk_version: Option<String>,
    pub catalog_version: Option<String>,
    pub created_at: String,
}

pub fn hex_sha256(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

pub fn command_log(plan: &CommandPlan, result: &CommandResult) -> String {
    let argv = std::iter::once(&plan.program)
        .chain(plan.args.iter())
        .map(String::as_str)
        .collect::<Vec<_>>()
        .join(" ");
    format!("$ {argv}\nexit: {:?}\n{}", result.exit_code, result.stdout)
}
