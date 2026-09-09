//! Build planning and artifact storage for QMKUI.
//!
//! This crate turns a validated `qmkui-core` project into an executable build
//! plan and an immutable artifact record. Command execution is behind a
//! [`runner::CommandRunner`] trait so tests never touch a real `qmk` process.

pub mod artifact;
pub mod plan;
pub mod runner;
pub mod staging;

pub use artifact::{Artifact, ArtifactStore};
pub use plan::{plan_build, BuildPlan, Readiness};
pub use runner::{CommandPlan, CommandResult, CommandRunner, SystemCommandRunner};
pub use staging::stage_json_project;

use thiserror::Error;

#[derive(Debug, Error)]
pub enum BuildError {
    #[error("project validation is not ready: {0}")]
    NotReady(String),
    #[error("project serialization failed: {0}")]
    Serialize(#[from] serde_json::Error),
    #[error("qmk export failed: {0}")]
    Export(String),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("metadata is missing: {0}")]
    Metadata(String),
    #[error("artifact {0} does not exist")]
    MissingArtifact(String),
}
