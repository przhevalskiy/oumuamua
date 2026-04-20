"""
Swarm activities — file I/O, shell execution, and git operations.
All activities are deterministic wrappers; LLM calls live in planner activities.
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import subprocess
from pathlib import Path

import structlog
from temporalio import activity

logger = structlog.get_logger(__name__)

# ── Helpers ──────────────────────────────────────────────────────────────────

def _run(cmd: str, cwd: str | None = None, timeout: int = 120) -> dict:
    """Run a shell command and return {stdout, stderr, returncode}."""
    try:
        result = subprocess.run(
            cmd,
            shell=True,
            capture_output=True,
            text=True,
            cwd=cwd or ".",
            timeout=timeout,
        )
        return {
            "stdout": result.stdout,
            "stderr": result.stderr,
            "returncode": result.returncode,
        }
    except subprocess.TimeoutExpired:
        return {"stdout": "", "stderr": f"Command timed out after {timeout}s", "returncode": -1}
    except Exception as e:
        return {"stdout": "", "stderr": str(e), "returncode": -1}


# ── File activities ───────────────────────────────────────────────────────────

@activity.defn(name="swarm_list_directory")
async def swarm_list_directory(path: str, max_depth: int = 2) -> str:
    """Return a tree-style directory listing."""
    base = Path(path)
    if not base.exists():
        return f"Error: path '{path}' does not exist."

    lines: list[str] = []

    def _walk(p: Path, depth: int, prefix: str = "") -> None:
        if depth > max_depth:
            return
        try:
            entries = sorted(p.iterdir(), key=lambda e: (e.is_file(), e.name))
        except PermissionError:
            return
        for i, entry in enumerate(entries):
            connector = "└── " if i == len(entries) - 1 else "├── "
            lines.append(f"{prefix}{connector}{entry.name}{'/' if entry.is_dir() else ''}")
            if entry.is_dir() and not entry.name.startswith("."):
                extension = "    " if i == len(entries) - 1 else "│   "
                _walk(entry, depth + 1, prefix + extension)

    lines.append(str(base))
    _walk(base, 1)
    return "\n".join(lines)


@activity.defn(name="swarm_read_file")
async def swarm_read_file(path: str) -> str:
    """Read a file and return its contents."""
    try:
        content = Path(path).read_text(encoding="utf-8", errors="replace")
        if len(content) <= 8000:
            return content
        return (
            content[:8000]
            + f"\n\n[TRUNCATED: showing first 8000 of {len(content)} characters. "
              "Request a narrower file section if more context is needed.]"
        )
    except FileNotFoundError:
        return f"Error: file '{path}' not found."
    except Exception as e:
        return f"Error reading '{path}': {e}"


@activity.defn(name="swarm_write_file")
async def swarm_write_file(path: str, content: str) -> str:
    """Write (create or overwrite) a file."""
    try:
        p = Path(path)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content, encoding="utf-8")
        return f"Written: {path} ({len(content)} chars)"
    except Exception as e:
        return f"Error writing '{path}': {e}"


@activity.defn(name="swarm_patch_file")
async def swarm_patch_file(path: str, old_str: str, new_str: str) -> str:
    """Apply a targeted string replacement to a file."""
    try:
        p = Path(path)
        original = p.read_text(encoding="utf-8")
        if old_str not in original:
            return f"Error: old_str not found in '{path}'. No changes made."
        patched = original.replace(old_str, new_str, 1)
        p.write_text(patched, encoding="utf-8")
        return f"Patched: {path}"
    except FileNotFoundError:
        return f"Error: file '{path}' not found."
    except Exception as e:
        return f"Error patching '{path}': {e}"


@activity.defn(name="swarm_delete_file")
async def swarm_delete_file(path: str) -> str:
    """Delete a file."""
    try:
        Path(path).unlink()
        return f"Deleted: {path}"
    except FileNotFoundError:
        return f"Error: file '{path}' not found."
    except Exception as e:
        return f"Error deleting '{path}': {e}"


# ── Shell activity ────────────────────────────────────────────────────────────

# Commands the Builder must never run — installs and builds block for minutes
# and are not the Builder's responsibility.
_BLOCKED_COMMAND_PATTERNS = [
    r"\bnpm\s+(install|ci|build|run\s+build)\b",
    r"\byarn\s+(install|build|run\s+build)\b",
    r"\bpnpm\s+(install|build)\b",
    r"\bpip\s+install\b",
    r"\buv\s+(sync|install)\b",
    r"\bvite\s+build\b",
    r"\btsc\b",
    r"\bnext\s+build\b",
    r"\bwebpack\b",
]
_BLOCKED_RE = re.compile("|".join(_BLOCKED_COMMAND_PATTERNS), re.IGNORECASE)


@activity.defn(name="swarm_run_command")
async def swarm_run_command(command: str, cwd: str | None = None, timeout: int = 120) -> str:
    """Run a shell command and return combined output."""
    # Hard-block install/build commands — these are not the Builder's job
    if _BLOCKED_RE.search(command):
        return (
            f"BLOCKED: '{command}' is not allowed in the Builder. "
            "Do not run package installs or build commands. "
            "Write source files only and call finish_build."
        )
    result = _run(command, cwd=cwd, timeout=timeout)
    output = result["stdout"]
    if result["stderr"]:
        output += f"\n[stderr]\n{result['stderr']}"
    if result["returncode"] != 0:
        output += f"\n[exit code: {result['returncode']}]"
    return output.strip() or "(no output)"


# ── Security scan activities ──────────────────────────────────────────────────

_SECRET_PATTERNS = [
    (r"(?i)(api[_-]?key|apikey)\s*[:=]\s*['\"]?([A-Za-z0-9_\-]{20,})", "API Key"),
    (r"(?i)(secret[_-]?key|secret)\s*[:=]\s*['\"]?([A-Za-z0-9_\-]{20,})", "Secret Key"),
    (r"(?i)(password|passwd|pwd)\s*[:=]\s*['\"]?([^\s'\"]{8,})", "Password"),
    (r"(?i)(token)\s*[:=]\s*['\"]?([A-Za-z0-9_\-\.]{20,})", "Token"),
    (r"AKIA[0-9A-Z]{16}", "AWS Access Key"),
    (r"(?i)-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY-----", "Private Key"),
]

_SKIP_DIRS = {".git", ".venv", "node_modules", "__pycache__", ".pytest_cache"}
_SKIP_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".ico", ".woff", ".ttf", ".lock"}


@activity.defn(name="swarm_scan_secrets")
async def swarm_scan_secrets(path: str = ".") -> str:
    """Scan for accidentally committed secrets using regex patterns."""
    findings: list[str] = []
    base = Path(path)

    for file_path in base.rglob("*"):
        if not file_path.is_file():
            continue
        if any(part in _SKIP_DIRS for part in file_path.parts):
            continue
        if file_path.suffix.lower() in _SKIP_EXTS:
            continue
        # Skip .env files (expected to have secrets, but flag them)
        if file_path.name in (".env", ".env.local", ".env.production"):
            findings.append(f"WARNING: {file_path} — .env file present (ensure it's in .gitignore)")
            continue
        try:
            text = file_path.read_text(encoding="utf-8", errors="ignore")
            for pattern, label in _SECRET_PATTERNS:
                for match in re.finditer(pattern, text):
                    line_no = text[: match.start()].count("\n") + 1
                    findings.append(f"CRITICAL: {file_path}:{line_no} — {label} detected")
        except Exception:
            continue

    if not findings:
        return "No secrets detected."
    return "\n".join(findings)


# ── Git activities ────────────────────────────────────────────────────────────

@activity.defn(name="swarm_git_status")
async def swarm_git_status(cwd: str | None = None) -> str:
    return _run("git status --short", cwd=cwd)["stdout"] or "Working tree clean."


@activity.defn(name="swarm_git_create_branch")
async def swarm_git_create_branch(branch_name: str, cwd: str | None = None) -> str:
    result = _run(f"git checkout -b {branch_name}", cwd=cwd)
    if result["returncode"] != 0:
        return f"Error: {result['stderr']}"
    return f"Created and checked out branch: {branch_name}"


@activity.defn(name="swarm_git_add")
async def swarm_git_add(paths: list[str], cwd: str | None = None) -> str:
    joined = " ".join(f'"{p}"' for p in paths)
    result = _run(f"git add {joined}", cwd=cwd)
    if result["returncode"] != 0:
        return f"Error: {result['stderr']}"
    return f"Staged: {', '.join(paths)}"


@activity.defn(name="swarm_git_commit")
async def swarm_git_commit(message: str, cwd: str | None = None) -> str:
    result = _run(f'git commit -m "{message}"', cwd=cwd)
    if result["returncode"] != 0:
        return f"Error: {result['stderr']}"
    # Extract commit SHA from output
    sha_match = re.search(r"\[[\w/]+ ([a-f0-9]+)\]", result["stdout"])
    sha = sha_match.group(1) if sha_match else "unknown"
    return json.dumps({"sha": sha, "output": result["stdout"]})


@activity.defn(name="swarm_git_push")
async def swarm_git_push(branch_name: str, cwd: str | None = None) -> str:
    result = _run(f"git push -u origin {branch_name}", cwd=cwd)
    if result["returncode"] != 0:
        return f"Error: {result['stderr']}"
    return result["stdout"] or f"Pushed branch: {branch_name}"


@activity.defn(name="swarm_create_pull_request")
async def swarm_create_pull_request(
    title: str,
    body: str,
    head_branch: str,
    base_branch: str = "main",
    cwd: str | None = None,
) -> str:
    """Create a PR using the GitHub CLI (gh). Falls back to a URL stub if gh is unavailable."""
    result = _run(
        f'gh pr create --title "{title}" --body "{body}" --base {base_branch} --head {head_branch}',
        cwd=cwd,
    )
    if result["returncode"] != 0:
        # gh not available — return a stub
        return json.dumps({
            "pr_url": f"(gh CLI unavailable — push {head_branch} and open PR manually)",
            "error": result["stderr"],
        })
    url_match = re.search(r"https://github\.com/\S+", result["stdout"])
    pr_url = url_match.group(0) if url_match else result["stdout"].strip()
    return json.dumps({"pr_url": pr_url})
