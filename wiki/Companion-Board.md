# Companion Board Support

ArduDeck includes tools for setting up and managing companion computers. The companion view is organized into three tabs: **Store**, **DroneBridge**, and **Dashboard**.

> Enable the companion view in **Settings > Experimental Features > Companion Board Support**.

## Store Tab

Browse pre-configured templates for popular companion boards. The store is the default tab and works without any connection.

### Supported Boards

| Board Family | Templates | Flash Method |
|-------------|-----------|--------------|
| ESP32 | DroneBridge WiFi, DroneBridge ESP-NOW, MAVLink Bridge | USB Flash (esptool) |
| Raspberry Pi | Telemetry Bridge, Video + Telemetry, Rpanion Server, BlueOS, Autonomous Runner, OpenHD | SD Card Image |
| NVIDIA Jetson | Computer Vision Companion | Install Script (SSH) |
| Orange Pi | (coming soon) | - |

### ESP32 Flashing

Flash ESP32 boards directly from ArduDeck via USB:

1. Select a template (e.g., DroneBridge WiFi)
2. Connect your ESP32 via USB
3. Select the serial port and click **Detect** to identify the chip
4. Click **Flash Firmware**

esptool is downloaded automatically on first use (~25 MB standalone binary from [espressif/esptool](https://github.com/espressif/esptool) releases). No Python installation required.

> **Tip:** If the flash fails to connect, hold the **BOOT** button on your ESP32 while clicking Flash.

### Raspberry Pi Setup

Pi templates provide two paths:

- **SD Card Image** - Download the pre-built image from the project's GitHub releases, then flash to MicroSD using [Raspberry Pi Imager](https://www.raspberrypi.com/software/) or [Balena Etcher](https://etcher.balena.io/)
- **Install on existing OS** - Run the provided install script on an existing Raspberry Pi OS setup

### Jetson / Linux Setup

SSH into your board and run the provided install script.

## DroneBridge Tab

Monitor and configure DroneBridge ESP32 devices on your network.

### Status Panel
- Auto-detects DroneBridge devices via network scan
- Manual IP probe for devices on different subnets
- Shows firmware version, chip model, MAC address, WiFi signal strength
- Live throughput metrics: serial RX bytes, MAVLink messages, connected clients

### Settings Panel
- **WiFi** - SSID, password, channel, mode (AP/Station), antenna selection
- **Serial** - Baud rate, protocol, GPIO pin mapping (TX/RX/RTS/CTS)
- **Network** - AP IP, static IP, gateway, netmask, UDP client settings
- **Advanced** - Packet size, timeouts, LTM config, RSSI format
- Save and reboot with automatic reconnection

## Dashboard Tab

Full companion computer management when the ArduDeck Agent is installed.

### Panels

| Panel | Description |
|-------|-------------|
| Status | Connection state, hostname, OS, uptime |
| System Metrics | Real-time CPU, RAM, temperature graphs |
| Network | Interfaces, IP addresses, routing, DNS |
| Processes | Running processes with CPU/RAM usage |
| Logs | Scrollable log viewer (colored by level) |
| Terminal | Remote shell (no SSH client needed) |
| File Browser | Remote file manager |
| Services | systemd service management |
| Containers | Docker container management |
| Extensions | Third-party extension manager |

### Layouts

The dashboard uses a dockview-based layout system:
- **Presets** - Overview, Debug, Manage
- **Custom Layouts** - Save and load your own panel arrangements
- **Add Panel** - Add any panel to the current layout
- Auto-saves layout changes

### Connecting

1. Install the ArduDeck Agent on your companion:
   ```
   curl -fsSL https://ardudeck.com/agent/install.sh | bash
   ```
2. Note the pairing token shown after installation
3. In the Dashboard tab, enter the companion's IP and token
4. Click **Connect**

The agent provides real-time metrics, terminal access, and service management over a secure WebSocket connection.
