use qmkui_doctor::{
    evaluate, probe_mode_from_args, snapshot_current_no_hardware_probe,
    snapshot_current_read_only_probe, ProbeMode,
};
use std::{env, process};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let probe_mode = match probe_mode_from_args(env::args().skip(1)) {
        Ok(probe_mode) => probe_mode,
        Err(error) => {
            eprintln!("qmkui-doctor: {error}");
            process::exit(2);
        }
    };
    let snapshot = match probe_mode {
        ProbeMode::ReadOnly => snapshot_current_read_only_probe(),
        ProbeMode::NoHardware => snapshot_current_no_hardware_probe(),
    };
    let findings = evaluate(&snapshot);

    let output = serde_json::json!({
        "snapshot": snapshot,
        "findings": findings
            .iter()
            .map(|finding| {
                serde_json::json!({
                    "code": finding.code,
                    "severity": format!("{:?}", finding.severity).to_ascii_lowercase(),
                    "title": finding.title,
                    "message": finding.message,
                    "remediation": finding.remediation
                })
            })
            .collect::<Vec<_>>()
    });

    println!("{}", serde_json::to_string_pretty(&output)?);
    Ok(())
}
