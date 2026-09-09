use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandPlan {
    pub program: String,
    pub args: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cwd: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
    pub duration_ms: u64,
}

/// Injectable command execution. Tests supply a fixture runner; production
/// uses [`SystemCommandRunner`].
pub trait CommandRunner {
    fn run(&mut self, plan: &CommandPlan) -> std::io::Result<CommandResult>;
}

pub struct SystemCommandRunner;

impl CommandRunner for SystemCommandRunner {
    fn run(&mut self, plan: &CommandPlan) -> std::io::Result<CommandResult> {
        let started = std::time::Instant::now();
        let mut command = std::process::Command::new(&plan.program);
        command.args(&plan.args);
        if let Some(cwd) = &plan.cwd {
            command.current_dir(cwd);
        }
        let output = command.output()?;
        Ok(CommandResult {
            stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
            stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
            exit_code: output.status.code(),
            duration_ms: started.elapsed().as_millis() as u64,
        })
    }
}
