#!/usr/bin/env bash
set -euo pipefail

AGENT_VERSION="0.1.0"
INSTALL_DIR="/opt/ardudeck-agent"
SERVICE_USER="${SUDO_USER:-$(whoami)}"

echo "================================"
echo "ArduDeck Agent Installer v${AGENT_VERSION}"
echo "================================"

# Detect architecture
ARCH=$(uname -m)
case "$ARCH" in
  x86_64)  ARCH="x64" ;;
  aarch64) ARCH="arm64" ;;
  armv7l)  ARCH="armv7" ;;
  *)       echo "Unsupported architecture: $ARCH"; exit 1 ;;
esac

OS=$(uname -s | tr '[:upper:]' '[:lower:]')
echo "Detected: ${OS} ${ARCH}"

# Create install directory
mkdir -p "$INSTALL_DIR"

# TODO: Download pre-built binary from releases
# For now, assume node is available and copy source
echo "Installing agent to ${INSTALL_DIR}..."

# Detect init system and install service
if command -v systemctl &>/dev/null; then
  echo "Detected systemd"
  cat > /etc/systemd/system/ardudeck-agent.service <<SVCEOF
[Unit]
Description=ArduDeck Companion Agent
After=network.target

[Service]
Type=simple
User=${SERVICE_USER}
ExecStart=${INSTALL_DIR}/ardudeck-agent
Restart=always
RestartSec=5
Environment=ARDUDECK_AGENT_PORT=48400

[Install]
WantedBy=multi-user.target
SVCEOF
  systemctl daemon-reload
  systemctl enable ardudeck-agent
  systemctl start ardudeck-agent
  echo "Service installed and started (systemd)"

elif command -v rc-update &>/dev/null; then
  echo "Detected OpenRC"
  cat > /etc/init.d/ardudeck-agent <<'RCEOF'
#!/sbin/openrc-run
name="ardudeck-agent"
description="ArduDeck Companion Agent"
command="/opt/ardudeck-agent/ardudeck-agent"
command_background=true
pidfile="/run/${RC_SVCNAME}.pid"
RCEOF
  chmod +x /etc/init.d/ardudeck-agent
  rc-update add ardudeck-agent default
  rc-service ardudeck-agent start
  echo "Service installed and started (OpenRC)"

else
  echo "No systemd or OpenRC detected. Adding cron @reboot entry."
  (crontab -l 2>/dev/null | grep -v ardudeck-agent; echo "@reboot ${INSTALL_DIR}/ardudeck-agent") | crontab -
  # Start now
  nohup "${INSTALL_DIR}/ardudeck-agent" &>/dev/null &
  echo "Agent started via cron fallback"
fi

echo ""
echo "================================"
echo "Installation complete!"
echo "Agent will start automatically on boot."
echo ""
echo "To see your pairing token:"
echo "  journalctl -u ardudeck-agent | grep 'Pairing token'"
echo "================================"
