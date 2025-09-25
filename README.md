# PEP723 UV Autoenv for VS Code

Auto-selects and prepares a project-local `uv` virtual environment from PEP-723 inline `/// script` headers in Python files.

## What it does

- Detects `# /// script` TOML headers in Python files
- Parses `dependencies` and `requires-python`
- Computes a stable hash and creates `.uvenv-<hash>`
- Installs dependencies via `uv pip install ... --python <envPython>`
- Updates `.vscode/settings.json` with `python.defaultInterpreterPath`
- Provides command: “PEP723: Sync Env”

Works on macOS, Linux, and Windows.

## Requirements

- `uv` must be available on your PATH
  - Install: `curl -LsSf https://astral.sh/uv/install.sh | sh` (macOS/Linux)
  - Windows: `powershell -c "iwr https://astral.sh/uv/install.ps1 -useb | iex"`
- VS Code Python extension (`ms-python.python`) recommended

## Usage

1. Open a workspace containing a Python file with a valid PEP-723 header, e.g.:

```python
# /// script
# requires-python = ">=3.10"
# dependencies = ["requests==2.32.3"]
# ///
import requests
print("ok")
```

2. Open the file. The extension will:
   - Create `.uvenv-<hash>`
   - Install dependencies
   - Set `python.defaultInterpreterPath` to the env’s interpreter

3. Use the Command Palette → “PEP723: Sync Env” to re-sync on demand.

On success you’ll see: `PEP723 env ready: .uvenv-<hash>`.

## Notes & decisions

- Hash is SHA-256 over JSON `{ deps: sorted(dependencies), pyReq }`, first 12 hex chars.
- TOML body is extracted by stripping leading `#` / `# ` from the header lines before parsing.
- Also accepts `requires.python` in addition to `requires-python`.
- If TOML fails to parse, the file is ignored (non-fatal).
- If `uv` is missing, a clear error is shown.
- A small stub map is included (best-effort): `requests → types-requests`, `python-dotenv → types-python-dotenv`, `pandas → pandas-stubs`.
- The extension only modifies files within the workspace (respects Workspace Trust).

## Development

- Language: TypeScript (ES2020, commonjs)
- Build: `npm run build`
- Watch: `npm run watch`
- Test: `npm test` (integration tests use `@vscode/test-electron`)

## Repository structure

- `src/` – extension source
- `examples/` – test fixtures
- `.vscode/` – workspace recommendations and search/watch excludes
- `.github/workflows/ci.yml` – CI (build + tests on Ubuntu/macOS/Windows)

## License

MIT

## Demo

A short demo GIF will showcase: open file → env created → imports resolved.
