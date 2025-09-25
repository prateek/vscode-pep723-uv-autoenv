import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { spawn } from 'child_process';
import { computeEnvHash, parsePep723HeaderFromText } from '../../pep723';

const isWindows = process.platform === 'win32';

function getEnvPython(envDir: string): string {
  return path.join(envDir, isWindows ? 'Scripts/python.exe' : 'bin/python');
}

async function pathExists(p: string) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function haveUv(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn('uv', ['--version'], { shell: isWindows });
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve((code ?? 1) === 0));
  });
}

describe('Integration: PEP723 uv env sync', () => {
  it('creates env and imports requests', async function () {
    this.timeout(600_000);

    if (!(await haveUv())) {
      this.skip();
    }

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    assert.ok(workspaceRoot, 'Workspace root is set');

    const filePath = path.join(workspaceRoot!, 'ok_pep723.py');
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
    await vscode.window.showTextDocument(doc);

    const header = parsePep723HeaderFromText(doc.getText());
    assert.ok(header, 'Header parsed');

    const hash = computeEnvHash(header!.dependencies, header!.requiresPython);
    const envDir = path.join(workspaceRoot!, `.uvenv-${hash}`);
    const envPython = getEnvPython(envDir);

    // Wait for env python to appear
    const deadline = Date.now() + 10 * 60 * 1000; // 10 minutes
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (await pathExists(envPython)) break;
      if (Date.now() > deadline) {
        assert.fail(`Timed out waiting for ${envPython}`);
      }
      await new Promise((r) => setTimeout(r, 2000));
    }

    // Verify import works
    await new Promise<void>((resolve, reject) => {
      const child = spawn(envPython, ['-c', 'import requests'], { shell: false });
      let stderr = '';
      child.stderr.on('data', (d) => (stderr += d.toString()));
      child.on('close', (code) => {
        if ((code ?? 1) === 0) resolve();
        else reject(new Error(stderr || 'import failed'));
      });
      child.on('error', reject);
    });
  });
});
