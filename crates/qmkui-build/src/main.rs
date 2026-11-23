//! `qmkui-build` — plan and stage a build from a QMKUI project JSON.
//!
//! Usage:
//!   qmkui-build --project project.json [--out staging-dir] [--check]
//!
//! `--check` exits 3 when the project is not ready to build. The plan is
//! printed as JSON; `--out` also writes a deterministic `keymap.json`.

use qmkui_build::artifact::{ArtifactInput, ArtifactStore};
use qmkui_build::plan::{plan_build, Readiness};
use qmkui_build::staging::export_and_stage;
use qmkui_core::model::LayoutContract;
use qmkui_core::{validate_project, KeyboardProject};
use std::collections::BTreeSet;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

struct Args {
    project: PathBuf,
    out: Option<PathBuf>,
    firmware: Option<PathBuf>,
    store: Option<PathBuf>,
    check: bool,
}

fn main() {
    let code = match run(env::args().skip(1)) {
        Ok(code) => code,
        Err(error) => {
            eprintln!("qmkui-build: {error}");
            2
        }
    };
    std::process::exit(code);
}

fn run(args: impl Iterator<Item = String>) -> Result<i32, Box<dyn std::error::Error>> {
    let args = parse_args(args)?;
    let json = fs::read_to_string(&args.project)?;
    let project: KeyboardProject = serde_json::from_str(&json)?;
    let layout = layout_contract(&project);
    let report = validate_project(&project, &layout);
    let plan = plan_build(&project, &report, qmk_available())?;
    println!("{}", serde_json::to_string_pretty(&plan)?);

    if plan.readiness == Readiness::Blocked {
        if args.check {
            return Ok(3);
        }
        if args.out.is_some() {
            return Err("project is blocked; refusing to stage an invalid keymap".into());
        }
        return Ok(0);
    }
    if let Some(out) = &args.out {
        let keymap = export_and_stage(out, &project, &layout)?;
        eprintln!("staged {}", keymap.display());
        if let Some(store) = &args.store {
            let firmware = args
                .firmware
                .as_ref()
                .ok_or("--store requires --firmware <file>")?;
            let artifact = ArtifactStore::new(store.clone()).store(ArtifactInput {
                firmware: fs::read(firmware)?,
                keymap_json: fs::read(&keymap)?,
                log: plan.commands.join("\n"),
                project_digest: plan.project_digest.clone(),
                qmk_keyboard: plan.qmk_keyboard.clone(),
                qmk_version: None,
                catalog_version: None,
                created_at: format!(
                    "unix:{}",
                    std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .map(|duration| duration.as_secs())
                        .unwrap_or_default()
                ),
            })?;
            eprintln!("stored artifact {}", artifact.id);
        }
    }
    Ok(0)
}

/// The export contract needs the stable visual-key order, which the project
/// stores on its assignments rather than as a separate field.
fn layout_contract(project: &KeyboardProject) -> LayoutContract {
    let mut seen = BTreeSet::new();
    let mut order = Vec::new();
    for layer in &project.layers {
        for assignment in &layer.assignments {
            if seen.insert(assignment.visual_key_id.clone()) {
                order.push(assignment.visual_key_id.clone());
            }
        }
    }
    LayoutContract::for_keyboard_layout(
        project.target.keyboard_id.clone(),
        project.target.qmk_keyboard.clone(),
        project.target.layout_id.clone(),
        project.target.qmk_layout_macro.clone(),
        order,
    )
}

fn qmk_available() -> bool {
    env::var_os("PATH")
        .map(|paths| {
            env::split_paths(&paths).any(|directory| {
                let candidate = directory.join("qmk");
                candidate.is_file() && is_executable(&candidate)
            })
        })
        .unwrap_or(false)
}

#[cfg(unix)]
fn is_executable(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    fs::metadata(path)
        .map(|metadata| metadata.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

#[cfg(not(unix))]
fn is_executable(path: &Path) -> bool {
    path.is_file()
}

fn parse_args(args: impl Iterator<Item = String>) -> Result<Args, String> {
    let mut project = None;
    let mut out = None;
    let mut firmware = None;
    let mut store = None;
    let mut check = false;
    let mut args = args.peekable();
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--project" => project = args.next().map(PathBuf::from),
            "--out" => out = args.next().map(PathBuf::from),
            "--firmware" => firmware = args.next().map(PathBuf::from),
            "--store" => store = args.next().map(PathBuf::from),
            "--check" => check = true,
            "-h" | "--help" => {
                println!(
                    "qmkui-build --project <json> [--out <dir>] [--check]\n\
                     \n\
                     Prints a build plan; --out stages keymap.json; --check exits 3 when blocked.\n\
                     --store <dir> --firmware <bin> records an artifact after staging."
                );
                std::process::exit(0);
            }
            other => return Err(format!("unknown argument {other}")),
        }
    }
    Ok(Args {
        project: project.ok_or("missing --project <json>")?,
        out,
        firmware,
        store,
        check,
    })
}
