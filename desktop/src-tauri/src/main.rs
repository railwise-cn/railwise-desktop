#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod cc_switch;
mod rpc;

use cc_switch::import_cc_switch_mcp;
use calamine::{open_workbook_auto, Data, Reader};
use rpc::{rpc_kill, rpc_send, rpc_spawn, RpcState};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::menu::MenuBuilder;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::Manager;

const TRAY_MENU_SHOW: &str = "show";
const TRAY_MENU_QUIT: &str = "quit";
const ENGINEERING_WORKBENCH_DRAFT_FILE: &str = "engineering-workbench-draft.json";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum DesktopCloseBehavior {
    CloseToTray,
    CloseToQuit,
}

fn pasted_images_dir() -> PathBuf {
    std::env::temp_dir().join("reasonix-pasted-images")
}

fn parse_desktop_close_behavior(value: &serde_json::Value) -> DesktopCloseBehavior {
    match value
        .get("desktopCloseBehavior")
        .and_then(serde_json::Value::as_str)
    {
        Some("closeToTray") => DesktopCloseBehavior::CloseToTray,
        _ => DesktopCloseBehavior::CloseToQuit,
    }
}

fn config_path() -> Option<PathBuf> {
    let home = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE"))?;
    Some(PathBuf::from(home).join(".reasonix").join("config.json"))
}

fn desktop_close_behavior() -> DesktopCloseBehavior {
    let Some(path) = config_path() else {
        return DesktopCloseBehavior::CloseToQuit;
    };
    let Ok(raw) = std::fs::read_to_string(path) else {
        return DesktopCloseBehavior::CloseToQuit;
    };
    let Ok(value) = serde_json::from_str::<serde_json::Value>(&raw) else {
        return DesktopCloseBehavior::CloseToQuit;
    };
    parse_desktop_close_behavior(&value)
}

fn show_main_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn install_tray(app: &mut tauri::App) -> tauri::Result<()> {
    let menu = MenuBuilder::new(app)
        .text(TRAY_MENU_SHOW, "Show Window")
        .separator()
        .text(TRAY_MENU_QUIT, "Quit 睿威智测 RAILWISE DeepSeek版")
        .build()?;

    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip("睿威智测 RAILWISE DeepSeek版")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            TRAY_MENU_SHOW => show_main_window(app),
            TRAY_MENU_QUIT => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| match event {
            TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            }
            | TrayIconEvent::DoubleClick {
                button: MouseButton::Left,
                ..
            } => show_main_window(tray.app_handle()),
            _ => {}
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        tray = tray.icon(icon);
    }

    tray.build(app)?;
    Ok(())
}

/// #892: bundled libwayland in AppImage can ABI-mismatch the host Wayland
/// compositor → WebKitWebProcess `abort()`s on EGL display creation. Redirect
/// the child to the host's libwayland via LD_PRELOAD before WebKit forks.
#[cfg(target_os = "linux")]
fn linux_webkit_compat() {
    fn set_default(key: &str, value: &str) {
        if std::env::var_os(key).is_none() {
            std::env::set_var(key, value);
        }
    }

    // Always-on: DMABUF renderer breaks on a wider set of Mesa stacks than
    // libwayland bundling does. Cheap to disable, slow path is still fine.
    set_default("WEBKIT_DISABLE_DMABUF_RENDERER", "1");

    let in_appimage = std::env::var_os("APPDIR").is_some();
    let on_wayland = std::env::var_os("WAYLAND_DISPLAY").is_some();
    if !(in_appimage && on_wayland) {
        return;
    }

    // Disable accelerated compositing as well — same EGL init path.
    set_default("WEBKIT_DISABLE_COMPOSITING_MODE", "1");

    // Skip /usr/lib/libwayland-client.so.0 — on 64-bit Fedora that path can
    // resolve to a 32-bit library and the loader prints a wrong-ELF-class
    // warning instead of preloading.
    const CANDIDATES: &[&str] = &[
        "/usr/lib64/libwayland-client.so.0",
        "/usr/lib/x86_64-linux-gnu/libwayland-client.so.0",
        "/lib/x86_64-linux-gnu/libwayland-client.so.0",
    ];
    let Some(lib) = CANDIDATES.iter().find(|p| Path::new(p).exists()) else {
        return;
    };
    let existing = std::env::var("LD_PRELOAD").unwrap_or_default();
    let merged = if existing.is_empty() {
        (*lib).to_string()
    } else {
        format!("{lib}:{existing}")
    };
    std::env::set_var("LD_PRELOAD", merged);
}

#[derive(Serialize)]
struct FileEntry {
    path: String,
    depth: u32,
    kind: &'static str,
    name: String,
}

const SKIP_DIRS: &[&str] = &["node_modules", "target", "dist", "build", "out"];
const MAX_ENTRIES: usize = 800;

fn walk_dir(dir: &Path, depth: u32, max_depth: u32, out: &mut Vec<FileEntry>) {
    if depth > max_depth || out.len() >= MAX_ENTRIES {
        return;
    }
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    let mut items: Vec<_> = entries.flatten().collect();
    items.sort_by_key(|e| {
        let is_dir = e.file_type().map(|t| t.is_dir()).unwrap_or(false);
        (!is_dir, e.file_name())
    });
    for entry in items {
        if out.len() >= MAX_ENTRIES {
            break;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        // Hidden files (.git, .next, .env) and well-known noise dirs.
        if name.starts_with('.') || SKIP_DIRS.contains(&name.as_str()) {
            continue;
        }
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        let path = entry.path().to_string_lossy().into_owned();
        if file_type.is_dir() {
            out.push(FileEntry {
                path: path.clone(),
                depth,
                kind: "dir",
                name,
            });
            walk_dir(&entry.path(), depth + 1, max_depth, out);
        } else if file_type.is_file() {
            out.push(FileEntry {
                path,
                depth,
                kind: "file",
                name,
            });
        }
    }
}

#[tauri::command]
fn list_workspace_tree(root: String, max_depth: u32) -> Result<Vec<FileEntry>, String> {
    let root_path = Path::new(&root);
    if !root_path.is_dir() {
        return Err(format!("not a directory: {root}"));
    }
    let mut out = Vec::new();
    walk_dir(root_path, 0, max_depth.min(4), &mut out);
    Ok(out)
}

#[derive(Serialize)]
struct GitStatusEntry {
    path: String,
    kind: &'static str,
}

#[tauri::command]
fn git_status(root: String) -> Result<Vec<GitStatusEntry>, String> {
    use std::process::Command;
    let root_path = Path::new(&root);
    if !root_path.is_dir() {
        return Err(format!("not a directory: {root}"));
    }
    let mut cmd = Command::new("git");
    cmd.arg("status")
        .arg("--porcelain")
        .arg("-z")
        .current_dir(root_path);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let output = match cmd.output() {
        Ok(o) => o,
        Err(_) => return Ok(Vec::new()), // not a git repo / no git on PATH — silent
    };
    if !output.status.success() {
        return Ok(Vec::new()); // not a git repo — silent
    }
    let mut out = Vec::new();
    for rec in output.stdout.split(|&b| b == 0) {
        if rec.len() < 4 {
            continue;
        }
        // `git status --porcelain -z` format: `XY ` + path, where X / Y are
        // index / worktree statuses. Map both to a coarse `kind`.
        let x = rec[0];
        let y = rec[1];
        let kind = match (x, y) {
            (b'?', b'?') => "untracked",
            (b'A', _) | (_, b'A') => "added",
            (b'D', _) | (_, b'D') => "deleted",
            (b'M', _) | (_, b'M') => "modified",
            (b'R', _) | (_, b'R') => "renamed",
            _ => continue,
        };
        let path = String::from_utf8_lossy(&rec[3..]).into_owned();
        out.push(GitStatusEntry { path, kind });
    }
    Ok(out)
}

#[tauri::command]
fn open_in_editor(command: String, path: String, line: Option<u32>) -> Result<(), String> {
    use std::process::{Command, Stdio};
    let trimmed = command.trim();
    if trimmed.is_empty() {
        return Err("editor command is empty".into());
    }
    // VS Code / Cursor / Windsurf understand `-g path:line`; harmless for others if `line` is None.
    let mut cmd;
    #[cfg(windows)]
    {
        // Spawn through cmd.exe so `.cmd` shims (code.cmd, cursor.cmd) resolve via PATH.
        // Normalize forward slashes to backslashes — cmd.exe doesn't handle them reliably.
        let normalized = path.replace('/', "\\");
        cmd = Command::new("cmd");
        cmd.arg("/c").arg(trimmed);
        if let Some(l) = line {
            cmd.arg("-g").arg(format!("{}:{}", normalized, l));
        } else {
            cmd.arg(&normalized);
        }
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    #[cfg(not(windows))]
    {
        cmd = Command::new(trimmed);
        if let Some(l) = line {
            cmd.arg("-g").arg(format!("{}:{}", path, l));
        } else {
            cmd.arg(&path);
        }
    }
    cmd.stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    cmd.spawn().map_err(|e| format!("spawn {trimmed}: {e}"))?;
    Ok(())
}

#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, &content).map_err(|e| format!("write failed: {e}"))
}

#[tauri::command]
fn write_binary_file(path: String, bytes: Vec<u8>) -> Result<(), String> {
    std::fs::write(&path, bytes).map_err(|e| format!("write failed: {e}"))
}

#[tauri::command]
fn read_binary_file(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path).map_err(|e| format!("read failed: {e}"))
}

fn engineering_workbench_draft_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("resolve app data dir failed: {e}"))?;
    Ok(app_data_dir
        .join("railwise-engineering-workbench")
        .join(ENGINEERING_WORKBENCH_DRAFT_FILE))
}

#[tauri::command]
fn save_engineering_workbench_draft(app: tauri::AppHandle, draft: String) -> Result<(), String> {
    let path = engineering_workbench_draft_path(&app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("create draft dir failed: {e}"))?;
    }
    std::fs::write(&path, draft).map_err(|e| format!("write draft failed: {e}"))
}

#[tauri::command]
fn load_engineering_workbench_draft(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = engineering_workbench_draft_path(&app)?;
    match std::fs::read_to_string(&path) {
        Ok(content) => Ok(Some(content)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("read draft failed: {error}")),
    }
}

#[derive(Serialize)]
struct EngineeringImportFile {
    path: String,
    file_name: String,
    format: String,
    content: String,
}

fn infer_engineering_file_format(path: &Path, content: Option<&str>) -> String {
    let ext = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    match ext.as_str() {
        "xlsx" | "xlsm" | "xlsb" | "xls" | "ods" => "xlsx".to_string(),
        "geojson" => "geojson".to_string(),
        "landxml" | "xml" => "landxml".to_string(),
        "dxf" => "dxf".to_string(),
        "gsi" | "gsi8" | "gsi16" => "gsi".to_string(),
        "dat" => "dat".to_string(),
        "tpt" => "tpt".to_string(),
        "suc" => "suc".to_string(),
        "in2" => "in2".to_string(),
        "pce" => "pce".to_string(),
        "svy" => "svy".to_string(),
        "ho" => "ho".to_string(),
        "ou1" => "ou1".to_string(),
        "json" => "json".to_string(),
        "tsv" => "tsv".to_string(),
        "csv" => "csv".to_string(),
        _ => {
            let Some(text) = content else {
                return "csv".to_string();
            };
            let first_line = text
                .trim_start_matches('\u{feff}')
                .lines()
                .next()
                .unwrap_or_default();
            if text.trim_start().starts_with('{') || text.trim_start().starts_with('[') {
                if text.contains("[RAILWISE_HO_RESULTS]") {
                    "ho".to_string()
                } else if text.contains("[RAILWISE_OU1_RESULTS]") {
                    "ou1".to_string()
                } else if text.contains("PINGCHAYI_TEXT_EXCHANGE") {
                    "pce".to_string()
                } else if text.contains("TSINGHUA_SHANWEI_TEXT_EXCHANGE") {
                    "svy".to_string()
                } else if text.contains("COSA_WIN_TEXT_EXCHANGE")
                    || text.contains("[RAILWISE_TRAVERSE_ADJUSTMENT]")
                    || text.contains("[RAILWISE_LEVEL_ADJUSTMENT]")
                {
                    "in2".to_string()
                } else {
                    "json".to_string()
                }
            } else if text.trim_start().starts_with("<?xml")
                || text.trim_start().starts_with("<LandXML")
            {
                "landxml".to_string()
            } else if text.trim_start().starts_with("0\nSECTION") {
                "dxf".to_string()
            } else if text.contains("[RAILWISE_HO_RESULTS]") {
                "ho".to_string()
            } else if text.contains("[RAILWISE_OU1_RESULTS]") {
                "ou1".to_string()
            } else if text.contains("PINGCHAYI_TEXT_EXCHANGE") {
                "pce".to_string()
            } else if text.contains("TSINGHUA_SHANWEI_TEXT_EXCHANGE") {
                "svy".to_string()
            } else if text.contains("COSA_WIN_TEXT_EXCHANGE")
                || text.contains("[RAILWISE_TRAVERSE_ADJUSTMENT]")
                || text.contains("[RAILWISE_LEVEL_ADJUSTMENT]")
            {
                "in2".to_string()
            } else if first_line
                .trim_start_matches('*')
                .split_whitespace()
                .next()
                .map(|value| {
                    let bytes = value.as_bytes();
                    bytes.len() >= 6
                        && bytes[0].is_ascii_digit()
                        && bytes[1].is_ascii_digit()
                        && (value.contains('+') || value.contains('-'))
                })
                .unwrap_or(false)
            {
                "gsi".to_string()
            } else if first_line.matches('\t').count() > first_line.matches(',').count() {
                "tsv".to_string()
            } else {
                "csv".to_string()
            }
        }
    }
}

fn excel_cell_text(cell: &Data) -> String {
    cell.to_string()
        .replace('\t', " ")
        .replace('\r', " ")
        .replace('\n', " ")
        .trim()
        .to_string()
}

fn read_spreadsheet_as_tsv(path: &Path) -> Result<String, String> {
    let mut workbook = open_workbook_auto(path).map_err(|e| format!("open spreadsheet failed: {e}"))?;
    let sheet_name = workbook
        .sheet_names()
        .into_iter()
        .next()
        .ok_or_else(|| "spreadsheet has no worksheets".to_string())?;
    let range = workbook
        .worksheet_range(&sheet_name)
        .map_err(|e| format!("read worksheet failed: {e:?}"))?;
    let mut lines = Vec::new();
    for row in range.rows() {
        let mut cells: Vec<String> = row.iter().map(excel_cell_text).collect();
        while cells.last().is_some_and(|value| value.is_empty()) {
            cells.pop();
        }
        if cells.iter().any(|value| !value.is_empty()) {
            lines.push(cells.join("\t"));
        }
    }
    Ok(lines.join("\n"))
}

#[tauri::command]
fn read_engineering_import_file(path: String) -> Result<EngineeringImportFile, String> {
    let path_buf = PathBuf::from(&path);
    let file_name = path_buf
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_string();
    let initial_format = infer_engineering_file_format(&path_buf, None);
    if initial_format == "xlsx" {
        return Ok(EngineeringImportFile {
            path,
            file_name,
            format: initial_format,
            content: read_spreadsheet_as_tsv(&path_buf)?,
        });
    }
    let content = std::fs::read_to_string(&path_buf).map_err(|e| format!("read failed: {e}"))?;
    let content = content.trim_start_matches('\u{feff}').to_string();
    let format = infer_engineering_file_format(&path_buf, Some(&content));
    Ok(EngineeringImportFile {
        path,
        file_name,
        format,
        content,
    })
}

#[derive(Deserialize)]
struct SurveyAdjustmentCommandRequest {
    tool: String,
    input: serde_json::Value,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct IndoorAdjustmentAiReportRequest {
    source_tool_id: String,
    source_tool_title: String,
    project_context: serde_json::Value,
    prompt: String,
    draft_markdown: String,
    highlights: Vec<String>,
    algorithm_evidence: serde_json::Value,
    model: Option<String>,
}

fn normalize_survey_adjustment_tool(tool: &str) -> Option<&'static str> {
    match tool.trim().strip_prefix("survey_").unwrap_or(tool.trim()) {
        "level_adjust" => Some("level_adjust"),
        "traverse_adjust" => Some("traverse_adjust"),
        _ => None,
    }
}

fn survey_adjustment_runner_candidates(
    resource_dir: Option<PathBuf>,
    current_dir: PathBuf,
) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(dir) = resource_dir {
        candidates.push(dir.join("railwise").join("survey-mcp").join("dist").join("adjust-runner.js"));
    }
    candidates.push(current_dir.join("../../railwise/survey-mcp/dist/adjust-runner.js"));
    candidates.push(current_dir.join("../railwise/survey-mcp/dist/adjust-runner.js"));
    candidates.push(current_dir.join("railwise/survey-mcp/dist/adjust-runner.js"));
    candidates
}

fn resolve_survey_adjustment_runner(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if let Some(path) = std::env::var_os("RAILWISE_SURVEY_ADJUST_RUNNER").map(PathBuf::from) {
        if path.is_file() {
            return Ok(path);
        }
    }
    let resource_dir = app.path().resource_dir().ok();
    let current_dir = std::env::current_dir().map_err(|e| format!("cwd failed: {e}"))?;
    survey_adjustment_runner_candidates(resource_dir, current_dir)
        .into_iter()
        .find(|path| path.is_file())
        .ok_or_else(|| "survey-mcp adjustment runner not found; run npm run build:survey".to_string())
}

fn resolve_survey_node_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if let Ok(resource_dir) = app.path().resource_dir() {
        let node_name = if cfg!(windows) { "node.exe" } else { "node" };
        let node_path = resource_dir.join(node_name);
        let min_size = if cfg!(windows) { 100_000 } else { 50_000 };
        if node_path
            .metadata()
            .map(|metadata| metadata.len() > min_size)
            .unwrap_or(false)
        {
            return Ok(node_path);
        }
    }
    which::which("node").map_err(|e| format!("node not found: {e}"))
}

struct DeepSeekEndpoint {
    base_url: String,
    api_key: String,
    model: String,
}

fn trimmed_config_string(value: &serde_json::Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn normalize_deepseek_base_url(value: Option<String>) -> Result<String, String> {
    let base_url = value.unwrap_or_else(|| "https://api.deepseek.com".to_string());
    let trimmed = base_url.trim().trim_end_matches('/').to_string();
    if trimmed.starts_with("https://") || trimmed.starts_with("http://") {
        Ok(trimmed)
    } else {
        Err("DeepSeek baseUrl must start with http:// or https://".to_string())
    }
}

fn resolve_deepseek_endpoint() -> Result<DeepSeekEndpoint, String> {
    let env_base_url = std::env::var("DEEPSEEK_BASE_URL")
        .ok()
        .or_else(|| std::env::var("DEEPSEEK_API_BASE_URL").ok())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let env_api_key = std::env::var("DEEPSEEK_API_KEY")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let config = config_path()
        .and_then(|path| std::fs::read_to_string(path).ok())
        .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
        .unwrap_or_else(|| serde_json::json!({}));
    let config_base_url = trimmed_config_string(&config, "baseUrl");
    let config_api_key = trimmed_config_string(&config, "apiKey");
    let config_model = trimmed_config_string(&config, "model");

    let (base_url, api_key) = if let Some(base_url) = env_base_url {
        (Some(base_url), env_api_key)
    } else if let Some(base_url) = config_base_url {
        (Some(base_url), config_api_key)
    } else {
        (None, env_api_key.or(config_api_key))
    };
    let api_key = api_key.ok_or_else(|| "DeepSeek API key is not configured".to_string())?;
    Ok(DeepSeekEndpoint {
        base_url: normalize_deepseek_base_url(base_url)?,
        api_key,
        model: config_model.unwrap_or_else(|| "deepseek-v4-flash".to_string()),
    })
}

const INDOOR_AI_REPORT_NODE_SCRIPT: &str = r#"
const fs = require('fs');

(async () => {
  const request = JSON.parse(fs.readFileSync(0, 'utf8'));
  const apiKey = process.env.RAILWISE_DEEPSEEK_API_KEY;
  const baseUrl = (process.env.RAILWISE_DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
  const model = request.model || process.env.RAILWISE_DEEPSEEK_MODEL || 'deepseek-v4-flash';
  if (!apiKey) throw new Error('DeepSeek API key is not configured');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        stream: false,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: '你是轨道交通和铁路工程测量内业平差报告助手。只输出可直接归档的中文 Markdown 报告，不编造观测事实。',
          },
          { role: 'user', content: request.prompt },
        ],
      }),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`DeepSeek ${response.status}: ${text.slice(0, 500)}`);
    }
    const data = JSON.parse(text);
    const reportMarkdown = data?.choices?.[0]?.message?.content?.trim();
    if (!reportMarkdown) throw new Error('DeepSeek response did not include report content');
    process.stdout.write(JSON.stringify({
      schema: 'railwise.engineering.indoorAdjustment.aiReportGeneration.v1',
      generatedAt: new Date().toISOString(),
      provider: 'deepseek_chat_completions',
      status: 'generated',
      fallbackUsed: false,
      model,
      reportMarkdown,
      usage: data.usage || null,
    }));
  } finally {
    clearTimeout(timer);
  }
})().catch((error) => {
  process.stderr.write(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
"#;

#[tauri::command]
fn generate_indoor_adjustment_ai_report(
    app: tauri::AppHandle,
    request: IndoorAdjustmentAiReportRequest,
) -> Result<serde_json::Value, String> {
    match request.source_tool_id.as_str() {
        "traverse_adjustment" | "level_adjustment" => {}
        other => return Err(format!("indoor adjustment report tool not allowed: {other}")),
    }
    if request.prompt.trim().is_empty() {
        return Err("DeepSeek report prompt is empty".to_string());
    }
    if request.prompt.len() > 500_000 || request.draft_markdown.len() > 500_000 {
        return Err("DeepSeek report request too large".to_string());
    }
    let endpoint = resolve_deepseek_endpoint()?;
    let model = request
        .model
        .clone()
        .unwrap_or_else(|| endpoint.model.clone());
    let payload = serde_json::json!({
        "sourceToolId": request.source_tool_id,
        "sourceToolTitle": request.source_tool_title,
        "projectContext": request.project_context,
        "prompt": request.prompt,
        "draftMarkdown": request.draft_markdown,
        "highlights": request.highlights,
        "algorithmEvidence": request.algorithm_evidence,
        "model": model,
    });
    let payload_text = serde_json::to_string(&payload).map_err(|e| format!("serialize report request failed: {e}"))?;
    let node_path = resolve_survey_node_path(&app)?;
    let mut child = Command::new(node_path)
        .arg("-e")
        .arg(INDOOR_AI_REPORT_NODE_SCRIPT)
        .env("RAILWISE_DEEPSEEK_API_KEY", endpoint.api_key)
        .env("RAILWISE_DEEPSEEK_BASE_URL", endpoint.base_url)
        .env("RAILWISE_DEEPSEEK_MODEL", model)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("spawn DeepSeek report generator failed: {e}"))?;
    if let Some(mut stdin) = child.stdin.take() {
        use std::io::Write;
        stdin
            .write_all(payload_text.as_bytes())
            .map_err(|e| format!("write DeepSeek report stdin failed: {e}"))?;
    }
    let output = child
        .wait_with_output()
        .map_err(|e| format!("DeepSeek report generator failed: {e}"))?;
    if !output.status.success() {
        return Err(format!(
            "DeepSeek report generator exited with {:?}: {}",
            output.status.code(),
            bounded_text(&output.stderr)
        ));
    }
    let stdout = bounded_text(&output.stdout);
    serde_json::from_str(stdout.trim()).map_err(|e| format!("parse DeepSeek report output failed: {e}"))
}

#[tauri::command]
fn run_survey_adjustment(
    app: tauri::AppHandle,
    request: SurveyAdjustmentCommandRequest,
) -> Result<serde_json::Value, String> {
    let tool = normalize_survey_adjustment_tool(&request.tool)
        .ok_or_else(|| format!("survey adjustment tool not allowed: {}", request.tool))?;
    let payload = serde_json::json!({
        "tool": tool,
        "input": request.input,
    });
    let payload_text = serde_json::to_string(&payload).map_err(|e| format!("serialize request failed: {e}"))?;
    if payload_text.len() > 2_000_000 {
        return Err("survey adjustment request too large".to_string());
    }

    let node_path = resolve_survey_node_path(&app)?;
    let runner_path = resolve_survey_adjustment_runner(&app)?;
    let mut child = Command::new(node_path)
        .arg(runner_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("spawn survey adjustment runner failed: {e}"))?;

    if let Some(mut stdin) = child.stdin.take() {
        use std::io::Write;
        stdin
            .write_all(payload_text.as_bytes())
            .map_err(|e| format!("write survey adjustment stdin failed: {e}"))?;
    }

    let output = child
        .wait_with_output()
        .map_err(|e| format!("survey adjustment runner failed: {e}"))?;
    if !output.status.success() {
        let stderr = bounded_text(&output.stderr);
        let stdout = bounded_text(&output.stdout);
        return Err(format!(
            "survey adjustment runner exited with {:?}: {}{}",
            output.status.code(),
            stderr,
            if stdout.is_empty() { String::new() } else { format!("\nstdout:\n{stdout}") }
        ));
    }
    let stdout = bounded_text(&output.stdout);
    serde_json::from_str(stdout.trim()).map_err(|e| format!("parse survey adjustment output failed: {e}"))
}

#[derive(Serialize)]
struct EngineeringEngineBinaryStatus {
    name: String,
    available: bool,
    path: Option<String>,
    version: Option<String>,
}

#[derive(Serialize)]
struct EngineeringEngineStatus {
    id: &'static str,
    label: &'static str,
    available: bool,
    binaries: Vec<EngineeringEngineBinaryStatus>,
    install_hint: &'static str,
}

struct EngineeringEngineSpec {
    id: &'static str,
    label: &'static str,
    binaries: &'static [&'static str],
    install_hint: &'static str,
}

const ENGINEERING_ENGINE_SPECS: &[EngineeringEngineSpec] = &[
    EngineeringEngineSpec {
        id: "proj",
        label: "PROJ",
        binaries: &["projinfo", "cct"],
        install_hint: "安装 PROJ 后确保 projinfo/cct 在 PATH 中，或设置 RAILWISE_ENGINE_DIR、RAILWISE_ENGINE_PROJINFO、RAILWISE_ENGINE_CCT。",
    },
    EngineeringEngineSpec {
        id: "gdal",
        label: "GDAL/OGR",
        binaries: &["ogrinfo", "ogr2ogr"],
        install_hint: "安装 GDAL 后确保 ogrinfo/ogr2ogr 在 PATH 中，或设置 RAILWISE_ENGINE_DIR、RAILWISE_ENGINE_OGRINFO、RAILWISE_ENGINE_OGR2OGR。",
    },
    EngineeringEngineSpec {
        id: "pdal",
        label: "PDAL",
        binaries: &["pdal"],
        install_hint: "安装 PDAL 后确保 pdal 在 PATH 中，或设置 RAILWISE_ENGINE_DIR、RAILWISE_ENGINE_PDAL。",
    },
];

const ENGINEERING_ALLOWED_ENGINE_BINARIES: &[&str] =
    &["projinfo", "cct", "ogrinfo", "ogr2ogr", "pdal"];

#[derive(Deserialize)]
struct EngineeringEngineCommandRequest {
    binary: String,
    args: Vec<String>,
    stdin: Option<String>,
}

#[derive(Serialize)]
struct EngineeringEngineCommandResult {
    binary: String,
    args: Vec<String>,
    success: bool,
    exit_code: Option<i32>,
    stdout: String,
    stderr: String,
}

fn bounded_text(bytes: &[u8]) -> String {
    let text = String::from_utf8_lossy(bytes).into_owned();
    const MAX_LEN: usize = 24_000;
    if text.len() <= MAX_LEN {
        text
    } else {
        format!("{}…\n[truncated to {MAX_LEN} bytes]", &text[..MAX_LEN])
    }
}

fn command_version_at_path(path: &Path) -> Option<String> {
    let output = Command::new(path).arg("--version").output().ok()?;
    let merged = if output.stdout.is_empty() {
        output.stderr
    } else {
        output.stdout
    };
    bounded_text(&merged).lines().next().map(str::to_string)
}

fn engine_specific_env_var(binary: &str) -> String {
    let suffix: String = binary
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() {
                c.to_ascii_uppercase()
            } else {
                '_'
            }
        })
        .collect();
    format!("RAILWISE_ENGINE_{suffix}")
}

fn engine_binary_names(binary: &str) -> Vec<String> {
    #[cfg(windows)]
    {
        let mut names = vec![binary.to_string()];
        let exe = format!("{binary}.exe");
        if !names.contains(&exe) {
            names.push(exe);
        }
        names
    }
    #[cfg(not(windows))]
    {
        vec![binary.to_string()]
    }
}

fn push_unique_candidate(candidates: &mut Vec<PathBuf>, path: PathBuf) {
    if !candidates.contains(&path) {
        candidates.push(path);
    }
}

fn push_binary_dir_candidates(candidates: &mut Vec<PathBuf>, dir: PathBuf, binary: &str) {
    for name in engine_binary_names(binary) {
        push_unique_candidate(candidates, dir.join(name));
    }
}

fn candidate_engine_binary_paths(
    binary: &str,
    explicit_binary_path: Option<PathBuf>,
    engine_dir: Option<PathBuf>,
    current_exe: Option<PathBuf>,
) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(path) = explicit_binary_path {
        push_unique_candidate(&mut candidates, path);
    }
    if let Some(dir) = engine_dir {
        push_binary_dir_candidates(&mut candidates, dir, binary);
    }
    if let Some(exe_path) = current_exe {
        if let Some(exe_dir) = exe_path.parent() {
            push_binary_dir_candidates(&mut candidates, exe_dir.to_path_buf(), binary);
            push_binary_dir_candidates(&mut candidates, exe_dir.join("engines"), binary);
            push_binary_dir_candidates(&mut candidates, exe_dir.join("bin"), binary);
            if let Some(contents_dir) = exe_dir.parent() {
                push_binary_dir_candidates(&mut candidates, contents_dir.join("Resources").join("engines"), binary);
                push_binary_dir_candidates(&mut candidates, contents_dir.join("Resources").join("bin"), binary);
                push_binary_dir_candidates(&mut candidates, contents_dir.join("Resources"), binary);
            }
        }
    }
    candidates
}

fn resolve_engine_binary_path(binary: &str) -> Option<PathBuf> {
    let explicit = std::env::var_os(engine_specific_env_var(binary)).map(PathBuf::from);
    let engine_dir = std::env::var_os("RAILWISE_ENGINE_DIR").map(PathBuf::from);
    let current_exe = std::env::current_exe().ok();
    for candidate in candidate_engine_binary_paths(binary, explicit, engine_dir, current_exe) {
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    which::which(binary).ok()
}

#[tauri::command]
fn list_engineering_engines() -> Vec<EngineeringEngineStatus> {
    ENGINEERING_ENGINE_SPECS
        .iter()
        .map(|spec| {
            let binaries: Vec<EngineeringEngineBinaryStatus> = spec
                .binaries
                .iter()
                .map(|binary| {
                    let path = resolve_engine_binary_path(binary);
                    EngineeringEngineBinaryStatus {
                        name: (*binary).to_string(),
                        available: path.is_some(),
                        path: path.as_ref().map(|value| value.to_string_lossy().into_owned()),
                        version: path.as_deref().and_then(command_version_at_path),
                    }
                })
                .collect();
            EngineeringEngineStatus {
                id: spec.id,
                label: spec.label,
                available: binaries.iter().all(|binary| binary.available),
                binaries,
                install_hint: spec.install_hint,
            }
        })
        .collect()
}

fn validate_engine_request(request: &EngineeringEngineCommandRequest) -> Result<(), String> {
    if !ENGINEERING_ALLOWED_ENGINE_BINARIES.contains(&request.binary.as_str()) {
        return Err(format!("engine binary not allowed: {}", request.binary));
    }
    if request.args.len() > 64 {
        return Err("too many engine arguments".to_string());
    }
    for arg in &request.args {
        if arg.len() > 4096 || arg.contains('\0') {
            return Err("invalid engine argument".to_string());
        }
    }
    if request.stdin.as_deref().unwrap_or_default().len() > 1_000_000 {
        return Err("engine stdin is too large".to_string());
    }
    Ok(())
}

#[tauri::command]
fn run_engineering_engine_command(
    request: EngineeringEngineCommandRequest,
) -> Result<EngineeringEngineCommandResult, String> {
    validate_engine_request(&request)?;
    let binary_path = resolve_engine_binary_path(&request.binary)
        .ok_or_else(|| format!("engine binary not found: {}", request.binary))?;
    let mut command = Command::new(&binary_path);
    command.args(&request.args);
    if let Some(stdin) = request.stdin {
        use std::io::Write;
        use std::process::Stdio;
        command.stdin(Stdio::piped());
        let mut child = command
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("spawn failed: {e}"))?;
        if let Some(mut child_stdin) = child.stdin.take() {
            child_stdin
                .write_all(stdin.as_bytes())
                .map_err(|e| format!("write stdin failed: {e}"))?;
        }
        let output = child
            .wait_with_output()
            .map_err(|e| format!("engine command failed: {e}"))?;
        return Ok(EngineeringEngineCommandResult {
            binary: request.binary,
            args: request.args,
            success: output.status.success(),
            exit_code: output.status.code(),
            stdout: bounded_text(&output.stdout),
            stderr: bounded_text(&output.stderr),
        });
    }
    let output = command
        .output()
        .map_err(|e| format!("engine command failed: {e}"))?;
    Ok(EngineeringEngineCommandResult {
        binary: request.binary,
        args: request.args,
        success: output.status.success(),
        exit_code: output.status.code(),
        stdout: bounded_text(&output.stdout),
        stderr: bounded_text(&output.stderr),
    })
}

fn sanitize_image_extension(raw: Option<&str>) -> String {
    let cleaned = raw
        .map(|s| s.trim().trim_start_matches('.').to_ascii_lowercase())
        .unwrap_or_default();
    let ok = !cleaned.is_empty()
        && cleaned.len() <= 8
        && cleaned.chars().all(|c| c.is_ascii_alphanumeric());
    if ok {
        cleaned
    } else {
        "png".to_string()
    }
}

#[tauri::command]
fn save_clipboard_image(bytes: Vec<u8>, extension: Option<String>) -> Result<String, String> {
    let ext = sanitize_image_extension(extension.as_deref());
    let dir = pasted_images_dir();
    std::fs::create_dir_all(&dir).map_err(|e| format!("mkdir failed: {e}"))?;
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| format!("clock error: {e}"))?
        .as_millis();
    let path = dir.join(format!("reasonix-pasted-{ts}.{ext}"));
    std::fs::write(&path, bytes).map_err(|e| format!("write failed: {e}"))?;
    Ok(path.to_string_lossy().into_owned())
}

fn purge_old_pasted_images(max_age: Duration) {
    let dir = pasted_images_dir();
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return;
    };
    let cutoff = SystemTime::now().checked_sub(max_age);
    for entry in entries.flatten() {
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        if !metadata.is_file() {
            continue;
        }
        let Ok(modified) = metadata.modified() else {
            continue;
        };
        if cutoff.is_some_and(|t| modified < t) {
            let _ = std::fs::remove_file(entry.path());
        }
    }
}

#[tauri::command]
#[cfg(target_os = "macos")]
fn toggle_macos_native_fullscreen(window: tauri::WebviewWindow) -> Result<(), String> {
    use objc2_app_kit::{NSWindow, NSWindowCollectionBehavior};

    let ns_window = window.ns_window().map_err(|e| e.to_string())?;
    if ns_window.is_null() {
        return Err("macOS NSWindow handle is null".to_string());
    }

    unsafe {
        let ns_window: &NSWindow = &*ns_window.cast::<NSWindow>();
        let behavior = ns_window.collectionBehavior();
        ns_window.setCollectionBehavior(behavior | NSWindowCollectionBehavior::FullScreenPrimary);
        ns_window.toggleFullScreen(None);
    }
    Ok(())
}

#[tauri::command]
#[cfg(not(target_os = "macos"))]
fn toggle_macos_native_fullscreen(window: tauri::WebviewWindow) -> Result<(), String> {
    let fullscreen = window.is_fullscreen().map_err(|e| e.to_string())?;
    window
        .set_fullscreen(!fullscreen)
        .map_err(|e| e.to_string())
}

fn main() {
    #[cfg(target_os = "linux")]
    linux_webkit_compat();

    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if desktop_close_behavior() == DesktopCloseBehavior::CloseToTray {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .manage(RpcState::default())
        .invoke_handler(tauri::generate_handler![
            rpc_spawn,
            rpc_send,
            rpc_kill,
            import_cc_switch_mcp,
            open_in_editor,
            list_workspace_tree,
            git_status,
            write_text_file,
            write_binary_file,
            read_binary_file,
            save_engineering_workbench_draft,
            load_engineering_workbench_draft,
            read_engineering_import_file,
            generate_indoor_adjustment_ai_report,
            run_survey_adjustment,
            list_engineering_engines,
            run_engineering_engine_command,
            save_clipboard_image,
            toggle_macos_native_fullscreen
        ])
        .setup(|app| {
            std::thread::spawn(|| purge_old_pasted_images(Duration::from_secs(24 * 60 * 60)));
            install_tray(app)?;
            if let Some(w) = app.get_webview_window("main") {
                // HiDPI fit: the JSON config asks for 1024x720 logical px.
                // On Windows laptops at 200% scale (1920x1080 → 960x540
                // effective logical px) that overflows the screen and the
                // window opens partially off-canvas. Clamp to 90% of the
                // monitor's available logical size whenever the configured
                // size doesn't fit, then recenter.
                if let Ok(Some(monitor)) = w.current_monitor() {
                    let scale = monitor.scale_factor();
                    let phys = monitor.size();
                    let avail_w = phys.width as f64 / scale;
                    let avail_h = phys.height as f64 / scale;
                    let want_w = 1024_f64.min(avail_w * 0.9);
                    let want_h = 720_f64.min(avail_h * 0.9);
                    if want_w < 1024.0 || want_h < 720.0 {
                        let _ = w.set_size(tauri::Size::Logical(tauri::LogicalSize {
                            width: want_w,
                            height: want_h,
                        }));
                        let _ = w.center();
                    }
                }
                if std::env::var("REASONIX_DEVTOOLS").is_ok() {
                    #[cfg(debug_assertions)]
                    w.open_devtools();
                }
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("tauri build failed")
        .run(|app, event| match event {
            // Tauri 2 normally exits the process via Exit; managed-state drops
            // don't always run. ExitRequested fires before that, so we kill the
            // Node child here too — belt-and-braces vs the Drop on RpcHandle.
            tauri::RunEvent::ExitRequested { .. } => {
                let state = app.state::<RpcState>();
                let _ = rpc::rpc_kill(state);
            }
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Reopen {
                has_visible_windows: false,
                ..
            } => show_main_window(app),
            _ => {}
        });
}

#[cfg(test)]
mod tests {
    use super::{
        candidate_engine_binary_paths, engine_specific_env_var, parse_desktop_close_behavior,
        infer_engineering_file_format, normalize_survey_adjustment_tool, read_binary_file,
        run_engineering_engine_command, sanitize_image_extension,
        survey_adjustment_runner_candidates, write_binary_file,
        DesktopCloseBehavior,
        EngineeringEngineCommandRequest,
    };
    use serde_json::json;
    use std::path::{Path, PathBuf};
    use std::sync::{Mutex, OnceLock};
    use std::time::{SystemTime, UNIX_EPOCH};

    static ENGINE_ENV_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

    fn unique_temp_dir(name: &str) -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        std::env::temp_dir().join(format!("{name}-{}-{stamp}", std::process::id()))
    }

    #[cfg(unix)]
    fn write_mock_engine(path: &Path) {
        use std::os::unix::fs::PermissionsExt;
        std::fs::write(
            path,
            "#!/bin/sh\nprintf 'args:%s\\n' \"$*\"\nprintf 'stdin:'\ncat\n",
        )
        .expect("write mock engine");
        let mut permissions = std::fs::metadata(path).expect("metadata").permissions();
        permissions.set_mode(0o755);
        std::fs::set_permissions(path, permissions).expect("chmod mock engine");
    }

    #[cfg(windows)]
    fn write_mock_engine(path: &Path) {
        std::fs::write(path, "@echo off\necho args:%*\n<nul set /p dummy=stdin:\nmore\n")
            .expect("write mock engine");
    }

    #[test]
    fn accepts_alphanumeric_extensions() {
        assert_eq!(sanitize_image_extension(Some("png")), "png");
        assert_eq!(sanitize_image_extension(Some("JPG")), "jpg");
        assert_eq!(sanitize_image_extension(Some(".webp")), "webp");
        assert_eq!(sanitize_image_extension(Some("svg")), "svg");
    }

    #[test]
    fn falls_back_when_missing_or_invalid() {
        assert_eq!(sanitize_image_extension(None), "png");
        assert_eq!(sanitize_image_extension(Some("")), "png");
        assert_eq!(sanitize_image_extension(Some("   ")), "png");
    }

    #[test]
    fn rejects_path_separators_and_traversal() {
        assert_eq!(sanitize_image_extension(Some("png/../../foo")), "png");
        assert_eq!(sanitize_image_extension(Some("png\\foo")), "png");
        assert_eq!(sanitize_image_extension(Some("../bin")), "png");
        assert_eq!(sanitize_image_extension(Some("p.n.g")), "png");
    }

    #[test]
    fn rejects_overlong_extensions() {
        assert_eq!(sanitize_image_extension(Some("verylongext")), "png");
    }

    #[test]
    fn desktop_close_behavior_defaults_to_quit() {
        assert_eq!(
            parse_desktop_close_behavior(&json!({})),
            DesktopCloseBehavior::CloseToQuit
        );
    }

    #[test]
    fn desktop_close_behavior_accepts_tray_mode() {
        assert_eq!(
            parse_desktop_close_behavior(&json!({ "desktopCloseBehavior": "closeToTray" })),
            DesktopCloseBehavior::CloseToTray
        );
    }

    #[test]
    fn desktop_close_behavior_accepts_quit_mode() {
        assert_eq!(
            parse_desktop_close_behavior(&json!({ "desktopCloseBehavior": "closeToQuit" })),
            DesktopCloseBehavior::CloseToQuit
        );
    }

    #[test]
    fn writes_binary_files_without_text_encoding_changes() {
        let temp_dir = unique_temp_dir("railwise-binary-export");
        std::fs::create_dir_all(&temp_dir).expect("create temp dir");
        let output = temp_dir.join("audit.pdf");
        let bytes = vec![0x25, 0x50, 0x44, 0x46, 0x00, 0xff, 0x0a];

        write_binary_file(output.to_string_lossy().into_owned(), bytes.clone()).expect("write binary file");

        assert_eq!(std::fs::read(&output).expect("read binary file"), bytes);
        let _ = std::fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn reads_binary_files_without_text_encoding_changes() {
        let temp_dir = unique_temp_dir("railwise-binary-import");
        std::fs::create_dir_all(&temp_dir).expect("create temp dir");
        let input = temp_dir.join("archive.zip");
        let bytes = vec![0x50, 0x4b, 0x03, 0x04, 0x00, 0xff, 0x0d, 0x0a];
        std::fs::write(&input, &bytes).expect("write binary fixture");

        assert_eq!(
            read_binary_file(input.to_string_lossy().into_owned()).expect("read binary file"),
            bytes,
        );
        let _ = std::fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn engineering_file_format_detects_field_book_extensions_and_gsi_content() {
        assert_eq!(infer_engineering_file_format(Path::new("traverse.dat"), None), "dat");
        assert_eq!(infer_engineering_file_format(Path::new("level.gsi"), None), "gsi");
        assert_eq!(infer_engineering_file_format(Path::new("cp3.TPT"), None), "tpt");
        assert_eq!(infer_engineering_file_format(Path::new("cp3.SUC"), None), "suc");
        assert_eq!(infer_engineering_file_format(Path::new("adjust.in2"), None), "in2");
        assert_eq!(infer_engineering_file_format(Path::new("adjust.pce"), None), "pce");
        assert_eq!(infer_engineering_file_format(Path::new("adjust.svy"), None), "svy");
        assert_eq!(infer_engineering_file_format(Path::new("adjust.ho"), None), "ho");
        assert_eq!(infer_engineering_file_format(Path::new("adjust.ou1"), None), "ou1");
        assert_eq!(
            infer_engineering_file_format(
                Path::new("clipboard.txt"),
                Some("*110001+0000BM1 830000+00100000\n")
            ),
            "gsi"
        );
        assert_eq!(
            infer_engineering_file_format(
                Path::new("clipboard.txt"),
                Some("# marker=TSINGHUA_SHANWEI_TEXT_EXCHANGE\n[RAILWISE_LEVEL_ADJUSTMENT]\n")
            ),
            "svy"
        );
        assert_eq!(
            infer_engineering_file_format(Path::new("clipboard.txt"), Some("[RAILWISE_OU1_RESULTS]\n")),
            "ou1"
        );
    }

    #[test]
    fn survey_adjustment_tool_names_are_limited_to_prd_adjustment_tools() {
        assert_eq!(normalize_survey_adjustment_tool("level_adjust"), Some("level_adjust"));
        assert_eq!(
            normalize_survey_adjustment_tool("survey_traverse_adjust"),
            Some("traverse_adjust")
        );
        assert_eq!(normalize_survey_adjustment_tool("calculator_alert_level"), None);
        assert_eq!(normalize_survey_adjustment_tool("../level_adjust"), None);
    }

    #[test]
    fn survey_adjustment_runner_candidates_include_bundled_resource_and_dev_paths() {
        let candidates = survey_adjustment_runner_candidates(
            Some(PathBuf::from("/Applications/Railwise.app/Contents/Resources")),
            PathBuf::from("/Users/dev/Railwise-desktop/desktop/src-tauri"),
        );

        assert_eq!(
            candidates[0],
            PathBuf::from("/Applications/Railwise.app/Contents/Resources/railwise/survey-mcp/dist/adjust-runner.js")
        );
        assert!(candidates.contains(&PathBuf::from(
            "/Users/dev/Railwise-desktop/desktop/src-tauri/../../railwise/survey-mcp/dist/adjust-runner.js"
        )));
    }

    #[test]
    fn engine_specific_env_vars_are_stable_and_path_safe() {
        assert_eq!(engine_specific_env_var("projinfo"), "RAILWISE_ENGINE_PROJINFO");
        assert_eq!(engine_specific_env_var("ogr2ogr"), "RAILWISE_ENGINE_OGR2OGR");
        assert_eq!(engine_specific_env_var("pdal"), "RAILWISE_ENGINE_PDAL");
    }

    #[test]
    fn engine_binary_candidates_prioritize_env_dir_resources_and_sidecars() {
        let candidates = candidate_engine_binary_paths(
            "ogr2ogr",
            Some(PathBuf::from("/opt/railwise/custom/ogr2ogr")),
            Some(PathBuf::from("/opt/railwise/engines")),
            Some(PathBuf::from("/Applications/Railwise.app/Contents/MacOS/Railwise")),
        );

        assert_eq!(candidates[0], PathBuf::from("/opt/railwise/custom/ogr2ogr"));
        assert_eq!(candidates[1], PathBuf::from("/opt/railwise/engines/ogr2ogr"));
        assert_eq!(
            candidates[2],
            PathBuf::from("/Applications/Railwise.app/Contents/MacOS/ogr2ogr")
        );
        assert!(candidates.contains(&PathBuf::from(
            "/Applications/Railwise.app/Contents/Resources/engines/ogr2ogr"
        )));
        assert!(candidates.contains(&PathBuf::from(
            "/Applications/Railwise.app/Contents/Resources/bin/ogr2ogr"
        )));
    }

    #[test]
    fn engine_command_executes_explicit_sidecar_and_writes_stdin() {
        let _guard = ENGINE_ENV_LOCK
            .get_or_init(|| Mutex::new(()))
            .lock()
            .expect("env lock");
        let temp_dir = unique_temp_dir("railwise-engine-smoke");
        std::fs::create_dir_all(&temp_dir).expect("create temp dir");
        let engine_path = temp_dir.join(if cfg!(windows) { "cct.cmd" } else { "cct" });
        write_mock_engine(&engine_path);

        let previous = std::env::var_os("RAILWISE_ENGINE_CCT");
        std::env::set_var("RAILWISE_ENGINE_CCT", &engine_path);
        let result = run_engineering_engine_command(EngineeringEngineCommandRequest {
            binary: "cct".to_string(),
            args: vec!["+proj=noop".to_string()],
            stdin: Some("12 55 0 0 P1\n".to_string()),
        });
        if let Some(value) = previous {
            std::env::set_var("RAILWISE_ENGINE_CCT", value);
        } else {
            std::env::remove_var("RAILWISE_ENGINE_CCT");
        }
        let _ = std::fs::remove_dir_all(temp_dir);

        let output = result.expect("run mock sidecar");
        assert!(output.success);
        assert_eq!(output.binary, "cct");
        assert_eq!(output.args, vec!["+proj=noop".to_string()]);
        assert!(output.stdout.contains("args:+proj=noop"));
        assert!(output.stdout.contains("stdin:12 55 0 0 P1"));
    }
}
