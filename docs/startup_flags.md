# chatgo.exe Startup Flags

This document describes the command-line flags available when running `chatgo.exe`.

## Available Flags

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `-port` | string | `"8080"` | Web UI port (setup + chat) |
| `-host` | string | `"0.0.0.0"` | Web UI bind address. `0.0.0.0` exposes the UI to other devices on the network; `127.0.0.1` restricts it to this machine |
| `-version` | bool | `false` | Print the installed version and the latest published release, then exit |

> The web UI is always started — this is a local app and all setup is browser-based (`/setup`), so there is no flag to disable it.

## Usage Examples

```bash
# Run with default settings (web UI on port 8080, accessible on all interfaces)
chatgo.exe

# Run web UI on a custom port
chatgo.exe -port 9090

# Run web UI only on localhost (not accessible from network)
chatgo.exe -host 127.0.0.1

# Check version information
chatgo.exe -version
```

## Notes

- The `-version` flag causes the program to exit immediately after performing its action; it does not start the web UI or Telegram bots.
- Configuration is loaded from `config.yaml` or environment variables. See [Configuration](configuration.md) for details.
- Linux background launchers (`-bkgnd.sh`) and bubblewrap sandbox launchers (`-sandbox.sh`) are shipped beside each Linux build in `executables/`. Use `--bkgnd` on a sandbox launcher to start it detached. Windows Sandbox configs are shipped as architecture-specific downloads. The binary does not generate these helper files.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PORT` | Overrides the web UI port (used if `-port` is not explicitly set or is the default `8080`) |

---
*Generated from `main.go` flag definitions.*