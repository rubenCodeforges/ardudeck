# Flashing Tool Binaries

This directory contains the binaries for firmware flashing tools.

## STM32 DFU Flashing

STM32 DFU flashing is now handled natively using the `@ardudeck/stm32-dfu` package.
No external `dfu-util` binary is required - the app uses libusb bindings directly.

## Required Binaries (AVR/Legacy Boards Only)

### Windows (`win32/`)

- `avrdude.exe` - AVR/ATmega flashing tool
- `avrdude.conf` - avrdude configuration file

### macOS (`darwin/`)

- `avrdude` - AVR/ATmega flashing tool
- `avrdude.conf` - avrdude configuration file

### Linux (`linux/`)

- `avrdude` - AVR/ATmega flashing tool
- `avrdude.conf` - avrdude configuration file

## Download Sources

### avrdude

**Windows:**
Download from: https://github.com/avrdudes/avrdude/releases
Get the Windows binary and extract `avrdude.exe` and `avrdude.conf`.

**macOS:**
```bash
brew install avrdude
cp $(which avrdude) darwin/
cp /opt/homebrew/etc/avrdude.conf darwin/
```

**Linux:**
```bash
sudo apt install avrdude
cp $(which avrdude) linux/
cp /etc/avrdude.conf linux/
```

## Notes

- Make sure binaries have execute permissions on macOS/Linux
- The app will fall back to system PATH if binaries are not found here
- For development, you can install these tools system-wide and skip bundling
- STM32 flashing works without any external tools (cross-platform native USB)
