import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';
import { computeEnvHash, parsePep723HeaderFromText } from './pep723';

const isWindows = process.platform === 'win32';

const TYPE_STUB_MAP: Record<string, string> = {
  requests: 'types-requests',
  'python-dotenv': 'types-python-dotenv',
  pandas: 'pandas-stubs',
};

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function getEnvPython(envDir: string): string {
  return path.join(envDir, isWindows ? 'Scripts/python.exe' : 'bin/python');
}

function runCommand(
  command: string,
  args: string[],
  options: { cwd?: string } = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      shell: isWindows, // helps on Windows to resolve command
      env: process.env,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', (err) => reject(err));
    child.on('close', (code) => resolve({ code: code ?? 0, stdout, stderr }));
  });
}

async function ensureUvAvailable(): Promise<boolean> {
  try {
    const res = await runCommand('uv', ['--version']);
    return res.code === 0;
  } catch {
    return false;
  }
}

async function ensureVenv(envDir: string): Promise<void> {
  if (!(await pathExists(envDir))) {
    await fs.mkdir(envDir, { recursive: true });
    const { code, stderr } = await runCommand('uv', ['venv', envDir]);
    if (code !== 0) {
      throw new Error(stderr || 'uv venv failed');
    }
  }
}

async function installDependencies(
  deps: string[],
  envPython: string,
  cwd: string,
): Promise<void> {
  if (deps.length === 0) {
    return;
  }
  const { code, stderr } = await runCommand('uv', ['pip', 'install', ...deps, '--python', envPython], {
    cwd,
  });
  if (code !== 0) {
    throw new Error(stderr || 'uv pip install failed');
  }
}

async function installTypeStubsIfAny(
  deps: string[],
  envPython: string,
  cwd: string,
): Promise<void> {
  const stubs = deps
    .map((d) => d.split('=')[0].split('<')[0].split('>')[0].trim())
    .map((name) => TYPE_STUB_MAP[name])
    .filter((s): s is string => Boolean(s));
  if (stubs.length === 0) return;

  try {
    await runCommand('uv', ['pip', 'install', ...stubs, '--python', envPython], { cwd });
  } catch {
    // best-effort, ignore failures
  }
}

async function updateInterpreterPath(workspaceRoot: string, envPython: string): Promise<void> {
  const vscodeDir = path.join(workspaceRoot, '.vscode');
  const settingsPath = path.join(vscodeDir, 'settings.json');
  await fs.mkdir(vscodeDir, { recursive: true });

  let data: any = {};
  if (await pathExists(settingsPath)) {
    try {
      const raw = await fs.readFile(settingsPath, 'utf8');
      data = JSON.parse(raw);
    } catch {
      data = {};
    }
  }
  if (!data || typeof data !== 'object') {
    data = {};
  }
  data['python.defaultInterpreterPath'] = envPython;
  await fs.writeFile(settingsPath, JSON.stringify(data, null, 2), 'utf8');
}

async function syncEnvForDocument(document: vscode.TextDocument): Promise<void> {
  if (!vscode.workspace.isTrusted) {
    return;
  }
  if (document.languageId !== 'python') {
    return;
  }

  const header = parsePep723HeaderFromText(document.getText());
  if (!header) {
    return;
  }

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri)
    || vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    return;
  }
  const workspaceRoot = workspaceFolder.uri.fsPath;

  const haveUv = await ensureUvAvailable();
  if (!haveUv) {
    void vscode.window.showErrorMessage(
      '`uv` not found in PATH. Install: curl -LsSf https://astral.sh/uv/install.sh | sh',
    );
    return;
  }

  const hash = computeEnvHash(header.dependencies, header.requiresPython);
  const envDir = path.join(workspaceRoot, `.uvenv-${hash}`);
  await ensureVenv(envDir);

  const envPython = getEnvPython(envDir);
  if (!(await pathExists(envPython))) {
    // Sometimes uv may create structure after command returns; recheck by recreating venv
    await ensureVenv(envDir);
  }

  // Install dependencies (if any)
  if (Array.isArray(header.dependencies) && header.dependencies.length > 0) {
    await installDependencies(header.dependencies, envPython, workspaceRoot);
    await installTypeStubsIfAny(header.dependencies, envPython, workspaceRoot);
  }

  await updateInterpreterPath(workspaceRoot, envPython);
  void vscode.window.showInformationMessage(`PEP723 env ready: .uvenv-${hash}`);
}

export function activate(context: vscode.ExtensionContext) {
  const openHandler = vscode.workspace.onDidOpenTextDocument((doc) => {
    void syncEnvForDocument(doc);
  });
  context.subscriptions.push(openHandler);

  // If a Python document is already open on activation, try syncing
  const activeDoc = vscode.window.activeTextEditor?.document;
  if (activeDoc && activeDoc.languageId === 'python') {
    void syncEnvForDocument(activeDoc);
  }

  const syncCmd = vscode.commands.registerCommand('pep723uv.sync', async () => {
    const doc = vscode.window.activeTextEditor?.document;
    if (!doc || doc.languageId !== 'python') {
      void vscode.window.showInformationMessage('Open a Python file to sync PEP723 env.');
      return;
    }
    await syncEnvForDocument(doc);
  });
  context.subscriptions.push(syncCmd);
}

export function deactivate() {
  // no-op
}
