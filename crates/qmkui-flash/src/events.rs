//! Streamed, cancelable flash execution.
//!
//! The blocking adapter remains the default library path. This session spawns
//! `qmk flash`, streams stdout/stderr as [`FlashEvent`]s, and can kill the child
//! when the operator cancels. The CLI uses this path on a terminal and asks for
//! a newline on stdin; non-interactive runs use the blocking adapter.

use crate::adapter::{blocked_result, preflight, PreparedFlash};
use crate::request::{DeviceIdentity, FlashRequest, FlashResult, FlashStatus};
use std::io::{BufRead, BufReader, Read};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::Duration;

/// Two cancellation sources: the CLI's Enter-to-cancel flag and the signal
/// handler's interrupt flag. Both are checked between child polls.
pub struct CancelToken<'a> {
    pub requested: Arc<AtomicBool>,
    pub interrupt: &'a AtomicBool,
}

impl CancelToken<'_> {
    fn is_cancelled(&self) -> bool {
        self.requested.load(Ordering::SeqCst) || self.interrupt.load(Ordering::SeqCst)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FlashEvent {
    Started { command: String },
    Stdout(String),
    Stderr(String),
    Exited { code: Option<i32> },
    Blocked(String),
    Cancelled,
    Failed(String),
}

/// Runs a prepared flash while emitting events. The [`CancelToken`] is checked
/// between child polls; setting it kills the child and returns
/// [`FlashStatus::Cancelled`].
pub fn run_flash_session<F: FnMut(FlashEvent)>(
    prepared: &PreparedFlash,
    request: &FlashRequest,
    current_project_digest: Option<&str>,
    detected_device: Option<&DeviceIdentity>,
    detected_bootloader: Option<&str>,
    cancel: CancelToken<'_>,
    mut emit: F,
) -> FlashResult {
    if let Some(blocked) = preflight(
        prepared,
        request,
        current_project_digest,
        detected_device,
        detected_bootloader,
    ) {
        if let Some(reason) = blocked.log.first() {
            emit(FlashEvent::Blocked(reason.clone()));
        }
        return blocked;
    }

    if cancel.is_cancelled() {
        emit(FlashEvent::Cancelled);
        let mut cancelled = blocked_result(
            prepared,
            "Cancelled by operator before spawning.".to_owned(),
        );
        cancelled.status = FlashStatus::Cancelled;
        return cancelled;
    }

    let command = format!(
        "{} {} (cwd {})",
        prepared.command.program,
        prepared.command.args.join(" "),
        prepared.command.cwd.as_deref().unwrap_or(".")
    );
    let mut child = match spawn(&prepared.command) {
        Ok(child) => child,
        Err(error) => {
            let reason = format!("could not start qmk: {error}");
            emit(FlashEvent::Failed(reason.clone()));
            return FlashResult {
                status: FlashStatus::Failed,
                log: vec![reason],
            };
        }
    };
    emit(FlashEvent::Started {
        command: command.clone(),
    });

    let (tx, rx) = mpsc::channel();
    let readers = match readers(&mut child, tx) {
        Ok(readers) => readers,
        Err(error) => {
            let reason = format!("could not capture qmk output: {error}");
            emit(FlashEvent::Failed(reason.clone()));
            kill_tree(&mut child);
            let _ = child.wait();
            return FlashResult {
                status: FlashStatus::Failed,
                log: vec![reason],
            };
        }
    };

    let mut log = vec![format!("running {command}")];
    let mut cancelled = false;
    let code = loop {
        if cancel.is_cancelled() {
            cancelled = true;
            kill_tree(&mut child);
            break child.wait().ok().and_then(|status| status.code());
        }
        drain(&rx, &mut log, &mut emit, 64);
        if cancel.is_cancelled() {
            cancelled = true;
            kill_tree(&mut child);
            break child.wait().ok().and_then(|status| status.code());
        }
        match child.try_wait() {
            Ok(Some(status)) => break status.code(),
            Ok(None) => thread::sleep(Duration::from_millis(25)),
            Err(error) => {
                let reason = format!("could not wait for qmk: {error}");
                emit(FlashEvent::Failed(reason.clone()));
                log.push(reason);
                kill_tree(&mut child);
                let _ = child.wait();
                wait_for_readers(readers, &rx, &mut log, &mut emit);
                return FlashResult {
                    status: FlashStatus::Failed,
                    log,
                };
            }
        }
    };

    wait_for_readers(readers, &rx, &mut log, &mut emit);

    if cancelled && code != Some(0) {
        emit(FlashEvent::Cancelled);
        log.push("cancelled by operator".to_owned());
        return FlashResult {
            status: FlashStatus::Cancelled,
            log,
        };
    }

    emit(FlashEvent::Exited { code });
    let status = match code {
        Some(0) => FlashStatus::Success,
        Some(exit) => {
            log.push(format!("qmk flash exited with code {exit}"));
            FlashStatus::Failed
        }
        None => {
            log.push("qmk flash was terminated by a signal".to_owned());
            FlashStatus::Failed
        }
    };
    FlashResult { status, log }
}

/// Drains output while waiting for the reader threads, so a chatty child cannot
/// make the UI look frozen and a cancel can still be observed.
fn wait_for_readers(
    readers: Vec<JoinHandle<()>>,
    rx: &Receiver<(bool, String)>,
    log: &mut Vec<String>,
    emit: &mut impl FnMut(FlashEvent),
) {
    while !readers.iter().all(JoinHandle::is_finished) {
        drain(rx, log, emit, 64);
        thread::sleep(Duration::from_millis(10));
    }
    for reader in readers {
        reader.join().ok();
    }
    drain(rx, log, emit, usize::MAX);
}

#[cfg(unix)]
fn kill_tree(child: &mut Child) {
    // qmk -> make -> compilers/dfu-util share the child's process group.
    unsafe {
        libc::killpg(child.id() as i32, libc::SIGKILL);
    }
    let _ = child.kill();
}

#[cfg(not(unix))]
fn kill_tree(child: &mut Child) {
    let _ = child.kill();
}

fn spawn(plan: &qmkui_build::runner::CommandPlan) -> std::io::Result<Child> {
    let mut command = Command::new(&plan.program);
    command.args(&plan.args);
    if let Some(cwd) = &plan.cwd {
        command.current_dir(cwd);
    }
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
}

fn readers(child: &mut Child, tx: Sender<(bool, String)>) -> std::io::Result<Vec<JoinHandle<()>>> {
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| std::io::Error::other("stdout was not piped"))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| std::io::Error::other("stderr was not piped"))?;
    Ok(vec![
        reader(stdout, false, tx.clone()),
        reader(stderr, true, tx),
    ])
}

fn reader<R: Read + Send + 'static>(
    input: R,
    is_stderr: bool,
    tx: Sender<(bool, String)>,
) -> JoinHandle<()> {
    thread::spawn(move || {
        let mut reader = BufReader::new(input);
        let mut bytes = Vec::new();
        loop {
            bytes.clear();
            match reader.read_until(b'\n', &mut bytes) {
                Ok(0) => break,
                Ok(_) => {
                    if bytes.last() == Some(&b'\n') {
                        bytes.pop();
                    }
                    if bytes.last() == Some(&b'\r') {
                        bytes.pop();
                    }
                    let line = String::from_utf8_lossy(&bytes).into_owned();
                    if tx.send((is_stderr, line)).is_err() {
                        break;
                    }
                }
                Err(error) => {
                    let _ = tx.send((is_stderr, format!("read error: {error}")));
                    break;
                }
            }
        }
    })
}

fn drain<F: FnMut(FlashEvent)>(
    rx: &Receiver<(bool, String)>,
    log: &mut Vec<String>,
    emit: &mut F,
    limit: usize,
) {
    let mut count = 0usize;
    while count < limit {
        let Ok((is_stderr, line)) = rx.try_recv() else {
            break;
        };
        count += 1;
        if is_stderr {
            emit(FlashEvent::Stderr(line.clone()));
            log.push(format!("err  {line}"));
        } else {
            emit(FlashEvent::Stdout(line.clone()));
            log.push(format!("out  {line}"));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::request::{FlashRequest, FlashTarget};
    use qmkui_build::runner::CommandPlan;
    use std::path::PathBuf;

    fn prepared(program: &str, args: &[&str], sha: &str) -> PreparedFlash {
        PreparedFlash {
            keymap_dir: PathBuf::from("/tmp/qmkui-flash-session"),
            backup_dir: None,
            files: Vec::new(),
            sha256: sha.to_owned(),
            command: CommandPlan {
                program: program.to_owned(),
                args: args.iter().map(|arg| (*arg).to_owned()).collect(),
                cwd: None,
            },
        }
    }

    fn request(confirmed: bool, sha: &str) -> FlashRequest {
        FlashRequest {
            target: FlashTarget {
                project_digest: "digest".to_owned(),
                firmware_sha256: sha.to_owned(),
                qmk_keyboard: "example/one".to_owned(),
                bootloader: "stm32-dfu".to_owned(),
            },
            expected_device: DeviceIdentity {
                vendor_id: "0483".to_owned(),
                product_id: "df11".to_owned(),
            },
            operator_confirmed: confirmed,
        }
    }

    fn run(
        prepared: &PreparedFlash,
        request: &FlashRequest,
        cancel: Arc<AtomicBool>,
        emit: impl FnMut(FlashEvent),
    ) -> FlashResult {
        let interrupt = AtomicBool::new(false);
        run_flash_session(
            prepared,
            request,
            Some("digest"),
            Some(&request.expected_device),
            Some("stm32-dfu"),
            CancelToken {
                requested: cancel,
                interrupt: &interrupt,
            },
            emit,
        )
    }

    #[test]
    fn streams_stdout_stderr_and_exit() {
        let prepared = prepared("sh", &["-c", "printf 'out\\n'; printf 'err\\n' >&2"], "sha");
        let request = request(true, "sha");
        let mut events = Vec::new();
        let result = run(
            &prepared,
            &request,
            Arc::new(AtomicBool::new(false)),
            |event| events.push(event),
        );

        assert_eq!(result.status, FlashStatus::Success);
        assert!(matches!(events[0], FlashEvent::Started { .. }));
        assert!(events.contains(&FlashEvent::Stdout("out".to_owned())));
        assert!(events.contains(&FlashEvent::Stderr("err".to_owned())));
        assert!(events.contains(&FlashEvent::Exited { code: Some(0) }));
    }

    #[test]
    fn cancels_by_killing_the_process_group() {
        // The shell waits on a background child; killing only the direct child
        // would leave the sleep holding the pipes open.
        let prepared = prepared("sh", &["-c", "sleep 5 & wait"], "sha");
        let request = request(true, "sha");
        let cancel = Arc::new(AtomicBool::new(false));
        let signal = cancel.clone();
        let events = std::rc::Rc::new(std::cell::RefCell::new(Vec::new()));
        let sink = events.clone();
        let started = std::time::Instant::now();
        let result = run(&prepared, &request, cancel, move |event| {
            if matches!(event, FlashEvent::Started { .. }) {
                signal.store(true, Ordering::SeqCst);
            }
            sink.borrow_mut().push(event);
        });

        assert_eq!(result.status, FlashStatus::Cancelled);
        assert!(events.borrow().contains(&FlashEvent::Cancelled));
        assert!(started.elapsed() < Duration::from_secs(2));
    }

    #[test]
    fn an_interrupt_flag_cancels_before_spawning() {
        let prepared = prepared("sh", &["-c", "exit 0"], "sha");
        let request = request(true, "sha");
        let mut events = Vec::new();
        let result = run_flash_session(
            &prepared,
            &request,
            Some("digest"),
            Some(&request.expected_device),
            Some("stm32-dfu"),
            CancelToken {
                requested: Arc::new(AtomicBool::new(false)),
                interrupt: &AtomicBool::new(true),
            },
            |event| events.push(event),
        );

        assert_eq!(result.status, FlashStatus::Cancelled);
        assert!(events.contains(&FlashEvent::Cancelled));
        assert!(!events
            .iter()
            .any(|event| matches!(event, FlashEvent::Started { .. })));
    }

    #[test]
    fn cancels_before_spawning() {
        let prepared = prepared("sh", &["-c", "exit 0"], "sha");
        let request = request(true, "sha");
        let mut events = Vec::new();
        let result = run(
            &prepared,
            &request,
            Arc::new(AtomicBool::new(true)),
            |event| events.push(event),
        );

        assert_eq!(result.status, FlashStatus::Cancelled);
        assert!(events.contains(&FlashEvent::Cancelled));
        assert!(!events
            .iter()
            .any(|event| matches!(event, FlashEvent::Started { .. })));
    }

    #[test]
    fn blocked_requests_never_spawn() {
        let prepared = prepared("sh", &["-c", "exit 0"], "sha");
        let request = request(false, "sha");
        let mut events = Vec::new();
        let result = run(
            &prepared,
            &request,
            Arc::new(AtomicBool::new(false)),
            |event| events.push(event),
        );

        assert_eq!(result.status, FlashStatus::Blocked);
        assert!(events
            .iter()
            .any(|event| matches!(event, FlashEvent::Blocked(_))));
        assert!(!events
            .iter()
            .any(|event| matches!(event, FlashEvent::Started { .. })));
    }

    #[test]
    fn reports_nonzero_exit_and_signal() {
        let exit = prepared("sh", &["-c", "exit 7"], "sha");
        let request = request(true, "sha");
        let mut events = Vec::new();
        let result = run(&exit, &request, Arc::new(AtomicBool::new(false)), |event| {
            events.push(event)
        });
        assert_eq!(result.status, FlashStatus::Failed);
        assert!(events.contains(&FlashEvent::Exited { code: Some(7) }));

        let signal = prepared("sh", &["-c", "kill -TERM $$"], "sha");
        let mut events = Vec::new();
        let result = run(
            &signal,
            &request,
            Arc::new(AtomicBool::new(false)),
            |event| events.push(event),
        );
        assert_eq!(result.status, FlashStatus::Failed);
        assert!(events.contains(&FlashEvent::Exited { code: None }));
    }

    #[test]
    fn preserves_non_utf8_output() {
        let prepared = prepared("sh", &["-c", "printf '\\377\\n'"], "sha");
        let request = request(true, "sha");
        let mut events = Vec::new();
        let result = run(
            &prepared,
            &request,
            Arc::new(AtomicBool::new(false)),
            |event| events.push(event),
        );

        assert_eq!(result.status, FlashStatus::Success);
        assert!(events
            .iter()
            .any(|event| matches!(event, FlashEvent::Stdout(line) if line.contains('\u{FFFD}'))));
    }

    #[test]
    fn a_staged_digest_mismatch_blocks_without_spawning() {
        let prepared = prepared("sh", &["-c", "exit 0"], "sha");
        let request = request(true, "other");
        let mut events = Vec::new();
        let result = run(
            &prepared,
            &request,
            Arc::new(AtomicBool::new(false)),
            |event| events.push(event),
        );

        assert_eq!(result.status, FlashStatus::Blocked);
        assert!(events
            .iter()
            .any(|event| matches!(event, FlashEvent::Blocked(_))));
        assert!(!events
            .iter()
            .any(|event| matches!(event, FlashEvent::Started { .. })));
    }

    #[test]
    fn pre_spawn_cancel_rolls_back_the_staged_keymap() {
        let mut prepared = prepared("sh", &["-c", "exit 0"], "sha");
        let keymap = std::env::temp_dir().join(format!(
            "qmkui-flash-pre-cancel-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&keymap).unwrap();
        prepared.keymap_dir = keymap.clone();
        let request = request(true, "sha");
        let mut events = Vec::new();
        let result = run(
            &prepared,
            &request,
            Arc::new(AtomicBool::new(true)),
            |event| events.push(event),
        );

        assert_eq!(result.status, FlashStatus::Cancelled);
        assert!(!keymap.exists());
        assert!(events.contains(&FlashEvent::Cancelled));
    }

    #[test]
    fn reports_a_spawn_failure() {
        let prepared = prepared("qmkui-no-such-command", &[], "sha");
        let request = request(true, "sha");
        let mut events = Vec::new();
        let result = run(
            &prepared,
            &request,
            Arc::new(AtomicBool::new(false)),
            |event| events.push(event),
        );

        assert_eq!(result.status, FlashStatus::Failed);
        assert!(matches!(events[0], FlashEvent::Failed(_)));
    }
}
