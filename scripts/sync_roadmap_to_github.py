#!/usr/bin/env python3
"""
Syncs milestones and tasks from docs/PROJECT_ROADMAP.md to GitHub Issues using the GitHub CLI (gh).
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROADMAP_PATH = Path(__file__).resolve().parent.parent / "docs" / "PROJECT_ROADMAP.md"

def run_cmd(args):
    res = subprocess.run(args, capture_output=True, text=True)
    return res.returncode, res.stdout.strip(), res.stderr.strip()

def check_gh_auth():
    code, out, err = run_cmd(["gh", "auth", "status"])
    if code != 0:
        print("❌ GitHub CLI is not authenticated.")
        print("👉 Please run: gh auth login")
        return False
    return True

def get_existing_issues():
    code, out, err = run_cmd(["gh", "issue", "list", "--limit", "200", "--state", "all", "--json", "title,number,state"])
    if code != 0:
        return []
    try:
        return json.loads(out)
    except Exception:
        return []

def get_existing_milestones():
    code, out, err = run_cmd(["gh", "api", "repos/:owner/:repo/milestones", "--jq", ".[].title"])
    if code != 0:
        return set()
    return set(out.splitlines()) if out else set()

def create_milestone(title):
    print(f"Creating milestone: {title}...")
    run_cmd(["gh", "api", "repos/:owner/:repo/milestones", "-f", f"title={title}"])

def determine_labels(task_id):
    labels = []
    if task_id.startswith("SEC"):
        labels.append("security")
    elif task_id.startswith("FEAT"):
        labels.append("enhancement")
    elif task_id.startswith("BUG"):
        labels.append("bug")
    elif task_id.startswith("PERF"):
        labels.append("performance")
    elif task_id.startswith("ARCH"):
        labels.append("architecture")
    elif task_id.startswith("TEST"):
        labels.append("testing")
    return labels

def sync():
    if not check_gh_auth():
        sys.exit(1)

    if not ROADMAP_PATH.exists():
        print(f"Error: {ROADMAP_PATH} not found.")
        sys.exit(1)

    content = ROADMAP_PATH.read_text(encoding="utf-8")
    existing_issues = {issue["title"]: issue for issue in get_existing_issues()}
    existing_milestones = get_existing_milestones()

    # Parse milestones and tasks
    milestone_blocks = re.findall(
        r"### \*\*([^\*]+)\*\* \((ACTIVE 🔄|COMPLETED ✅|PLANNED 📋)\)([\s\S]*?)(?=(?:### \*\*|## 🧪|$))",
        content
    )

    print(f"Found {len(milestone_blocks)} milestone sections in roadmap.")

    for m_title, m_status, m_body in milestone_blocks:
        m_title_clean = m_title.strip()
        
        # Create milestone on GitHub if it doesn't exist
        if m_title_clean not in existing_milestones:
            create_milestone(m_title_clean)
            existing_milestones.add(m_title_clean)

        # Parse tasks in this milestone
        task_matches = re.finditer(
            r"- \[(x| )\] \*\*([A-Z]+-\d+:[^\*]+)\*\* \(([^)]+)\)\n\s+- ([^\n]+)",
            m_body
        )

        for match in task_matches:
            is_done = match.group(1) == "x"
            task_full_title = f"{match.group(2).strip()}"
            services = match.group(3).strip()
            description = match.group(4).strip()
            task_id = match.group(2).split(':')[0].strip()

            body = f"### Task Description\n{description}\n\n**Affected Microservices**: `{services}`\n**Target Milestone**: {m_title_clean}"
            labels = determine_labels(task_id)

            if task_full_title in existing_issues:
                issue = existing_issues[task_full_title]
                print(f"Issue already exists: #{issue['number']} {task_full_title}")
                if is_done and issue["state"] != "CLOSED":
                    print(f"Closing completed issue #{issue['number']}...")
                    run_cmd(["gh", "issue", "close", str(issue["number"])])
            else:
                print(f"Creating issue: {task_full_title}...")
                cmd = ["gh", "issue", "create", "--title", task_full_title, "--body", body, "--milestone", m_title_clean]
                for lbl in labels:
                    cmd.extend(["--label", lbl])
                code, out, err = run_cmd(cmd)
                if code == 0:
                    print(f"  -> Created: {out}")
                    if is_done:
                        issue_num = out.split("/")[-1]
                        run_cmd(["gh", "issue", "close", issue_num])
                else:
                    print(f"  -> Error: {err}")

    print("\n✅ Sync complete!")

if __name__ == "__main__":
    sync()
