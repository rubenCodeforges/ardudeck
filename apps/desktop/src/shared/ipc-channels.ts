/**
 * IPC Channel definitions for main<->renderer communication
 */

export const IPC_CHANNELS = {
  // Port management
  COMMS_LIST_PORTS: 'comms:list-ports',
  COMMS_SCAN_PORTS: 'comms:scan-ports',
  COMMS_CONNECT: 'comms:connect',
  COMMS_DISCONNECT: 'comms:disconnect',
  COMMS_NEW_PORT: 'comms:new-port',
  COMMS_START_PORT_WATCH: 'comms:start-port-watch',
  COMMS_STOP_PORT_WATCH: 'comms:stop-port-watch',

  // MAVLink messages
  MAVLINK_PACKET: 'mavlink:packet',
  MAVLINK_SEND: 'mavlink:send',

  // MAVLink Commands
  MAVLINK_REBOOT: 'mavlink:reboot',
  MAVLINK_ARM_DISARM: 'mavlink:arm-disarm',
  MAVLINK_SET_MODE: 'mavlink:set-mode',
  MAVLINK_COMMAND_TAKEOFF: 'mavlink:command-takeoff',
  MAVLINK_COMMAND_VTOL_TAKEOFF: 'mavlink:command-vtol-takeoff',
  MAVLINK_GOTO: 'mavlink:goto',
  MAVLINK_ORBIT: 'mavlink:orbit',
  MAVLINK_ORBIT_STOP: 'mavlink:orbit-stop',
  MAVLINK_LAND: 'mavlink:land',
  /**
   * Send MAV_CMD_USER_1..5 (commands 31010..31014) via COMMAND_INT, with
   * arbitrary float params + global coordinates. Invokes handlers registered
   * by FC-side Lua scripts (e.g. ArduDeck's orbit script).
   */
  MAVLINK_USER_COMMAND: 'mavlink:user-command',

  // Script installer (FC-side Lua scripts)
  SCRIPT_INSTALLER_GET_MANIFEST: 'script-installer:get-manifest',
  SCRIPT_INSTALLER_GET_SOURCE: 'script-installer:get-source',
  SCRIPT_INSTALLER_RUN_PREFLIGHT: 'script-installer:run-preflight',
  SCRIPT_INSTALLER_BEGIN: 'script-installer:begin',
  SCRIPT_INSTALLER_GRANT_CONSENT: 'script-installer:grant-consent',
  SCRIPT_INSTALLER_APPLY_FIX: 'script-installer:apply-fix',
  SCRIPT_INSTALLER_CANCEL: 'script-installer:cancel',
  SCRIPT_INSTALLER_GET_REGISTRY: 'script-installer:get-registry',
  SCRIPT_INSTALLER_GET_ALL_REGISTRY: 'script-installer:get-all-registry',
  SCRIPT_INSTALLER_UNINSTALL: 'script-installer:uninstall',
  /** Push channel: main → renderer install state updates */
  SCRIPT_INSTALLER_STATE: 'script-installer:state',
  /** Push channel: main → renderer script health changes */
  SCRIPT_HEALTH_CHANGED: 'script-installer:health-changed',
  /** Save the bundled Lua source to a user-chosen path (manual install fallback) */
  SCRIPT_INSTALLER_SAVE_TO_DISK: 'script-installer:save-to-disk',

  // MAVLink-FTP file browser
  /** List a directory on the FC. Returns DirectoryEntry[] or null on failure. */
  MAVLINK_FTP_LIST: 'mavlink-ftp:list',
  /** Download a file from the FC to a user-chosen save path. */
  MAVLINK_FTP_DOWNLOAD: 'mavlink-ftp:download',
  /** Pick a local file via dialog and upload it into a target FC directory. */
  MAVLINK_FTP_UPLOAD: 'mavlink-ftp:upload',
  /** Delete a file or empty directory on the FC. */
  MAVLINK_FTP_DELETE: 'mavlink-ftp:delete',
  /** Rename/move a file or directory on the FC. */
  MAVLINK_FTP_RENAME: 'mavlink-ftp:rename',

  // MAVLink Signing
  MAVLINK_SIGNING_SET_KEY: 'mavlink:signing-set-key',
  MAVLINK_SIGNING_ENABLE: 'mavlink:signing-enable',
  MAVLINK_SIGNING_DISABLE: 'mavlink:signing-disable',
  MAVLINK_SIGNING_GET_STATUS: 'mavlink:signing-get-status',
  MAVLINK_SIGNING_SEND_TO_FC: 'mavlink:signing-send-to-fc',
  MAVLINK_SIGNING_REMOVE_KEY: 'mavlink:signing-remove-key',
  MAVLINK_SIGNING_STATUS: 'mavlink:signing-status',

  // Connection state
  CONNECTION_STATE: 'connection:state',

  // Console/debug
  CONSOLE_LOG: 'console:log',

  // Telemetry
  TELEMETRY_UPDATE: 'telemetry:update',
  TELEMETRY_BATCH: 'telemetry:batch', // Batched telemetry update for performance
  TELEMETRY_SET_STREAM_RATE: 'telemetry:set-stream-rate', // Change MAVLink stream rate preset
  MSP_PACKET_COUNTS: 'msp:packet-counts', // MSP RX/TX packet counters for toolbar

  // MAVLink Status Messages (STATUSTEXT)
  MAVLINK_STATUSTEXT: 'mavlink:statustext',

  // Layout management
  LAYOUT_GET_ALL: 'layout:get-all',
  LAYOUT_GET: 'layout:get',
  LAYOUT_SAVE: 'layout:save',
  LAYOUT_DELETE: 'layout:delete',
  LAYOUT_SET_ACTIVE: 'layout:set-active',
  LAYOUT_GET_ACTIVE: 'layout:get-active',

  // Parameters
  PARAM_REQUEST_ALL: 'param:request-all',
  PARAM_SET: 'param:set',
  PARAM_SET_BATCH: 'param:set-batch',
  PARAM_SET_BATCH_PROGRESS: 'param:set-batch-progress',
  PARAM_READ_BATCH: 'param:read-batch',
  PARAM_VALUE: 'param:value',
  PARAM_BULK_LOAD: 'param:bulk-load', // FTP fast path: all params in one event
  PARAM_PROGRESS: 'param:progress',
  PARAM_COMPLETE: 'param:complete',
  PARAM_ERROR: 'param:error',
  PARAM_WRITE_FLASH: 'param:write-flash',
  PARAM_SAVE_FILE: 'param:save-file',
  PARAM_LOAD_FILE: 'param:load-file',
  PARAM_SAVE_TO_PATH: 'param:save-to-path',  // Save params to a specific file path (offline mode)
  PARAM_SAVE_AS_FILE: 'param:save-as-file',  // Save params via Save As dialog (offline mode)

  // Parameter history (version control)
  PARAM_HISTORY_SAVE: 'param:history-save',
  PARAM_HISTORY_LIST: 'param:history-list',
  PARAM_HISTORY_RESTORE: 'param:history-restore',
  PARAM_HISTORY_DELETE: 'param:history-delete',

  // Parameter metadata
  PARAM_METADATA_FETCH: 'param:metadata-fetch',
  PARAM_METADATA_RESULT: 'param:metadata-result',

  // Mission planning
  MISSION_DOWNLOAD: 'mission:download',
  MISSION_UPLOAD: 'mission:upload',
  MISSION_CLEAR: 'mission:clear',
  MISSION_SET_CURRENT: 'mission:set-current',
  MISSION_ITEM: 'mission:item',
  MISSION_PROGRESS: 'mission:progress',
  MISSION_COMPLETE: 'mission:complete',
  MISSION_UPLOAD_COMPLETE: 'mission:upload-complete',
  MISSION_CLEAR_COMPLETE: 'mission:clear-complete',
  MISSION_ERROR: 'mission:error',
  MISSION_CURRENT: 'mission:current',
  MISSION_REACHED: 'mission:reached',
  MISSION_SAVE_FILE: 'mission:save-file',
  MISSION_LOAD_FILE: 'mission:load-file',

  // Geofencing (mission_type = FENCE)
  FENCE_DOWNLOAD: 'fence:download',
  FENCE_UPLOAD: 'fence:upload',
  FENCE_CLEAR: 'fence:clear',
  FENCE_ITEM: 'fence:item',
  FENCE_PROGRESS: 'fence:progress',
  FENCE_COMPLETE: 'fence:complete',
  FENCE_UPLOAD_COMPLETE: 'fence:upload-complete',
  FENCE_CLEAR_COMPLETE: 'fence:clear-complete',
  FENCE_ERROR: 'fence:error',
  FENCE_STATUS: 'fence:status',
  FENCE_SAVE_FILE: 'fence:save-file',
  FENCE_LOAD_FILE: 'fence:load-file',

  // Rally points (mission_type = RALLY)
  RALLY_DOWNLOAD: 'rally:download',
  RALLY_UPLOAD: 'rally:upload',
  RALLY_CLEAR: 'rally:clear',
  RALLY_ITEM: 'rally:item',
  RALLY_PROGRESS: 'rally:progress',
  RALLY_COMPLETE: 'rally:complete',
  RALLY_UPLOAD_COMPLETE: 'rally:upload-complete',
  RALLY_CLEAR_COMPLETE: 'rally:clear-complete',
  RALLY_ERROR: 'rally:error',
  RALLY_SAVE_FILE: 'rally:save-file',
  RALLY_LOAD_FILE: 'rally:load-file',

  // Settings/Vehicle profiles
  SETTINGS_GET: 'settings:get',
  SETTINGS_SAVE: 'settings:save',

  // Firmware flash
  FIRMWARE_DETECT_BOARD: 'firmware:detect-board',
  FIRMWARE_FETCH_MANIFEST: 'firmware:fetch-manifest',
  FIRMWARE_FETCH_BOARDS: 'firmware:fetch-boards',
  FIRMWARE_FETCH_VERSIONS: 'firmware:fetch-versions',
  FIRMWARE_DOWNLOAD: 'firmware:download',
  FIRMWARE_FLASH: 'firmware:flash',
  FIRMWARE_ABORT: 'firmware:abort',
  FIRMWARE_PROGRESS: 'firmware:progress',
  FIRMWARE_COMPLETE: 'firmware:complete',
  FIRMWARE_ERROR: 'firmware:error',
  FIRMWARE_SELECT_FILE: 'firmware:select-file',
  FIRMWARE_ENTER_BOOTLOADER: 'firmware:enter-bootloader',
  FIRMWARE_LIST_PORTS: 'firmware:list-ports',
  FIRMWARE_PROBE_STM32: 'firmware:probe-stm32',
  FIRMWARE_QUERY_MAVLINK: 'firmware:query-mavlink',
  FIRMWARE_QUERY_MSP: 'firmware:query-msp',
  FIRMWARE_AUTO_DETECT: 'firmware:auto-detect',

  // ESP32 flashing
  ESP32_DETECT: 'esp32:detect',
  ESP32_FLASH: 'esp32:flash',
  ESP32_FLASH_TEMPLATE: 'esp32:flash-template',
  ESP32_CHECK_ESPTOOL: 'esp32:check-esptool',
  ESP32_DOWNLOAD_ESPTOOL: 'esp32:download-esptool',

  // DroneBridge ESP32
  DRONEBRIDGE_DETECT: 'dronebridge:detect',
  DRONEBRIDGE_DETECTED: 'dronebridge:detected',
  DRONEBRIDGE_GET_INFO: 'dronebridge:get-info',
  DRONEBRIDGE_GET_STATS: 'dronebridge:get-stats',
  DRONEBRIDGE_GET_SETTINGS: 'dronebridge:get-settings',
  DRONEBRIDGE_UPDATE_SETTINGS: 'dronebridge:update-settings',
  DRONEBRIDGE_GET_CLIENTS: 'dronebridge:get-clients',
  DRONEBRIDGE_ADD_UDP_CLIENT: 'dronebridge:add-udp-client',
  DRONEBRIDGE_CLEAR_UDP_CLIENTS: 'dronebridge:clear-udp-clients',
  DRONEBRIDGE_READ_SERIAL: 'dronebridge:read-serial',
  DRONEBRIDGE_READ_SERIAL_RESET: 'dronebridge:read-serial-reset',

  // MSP Connection (Betaflight/iNav/Cleanflight)
  MSP_CONNECT: 'msp:connect',
  MSP_DISCONNECT: 'msp:disconnect',
  MSP_CONNECTION_STATE: 'msp:connection-state',

  // MSP Telemetry
  MSP_TELEMETRY_UPDATE: 'msp:telemetry-update',
  MSP_START_TELEMETRY: 'msp:start-telemetry',
  MSP_STOP_TELEMETRY: 'msp:stop-telemetry',
  MSP_START_GPS_SENDER: 'msp:start-gps-sender',
  MSP_STOP_GPS_SENDER: 'msp:stop-gps-sender',

  // MSP Configuration
  MSP_GET_STATUS: 'msp:get-status',
  MSP_GET_ATTITUDE: 'msp:get-attitude',
  MSP_GET_ANALOG: 'msp:get-analog',
  MSP_GET_RC: 'msp:get-rc',
  MSP_GET_MOTOR: 'msp:get-motor',
  MSP_GET_GPS: 'msp:get-gps',
  MSP_GET_PID: 'msp:get-pid',
  MSP_SET_PID: 'msp:set-pid',
  MSP_GET_RC_TUNING: 'msp:get-rc-tuning',
  MSP_SET_RC_TUNING: 'msp:set-rc-tuning',
  MSP_GET_MODE_RANGES: 'msp:get-mode-ranges',
  MSP_SET_MODE_RANGE: 'msp:set-mode-range',
  MSP_GET_FEATURES: 'msp:get-features',
  MSP_SET_FEATURES: 'msp:set-features',
  MSP_GET_MIXER_CONFIG: 'msp:get-mixer-config',
  MSP_SET_MIXER_CONFIG: 'msp:set-mixer-config',
  // iNav-specific mixer config (proper MSP2 commands for platform type)
  MSP_GET_INAV_MIXER_CONFIG: 'msp:get-inav-mixer-config',
  MSP_SET_INAV_PLATFORM_TYPE: 'msp:set-inav-platform-type',
  MSP_CONFIG_UPDATE: 'msp:config-update',

  // MSP Servo Configuration (iNav)
  MSP_GET_SERVO_CONFIGS: 'msp:get-servo-configs',
  MSP_SET_SERVO_CONFIG: 'msp:set-servo-config',
  MSP_SAVE_SERVO_CLI: 'msp:save-servo-cli', // CLI fallback for old iNav
  MSP_GET_SERVO_VALUES: 'msp:get-servo-values',
  MSP_GET_SERVO_MIXER: 'msp:get-servo-mixer',
  MSP_SET_SERVO_MIXER: 'msp:set-servo-mixer',
  MSP_GET_SERVO_CONFIG_MODE: 'msp:get-servo-config-mode', // Check if using CLI fallback + valid ranges
  MSP_GET_MOTOR_MIXER: 'msp:get-motor-mixer', // MSP motor mixer (modern boards)
  MSP_SET_MOTOR_MIXER: 'msp:set-motor-mixer', // MSP motor mixer (modern boards)
  MSP_SET_MOTOR_MIXER_CLI: 'msp:set-motor-mixer-cli', // CLI mmix for legacy iNav boards
  MSP_SET_SERVO_MIXER_CLI: 'msp:set-servo-mixer-cli', // CLI smix for legacy iNav boards
  MSP_READ_SMIX_CLI: 'msp:read-smix-cli', // Read smix via CLI for preset detection
  MSP_READ_MMIX_CLI: 'msp:read-mmix-cli', // Read mmix via CLI for verification

  // MSP Waypoint/Mission (iNav)
  MSP_GET_WAYPOINTS: 'msp:get-waypoints',       // Read all waypoints from FC
  MSP_SET_WAYPOINT: 'msp:set-waypoint',         // Write single waypoint to FC
  MSP_SAVE_WAYPOINTS: 'msp:save-waypoints',     // Save mission to EEPROM
  MSP_CLEAR_WAYPOINTS: 'msp:clear-waypoints',   // Clear all waypoints
  MSP_GET_MISSION_INFO: 'msp:get-mission-info', // Get mission info (count, validity)

  // MSP Navigation Settings (iNav)
  MSP_GET_NAV_CONFIG: 'msp:get-nav-config',
  MSP_SET_NAV_CONFIG: 'msp:set-nav-config',
  MSP_GET_GPS_CONFIG: 'msp:get-gps-config',
  MSP_SET_GPS_CONFIG: 'msp:set-gps-config',

  // MSP Failsafe Configuration
  MSP_GET_FAILSAFE_CONFIG: 'msp:get-failsafe-config',
  MSP_SET_FAILSAFE_CONFIG: 'msp:set-failsafe-config',

  // MSP GPS Rescue Configuration (Betaflight)
  MSP_GET_GPS_RESCUE: 'msp:get-gps-rescue',
  MSP_SET_GPS_RESCUE: 'msp:set-gps-rescue',
  MSP_GET_GPS_RESCUE_PIDS: 'msp:get-gps-rescue-pids',
  MSP_SET_GPS_RESCUE_PIDS: 'msp:set-gps-rescue-pids',

  // MSP Filter Configuration (Betaflight)
  MSP_GET_FILTER_CONFIG: 'msp:get-filter-config',
  MSP_SET_FILTER_CONFIG: 'msp:set-filter-config',

  // MSP VTX Configuration
  MSP_GET_VTX_CONFIG: 'msp:get-vtx-config',
  MSP_SET_VTX_CONFIG: 'msp:set-vtx-config',

  // MSP OSD Configuration
  MSP_GET_OSD_CONFIG: 'msp:get-osd-config',

  // MSP RX Configuration
  MSP_GET_RX_CONFIG: 'msp:get-rx-config',
  MSP_SET_RX_CONFIG: 'msp:set-rx-config',

  // MSP Serial Port Configuration
  MSP_GET_SERIAL_CONFIG: 'msp:get-serial-config',
  MSP_SET_SERIAL_CONFIG: 'msp:set-serial-config',

  // MSP RX Map (channel mapping)
  MSP_GET_RX_MAP: 'msp:get-rx-map',
  MSP_SET_RX_MAP: 'msp:set-rx-map',

  // MSP RC Deadband
  MSP_GET_RC_DEADBAND: 'msp:get-rc-deadband',
  MSP_SET_RC_DEADBAND: 'msp:set-rc-deadband',

  // MSP Generic Settings API (read/write any CLI setting via MSP)
  MSP_GET_SETTING: 'msp:get-setting',
  MSP_SET_SETTING: 'msp:set-setting',
  MSP_GET_SETTINGS: 'msp:get-settings',
  MSP_SET_SETTINGS: 'msp:set-settings',

  // MSP Commands
  MSP_SAVE_EEPROM: 'msp:save-eeprom',
  MSP_CALIBRATE_ACC: 'msp:calibrate-acc',
  MSP_CALIBRATE_MAG: 'msp:calibrate-mag',
  MSP_REBOOT: 'msp:reboot',

  // MSP RC Control (GCS arm/disarm, mode switching)
  MSP_SET_RAW_RC: 'msp:set-raw-rc',       // Send RC channel values to FC
  MSP_GET_ACTIVE_BOXES: 'msp:get-active-boxes', // Get active mode boxes (bitmask)
  MSP_GET_BOX_NAMES: 'msp:get-box-names',       // Get mode names (dynamic, from FC)
  MSP_GET_BOX_IDS: 'msp:get-box-ids',           // Get permanent box IDs (dynamic, from FC)

  // Reconnection control (for expected reboots)
  RECONNECT_CANCEL: 'reconnect:cancel',

  // MSP Progress/Status
  MSP_PROGRESS: 'msp:progress',
  MSP_ERROR: 'msp:error',

  // CLI Terminal (iNav/Betaflight raw CLI access)
  CLI_ENTER_MODE: 'cli:enter-mode',
  CLI_EXIT_MODE: 'cli:exit-mode',
  CLI_SEND_COMMAND: 'cli:send-command',
  CLI_SEND_RAW: 'cli:send-raw',
  CLI_DATA_RECEIVED: 'cli:data-received',
  CLI_GET_DUMP: 'cli:get-dump',
  CLI_SAVE_OUTPUT: 'cli:save-output',
  CLI_SAVE_OUTPUT_JSON: 'cli:save-output-json',
  CLI_RESET_ALL_FLAGS: 'cli:reset-all-flags', // Reset ALL CLI mode flags (both cli-handlers and msp-handlers)

  // Driver utilities
  DRIVER_OPEN_BUNDLED: 'driver:open-bundled',

  // SITL Simulator (iNav)
  SITL_START: 'sitl:start',
  SITL_STOP: 'sitl:stop',
  SITL_STATUS: 'sitl:status',
  SITL_DELETE_EEPROM: 'sitl:delete-eeprom',
  SITL_STDOUT: 'sitl:stdout',
  SITL_STDERR: 'sitl:stderr',
  SITL_ERROR: 'sitl:error',
  SITL_EXIT: 'sitl:exit',

  // ArduPilot SITL
  ARDUPILOT_SITL_START: 'ardupilot-sitl:start',
  ARDUPILOT_SITL_STOP: 'ardupilot-sitl:stop',
  ARDUPILOT_SITL_STATUS: 'ardupilot-sitl:status',
  ARDUPILOT_SITL_DOWNLOAD: 'ardupilot-sitl:download',
  /** Copy a user-selected local file into the SITL cache (e.g. when upstream download is blocked). */
  ARDUPILOT_SITL_IMPORT_BINARY: 'ardupilot-sitl:import-binary',
  ARDUPILOT_SITL_DOWNLOAD_PROGRESS: 'ardupilot-sitl:download-progress',
  ARDUPILOT_SITL_CHECK_BINARY: 'ardupilot-sitl:check-binary',
  ARDUPILOT_SITL_CHECK_PLATFORM: 'ardupilot-sitl:check-platform',
  ARDUPILOT_SITL_STDOUT: 'ardupilot-sitl:stdout',
  ARDUPILOT_SITL_STDERR: 'ardupilot-sitl:stderr',
  ARDUPILOT_SITL_ERROR: 'ardupilot-sitl:error',
  ARDUPILOT_SITL_EXIT: 'ardupilot-sitl:exit',
  ARDUPILOT_SITL_RC_SEND: 'ardupilot-sitl:rc-send',
  ARDUPILOT_SITL_RC_START: 'ardupilot-sitl:rc-start',
  ARDUPILOT_SITL_RC_STOP: 'ardupilot-sitl:rc-stop',
  ARDUPILOT_SITL_LIST_FRAMES: 'ardupilot-sitl:list-frames',
  ARDUPILOT_SITL_REFRESH_FRAMES: 'ardupilot-sitl:refresh-frames',

  // SITL custom frames (user-authored JSON physics models)
  ARDUPILOT_SITL_CUSTOM_FRAME_LIST: 'ardupilot-sitl:custom-frame-list',
  ARDUPILOT_SITL_CUSTOM_FRAME_LOAD: 'ardupilot-sitl:custom-frame-load',
  ARDUPILOT_SITL_CUSTOM_FRAME_SAVE: 'ardupilot-sitl:custom-frame-save',
  ARDUPILOT_SITL_CUSTOM_FRAME_DELETE: 'ardupilot-sitl:custom-frame-delete',
  ARDUPILOT_SITL_CUSTOM_FRAME_IMPORT: 'ardupilot-sitl:custom-frame-import',
  ARDUPILOT_SITL_CUSTOM_FRAME_EXPORT: 'ardupilot-sitl:custom-frame-export',

  // Visual Simulators (FlightGear, X-Plane)
  SIMULATOR_DETECT: 'simulator:detect',
  SIMULATOR_BROWSE_FG: 'simulator:browse-fg',
  SIMULATOR_BROWSE_XP: 'simulator:browse-xp',
  SIMULATOR_LAUNCH_FG: 'simulator:launch-fg',
  SIMULATOR_STOP_FG: 'simulator:stop-fg',
  SIMULATOR_FG_STATUS: 'simulator:fg-status',
  SIMULATOR_LAUNCH_XP: 'simulator:launch-xp',
  SIMULATOR_STOP_XP: 'simulator:stop-xp',
  SIMULATOR_XP_STATUS: 'simulator:xp-status',
  BRIDGE_START: 'bridge:start',
  BRIDGE_STOP: 'bridge:stop',
  BRIDGE_STATUS: 'bridge:status',

  // Virtual RC Control (for SITL testing)
  VIRTUAL_RC_SET: 'virtual-rc:set',
  VIRTUAL_RC_GET: 'virtual-rc:get',
  VIRTUAL_RC_RESET: 'virtual-rc:reset',

  // Bug Report / Logging
  REPORT_COLLECT_LOGS: 'report:collect-logs',
  REPORT_COLLECT_MSP_DUMP: 'report:collect-msp-dump',
  REPORT_COLLECT_MAVLINK_DUMP: 'report:collect-mavlink-dump',
  REPORT_GET_SYSTEM_INFO: 'report:get-system-info',
  REPORT_CREATE: 'report:create',
  REPORT_SAVE: 'report:save',
  REPORT_PROGRESS: 'report:progress',
  REPORT_GET_ENCRYPTION_INFO: 'report:get-encryption-info',

  // Calibration
  CALIBRATION_GET_SENSOR_CONFIG: 'calibration:get-sensor-config',
  CALIBRATION_GET_DATA: 'calibration:get-data',
  CALIBRATION_SET_DATA: 'calibration:set-data',
  CALIBRATION_START: 'calibration:start',
  CALIBRATION_CONFIRM_POSITION: 'calibration:confirm-position',
  CALIBRATION_CANCEL: 'calibration:cancel',
  CALIBRATION_SAVE_PERSISTENT: 'calibration:save-persistent', // Save to bootloader persistent storage (INAV only)
  CALIBRATION_LARGE_VEHICLE_MAGCAL: 'calibration:large-vehicle-magcal', // ArduPilot MAV_CMD_FIXED_MAG_CAL_YAW (42006)
  CALIBRATION_PROGRESS: 'calibration:progress', // Event from main
  CALIBRATION_COMPLETE: 'calibration:complete', // Event from main

  // Motor Test
  MOTOR_TEST_START: 'motor-test:start',
  MOTOR_TEST_STOP: 'motor-test:stop',

  // Servo Test (per-channel pulse via MAV_CMD_DO_SET_SERVO)
  SERVO_TEST_PULSE: 'servo-test:pulse',
  SERVO_TEST_RELEASE: 'servo-test:release',

  // RC Override (synthetic stick input via RC_CHANNELS_OVERRIDE for bench testing)
  RC_OVERRIDE_SET: 'rc-override:set',
  RC_OVERRIDE_RELEASE: 'rc-override:release',

  // Mission Library (offline storage)
  MISSION_LIBRARY_LIST: 'mission-library:list',
  MISSION_LIBRARY_GET: 'mission-library:get',
  MISSION_LIBRARY_SAVE: 'mission-library:save',
  MISSION_LIBRARY_DELETE: 'mission-library:delete',
  MISSION_LIBRARY_DUPLICATE: 'mission-library:duplicate',
  MISSION_LIBRARY_GET_TAGS: 'mission-library:get-tags',
  MISSION_LIBRARY_FLIGHT_LOGS: 'mission-library:flight-logs',
  MISSION_LIBRARY_ADD_LOG: 'mission-library:add-log',
  MISSION_LIBRARY_UPDATE_LOG: 'mission-library:update-log',
  MISSION_LIBRARY_DELETE_LOG: 'mission-library:delete-log',

  // Lua Graph Editor
  LUA_GRAPH_SAVE: 'lua-graph:save',
  LUA_GRAPH_OPEN: 'lua-graph:open',
  LUA_GRAPH_EXPORT_LUA: 'lua-graph:export-lua',

  // Module Manager
  MODULE_ACTIVATE: 'module:activate',
  MODULE_LIST: 'module:list',
  MODULE_REMOVE: 'module:remove',
  MODULE_CHECK_UPDATES: 'module:check-updates',
  MODULE_PROGRESS: 'module:progress',

  // Module Host (runtime API exposed to loaded modules)
  MODULE_HOST_LIST_LOADED: 'module-host:list-loaded',
  MODULE_HOST_PTY_CREATE: 'module-host:pty-create',
  MODULE_HOST_PTY_WRITE: 'module-host:pty-write',
  MODULE_HOST_PTY_DATA: 'module-host:pty-data',
  MODULE_HOST_PTY_EXIT: 'module-host:pty-exit',
  MODULE_HOST_PTY_KILL: 'module-host:pty-kill',
  MODULE_HOST_PTY_RESIZE: 'module-host:pty-resize',

  // Tile Cache (offline maps)
  TILE_CACHE_GET_STATS: 'tile-cache:get-stats',
  TILE_CACHE_CLEAR: 'tile-cache:clear',
  TILE_CACHE_DOWNLOAD_REGION: 'tile-cache:download-region',
  TILE_CACHE_CANCEL_DOWNLOAD: 'tile-cache:cancel-download',
  TILE_CACHE_DOWNLOAD_PROGRESS: 'tile-cache:download-progress',
  TILE_CACHE_GET_SETTINGS: 'tile-cache:get-settings',
  TILE_CACHE_SET_SETTINGS: 'tile-cache:set-settings',
  TILE_CACHE_CALCULATE_TILES: 'tile-cache:calculate-tiles',
  TILE_CACHE_GET_REGIONS: 'tile-cache:get-regions',
  TILE_CACHE_DELETE_REGION: 'tile-cache:delete-region',

  // App / Updates
  APP_GET_VERSION: 'app:get-version',
  APP_CHECK_UPDATE: 'app:check-update',
  APP_DOWNLOAD_UPDATE: 'app:download-update',
  APP_INSTALL_UPDATE: 'app:install-update',
  APP_UPDATE_STATUS: 'app:update-status',
  APP_OPEN_EXTERNAL: 'app:open-external',

  // =========================================================================
  // Companion Computer (Agent WebSocket + MAVLink Layer 1)
  // =========================================================================

  // Connection management
  COMPANION_CONNECT: 'companion:connect',
  COMPANION_DISCONNECT: 'companion:disconnect',
  COMPANION_CONNECTION_STATE: 'companion:connection-state',

  // Discovery
  COMPANION_DISCOVER: 'companion:discover',
  COMPANION_DISCOVER_RESULT: 'companion:discover-result',

  // Layer 1 (MAVLink heartbeat)
  COMPANION_HEARTBEAT: 'companion:heartbeat',
  COMPANION_STATUSTEXT: 'companion:statustext',

  // Layer 2 (Agent — real-time streams via WebSocket)
  COMPANION_METRICS: 'companion:metrics',
  COMPANION_PROCESSES: 'companion:processes',
  COMPANION_PROCESS_KILL: 'companion:process-kill',
  COMPANION_LOGS: 'companion:logs',
  COMPANION_SERVICES: 'companion:services',
  COMPANION_SERVICE_ACTION: 'companion:service-action',
  COMPANION_FILES_LIST: 'companion:files-list',
  COMPANION_FILE_READ: 'companion:file-read',
  COMPANION_FILE_WRITE: 'companion:file-write',
  COMPANION_TERMINAL_SEND: 'companion:terminal-send',       // renderer -> main (keystrokes)
  COMPANION_TERMINAL_DATA: 'companion:terminal-data',       // main -> renderer (output)
  COMPANION_TERMINAL_RESIZE: 'companion:terminal-resize',
  COMPANION_NETWORK: 'companion:network',
  COMPANION_INFO: 'companion:info',

  // Layer 3 (Docker / BlueOS)
  COMPANION_CONTAINERS: 'companion:containers',
  COMPANION_CONTAINER_ACTION: 'companion:container-action',
  COMPANION_CONTAINER_LOGS: 'companion:container-logs',
  COMPANION_EXTENSIONS: 'companion:extensions',
  COMPANION_EXTENSION_INSTALL: 'companion:extension-install',
  COMPANION_EXTENSION_REMOVE: 'companion:extension-remove',

  // Map overlays
  OVERLAY_GET_RADAR_META: 'overlay:get-radar-meta',
  OVERLAY_GET_AIRSPACE: 'overlay:get-airspace',
  OVERLAY_GET_AIRPORTS: 'overlay:get-airports',
  OVERLAY_GET_API_KEY: 'overlay:get-api-key',
  OVERLAY_SET_API_KEY: 'overlay:set-api-key',

  // Log download & diagnostics
  LOG_LIST_REQUEST: 'log:list-request',
  LOG_LIST_ITEM: 'log:list-item',
  LOG_LIST_COMPLETE: 'log:list-complete',
  LOG_DOWNLOAD: 'log:download',
  LOG_DOWNLOAD_PROGRESS: 'log:download-progress',
  LOG_DOWNLOAD_COMPLETE: 'log:download-complete',
  LOG_DOWNLOAD_ERROR: 'log:download-error',
  LOG_DOWNLOAD_CANCEL: 'log:download-cancel',
  /** Show open-file dialog only (no read). Returns just the chosen path so
   *  the renderer never has to round-trip the file bytes through IPC — that
   *  was the root cause of multi-minute freezes on 100MB+ logs. */
  LOG_OPEN_DIALOG: 'log:open-dialog',
  /** Read + parse a .bin file by path on the main process. Streams progress
   *  via LOG_PARSE_PROGRESS events and returns the serialized log + health
   *  results. Replaces the old LOG_OPEN_FILE / LOG_READ_FILE / LOG_PARSE
   *  trio which all marshalled the file as `number[]` between processes. */
  LOG_PARSE_FILE: 'log:parse-file',
  LOG_PARSE_PROGRESS: 'log:parse-progress',
  LOG_PARSE_COMPLETE: 'log:parse-complete',
  LOG_AI_ANALYZE: 'log:ai-analyze',
  LOG_CHAT_SAVE: 'log:chat-save',
  LOG_CHAT_LOAD: 'log:chat-load',
  LOG_RECENT_GET: 'log:recent-get',
  LOG_RECENT_ADD: 'log:recent-add',
  LOG_RECENT_REMOVE: 'log:recent-remove',
  LOG_RECENT_CLEAR: 'log:recent-clear',

  // =========================================================================
  // Python Plugins (system Python sidecars with JSON-RPC over stdio)
  // =========================================================================

  /** Detect a usable Python interpreter on the host system. */
  PYTHON_DETECT: 'python:detect',
  /** Open the user's python-plugins directory in the system file manager. */
  PYTHON_OPEN_DIR: 'python:open-dir',

  /** List all installed Python plugins with current status. */
  PYTHON_PLUGIN_LIST: 'python:plugin:list',
  /** Re-scan the python-plugins directory and reload manifests. */
  PYTHON_PLUGIN_REFRESH: 'python:plugin:refresh',
  /** Install a plugin from a local folder/zip and create its venv. */
  PYTHON_PLUGIN_INSTALL: 'python:plugin:install',
  /** Uninstall a plugin (stop sidecar, drop venv, remove files). */
  PYTHON_PLUGIN_UNINSTALL: 'python:plugin:uninstall',
  /** Launch the sidecar process for a plugin. */
  PYTHON_PLUGIN_START: 'python:plugin:start',
  /** Stop the sidecar process for a plugin. */
  PYTHON_PLUGIN_STOP: 'python:plugin:stop',
  /** Invoke an RPC method on a running plugin and return the result. */
  PYTHON_PLUGIN_CALL: 'python:plugin:call',

  /** Push channel: per-plugin status transitions (installing/ready/error/...). */
  PYTHON_PLUGIN_STATUS: 'python:plugin:status',
  /** Push channel: log lines from sidecar stdout/stderr. */
  PYTHON_PLUGIN_LOG: 'python:plugin:log',
  /** Push channel: plugin-emitted events (renderer-side subscribe by name). */
  PYTHON_PLUGIN_EVENT: 'python:plugin:event',
  /** Push channel: pip install progress while a plugin's venv is provisioning. */
  PYTHON_PLUGIN_INSTALL_PROGRESS: 'python:plugin:install-progress',
  /** Internal bridge: main -> preload command execution request. */
  PYTHON_PLUGIN_COMMAND_REQUEST: 'python:plugin:command-request',
  /** Internal bridge: preload -> main command execution result. */
  PYTHON_PLUGIN_COMMAND_RESULT: 'python:plugin:command-result',
} as const;

export type IpcChannels = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS];

/**
 * Connection options for comms:connect
 */
export interface ConnectOptions {
  type: 'serial' | 'tcp' | 'udp';
  port?: string;
  baudRate?: number;
  host?: string;
  tcpPort?: number;
  udpPort?: number;
  /** UDP mode: 'listen' binds locally, 'client' sends to remote host */
  udpMode?: 'listen' | 'client';
  udpRemoteHost?: string;
  udpRemotePort?: number;
  /**
   * Local port to bind for UDP client mode. Defaults to 14550. Must be
   * stable across reconnects — ArduPilot's UDPIN driver caches the source
   * IP+port of the first packet it sees and replies there forever, so
   * letting the OS pick an ephemeral port (0) breaks reconnect.
   */
  udpClientLocalPort?: number;
  /** Force a specific protocol, skipping auto-detection */
  protocol?: 'mavlink' | 'msp';
}

/**
 * Companion computer connect options
 */
export interface CompanionConnectOptions {
  host: string;
  port?: number;  // Default: 48400
  token: string;
}

/**
 * Companion connection state (sent over COMPANION_CONNECTION_STATE)
 */
export interface CompanionConnectionIpcState {
  state: 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
  host: string | null;
  port: number | null;
  agentVersion: string | null;
  protocolVersion: string | null;
  versionMismatch: boolean;
  reconnectAttempt: number;
}

/**
 * Companion discovery result
 */
export interface CompanionDiscoveryResult {
  host: string;
  port: number;
  hostname: string;
  source: 'mdns' | 'manual' | 'mavlink-hint';
}

/**
 * Connection state
 */
export interface ConnectionState {
  isConnected: boolean;
  isWaitingForHeartbeat?: boolean;
  protocol?: 'mavlink' | 'msp'; // Auto-detected protocol
  transport?: string;
  portPath?: string; // Serial port path for reconnection
  // MAVLink-specific
  systemId?: number;
  componentId?: number;
  autopilot?: string;
  vehicleType?: string;
  mavType?: number; // Raw MAV_TYPE for metadata lookup
  // MSP-specific (Betaflight/iNav)
  fcVariant?: string; // "BTFL", "INAV", "CLFL"
  fcVersion?: string; // "4.5.1"
  boardId?: string; // "SPRACINGH7"
  apiVersion?: string;
  /**
   * Legacy board detection - TRUE for boards that only support CLI config:
   * - iNav < 2.1.0 (F3 boards like SPRacing F3)
   * - Betaflight < 4.0 (F3 boards)
   * When true, use LegacyConfigView instead of MspConfigView
   */
  isLegacyBoard?: boolean;
  /**
   * SITL connection - TRUE when connected to SITL simulator.
   * Used to disable firmware flashing UI.
   */
  isSitl?: boolean;
  /**
   * Auto-reconnect state - TRUE when reconnecting after expected reboot.
   * During reconnection, stores are NOT reset and UI stays on current screen.
   */
  isReconnecting?: boolean;
  reconnectReason?: string; // "Saving configuration", "Rebooting board"
  reconnectAttempt?: number; // Current attempt (1-based)
  reconnectMaxAttempts?: number; // Max attempts before giving up
  /**
   * Link stale - TRUE when no vehicle heartbeat has arrived within the soft
   * watchdog window, but the transport is still open. UI should show a "no
   * data for Ns" warning instead of tearing the connection down, since this
   * is often a transient radio/link drop (especially over TCP/WireGuard).
   * Cleared automatically when heartbeats resume.
   */
  isStale?: boolean;
  /** Timestamp (ms since epoch) when the link went stale. Used to render elapsed time. */
  staleSince?: number;
  /** Detected MAVLink protocol version (1 or 2) */
  mavlinkVersion?: number;
  /** Unique board identifier from AUTOPILOT_VERSION uid/uid2 (hex string) */
  boardUid?: string;
  /** Connection type for transport-aware logic (signing, reconnect, etc.) */
  connectionType?: 'serial' | 'tcp' | 'udp';
  // MAVLink signing
  signingEnabled?: boolean;
  /** True when we detect the FC is sending signed packets back */
  fcSigning?: boolean;
  // Stats
  packetsReceived: number;
  packetsSent: number;
}

/**
 * Console log entry for debug panel
 */
export interface ConsoleLogEntry {
  id: number;
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'debug' | 'packet';
  message: string;
  details?: string;
}

/**
 * Saved dashboard layout
 */
export interface SavedLayout {
  name: string;
  createdAt: number;
  updatedAt: number;
  data: unknown; // dockview serialized state
}

/**
 * Layout store schema
 */
export interface LayoutStoreSchema {
  activeLayout: string;
  layouts: Record<string, SavedLayout>;
}

/**
 * Vehicle type for profiles
 */
export type SettingsVehicleType = 'copter' | 'plane' | 'vtol' | 'rover' | 'boat' | 'sub';

/**
 * Board statistics from ArduPilot STAT_* parameters.
 * Updated each time a board connects and parameters are loaded.
 */
export interface BoardStats {
  totalFlightTime?: number;    // STAT_FLTTIME - seconds
  totalFlightCount?: number;   // STAT_FLTCNT
  totalRunTime?: number;       // STAT_RUNTIME - seconds
  totalDistance?: number;       // STAT_DISTFLWN - meters
  bootCount?: number;          // STAT_BOOTCNT
  lastUpdated?: string;        // ISO date of last stats update
}

/**
 * Vehicle profile for performance calculations
 */
export interface SettingsVehicleProfile {
  id: string;
  name: string;
  type: SettingsVehicleType;
  weight: number;
  batteryCells: number;
  batteryCapacity: number;
  batteryDischarge?: number;
  // Board identification
  boardUid?: string;           // Unique board identifier from AUTOPILOT_VERSION uid/uid2
  boardId?: string;            // Board type name (e.g., "fmuv3", "Pixhawk4")
  boardName?: string;          // Human-friendly display name
  lastConnected?: string;      // ISO date of last connection
  boardStats?: BoardStats;     // Flight stats from STAT_* parameters
  // Copter
  frameSize?: number;
  motorCount?: number;
  motorKv?: number;
  propSize?: string;
  escRating?: number;
  // Plane
  wingspan?: number;
  wingArea?: number;
  stallSpeed?: number;
  // VTOL
  vtolMotorCount?: number;
  transitionSpeed?: number;
  // Rover
  wheelbase?: number;
  wheelDiameter?: number;
  driveType?: 'differential' | 'ackermann' | 'skid';
  maxSpeed?: number;
  // Boat
  hullLength?: number;
  hullType?: 'displacement' | 'planing' | 'catamaran' | 'pontoon';
  propellerType?: 'prop' | 'jet' | 'paddle';
  displacement?: number;
  // Sub
  maxDepth?: number;
  thrusterCount?: number;
  buoyancy?: 'positive' | 'neutral' | 'negative';
  // Notes
  notes?: string;
}

/**
 * Mission planning defaults
 */
export interface SettingsMissionDefaults {
  safeAltitudeBuffer: number;
  defaultWaypointAltitude: number;
  defaultTakeoffAltitude: number;
}

/**
 * Flight statistics
 */
export interface SettingsFlightStats {
  totalFlightTimeSeconds: number;
  totalDistanceMeters: number;
  totalMissions: number;
  lastFlightDate: string | null;
  lastConnectionDate: string | null;
}

/**
 * Connection memory - remembers last used connection settings
 */
export interface SettingsConnectionMemory {
  lastSerialPort?: string;
  lastBaudRate?: number;
  lastTcpHost?: string;
  lastTcpPort?: number;
  lastUdpPort?: number;
  lastUdpMode?: 'listen' | 'client';
  lastUdpRemoteHost?: string;
  lastUdpRemotePort?: number;
  lastConnectionType?: 'serial' | 'tcp' | 'udp';
}

/**
 * UI visibility settings - granular control over educational UI elements
 */
export interface UiVisibilitySettings {
  showInfoCards?: boolean;
  showExplanationCards?: boolean;
  showTips?: boolean;
  showQuickPresets?: boolean;
  showSectionDescriptions?: boolean;
  defaultAdvancedViews?: boolean;
}

/**
 * A user-saved survey planner preset. Shape is duplicated loosely here to keep
 * the shared module from importing renderer-only survey types. The renderer is
 * the source of truth for the strict type (see survey-presets.ts).
 */
export interface PersistedSurveyPreset {
  id: string;
  name: string;
  description: string;
  tag: string;
  isUserDefined: true;
  config: Record<string, unknown>;
  camera?: Record<string, unknown>;
}

/**
 * Settings store schema (persisted to disk)
 */
export interface SettingsStoreSchema {
  missionDefaults: SettingsMissionDefaults;
  vehicles: SettingsVehicleProfile[];
  activeVehicleId: string | null;
  flightStats: SettingsFlightStats;
  connectionMemory?: SettingsConnectionMemory;
  telemetrySpeed?: TelemetrySpeed;
  experienceLevel?: 'beginner' | 'advanced';
  experienceLevelVersion?: string;
  uiVisibility?: UiVisibilitySettings;
  experimentalLogs?: boolean;
  showDebugLogs?: boolean;
  aiProvider?: 'claude' | 'openai' | 'gemini' | null;
  /** User-saved survey planner presets. Built-in presets ship in code. */
  surveyPresets?: PersistedSurveyPreset[];
  /** Last-used survey preset id (built-in or user-defined). Restored on app start. */
  lastSurveyPresetId?: string;
  /**
   * Last-used survey config (camera, altitude, overlaps, pattern, etc.) so
   * planner state survives app restart. Polygon and result are NOT persisted
   * (scene-specific). Loose Record shape to keep this module free of
   * renderer-only survey types.
   */
  surveySavedConfig?: Record<string, unknown>;
}

// =============================================================================
// MSP Types (Betaflight/iNav/Cleanflight)
// =============================================================================

/**
 * MSP connection options
 */
export interface MSPConnectOptions {
  port: string;
  baudRate?: number; // Default: 115200
}

/**
 * MSP connection state
 */
export interface MSPConnectionState {
  isConnected: boolean;
  port: string;
  baudRate: number;
  fcVariant: string; // "BTFL", "INAV", "CLFL"
  fcVersion: string; // "4.5.1"
  boardId: string; // "SPRACINGH7"
  apiVersion: string;
  lastError?: string;
}

/**
 * MSP telemetry data (combined from multiple MSP messages)
 */
export interface MSPTelemetryData {
  // Attitude (from MSP_ATTITUDE)
  attitude?: {
    roll: number; // degrees
    pitch: number; // degrees
    yaw: number; // degrees (heading)
  };

  // Altitude (from MSP_ALTITUDE)
  altitude?: {
    altitude: number; // meters
    vario: number; // m/s
  };

  // Analog/Battery (from MSP_ANALOG)
  analog?: {
    voltage: number; // volts
    mAhDrawn: number;
    rssi: number; // 0-100%
    current: number; // amps
  };

  // Status (from MSP_STATUS)
  status?: {
    cycleTime: number; // microseconds
    cpuLoad: number; // 0-100%
    armingFlags: number;
    flightModeFlags: number;
    isArmed: boolean;
  };

  // RC Channels (from MSP_RC)
  rc?: {
    channels: number[]; // 16 channels, 1000-2000
  };

  // Motors (from MSP_MOTOR)
  motors?: {
    values: number[]; // 4-8 motors
  };

  // GPS (from MSP_RAW_GPS)
  gps?: {
    fixType: number;
    satellites: number;
    lat: number; // decimal degrees
    lon: number; // decimal degrees
    alt: number; // meters
    speed: number; // m/s
    heading: number; // degrees
  };

  // Timestamps
  timestamp: number;
}

/**
 * MSP PID configuration
 */
export interface MSPPidConfig {
  roll: { p: number; i: number; d: number };
  pitch: { p: number; i: number; d: number };
  yaw: { p: number; i: number; d: number };
}

/**
 * MSP rates configuration
 */
export interface MSPRatesConfig {
  rcRate: number[];
  superRate: number[];
  rcExpo: number[];
  ratesType: number; // 0=Betaflight, 3=Actual, 4=Quick
}

/**
 * MSP mode range
 */
export interface MSPModeRange {
  boxId: number;
  auxChannel: number;
  rangeStart: number;
  rangeEnd: number;
}

// =============================================================================
// SITL Types (Software-In-The-Loop Simulation)
// =============================================================================

/**
 * SITL configuration for starting the simulator
 */
export interface SitlConfig {
  /** EEPROM filename for persistent config storage */
  eepromFileName: string;
  /** Simulator type: 'xp' (X-Plane) or 'rf' (RealFlight) - Phase 2 */
  simulator?: 'xp' | 'rf';
  /** Use IMU data from simulator - Phase 2 */
  useImu?: boolean;
  /** Simulator IP address - Phase 2 */
  simIp?: string;
  /** Simulator port - Phase 2 */
  simPort?: number;
  /** Channel mapping string (e.g., "M01-01,S01-02") - Phase 2 */
  channelMap?: string;
  /** Serial port for RX passthrough - Phase 2 */
  serialPort?: string;
  /** Serial baud rate - Phase 2 */
  baudRate?: number;
  /** Serial stop bits - Phase 2 */
  stopBits?: 'One' | 'Two';
  /** Serial parity - Phase 2 */
  parity?: 'None' | 'Even' | 'Odd';
  /** Serial UART number for RX - Phase 2 */
  serialUart?: number;
}

/**
 * SITL profile for saved configurations.
 *
 * A profile represents a complete SITL configuration including:
 * - EEPROM file: Stores FC config (PIDs, rates, modes, etc.) - persists across restarts
 * - Simulator settings (Phase 2): X-Plane/RealFlight integration
 *
 * Each profile gets its own EEPROM file, so you can have different configurations
 * for testing (e.g., one for airplane testing, one for quad testing).
 */
export interface SitlProfile {
  /** Profile name */
  name: string;
  /** Description explaining what this profile is for */
  description?: string;
  /** EEPROM filename (auto-generated from name) */
  eepromFileName: string;
  /** Is this a standard (non-deletable) profile */
  isStandard?: boolean;
  /** Simulator type - Phase 2 */
  simulator?: 'xp' | 'rf';
  /** Enable simulator integration - Phase 2 */
  simEnabled?: boolean;
  /** Simulator IP - Phase 2 */
  simIp?: string;
  /** Simulator port - Phase 2 */
  simPort?: number;
  /** Use IMU from simulator - Phase 2 */
  useImu?: boolean;
  /** Channel mapping - Phase 2 */
  channelMap?: number[];
}

/**
 * SITL process status
 */
export interface SitlStatus {
  isRunning: boolean;
  pid?: number;
  /** Command line used to start (for debugging) */
  command?: string;
}

/**
 * SITL exit event data
 */
export interface SitlExitData {
  code: number | null;
  signal: string | null;
}

/**
 * Virtual RC channel values for SITL testing.
 * Values are -1.0 to +1.0 (maps to 1000-2000 PWM)
 * -1 = 1000 PWM, 0 = 1500 PWM, +1 = 2000 PWM
 */
export interface VirtualRCState {
  roll: number;      // -1 to +1
  pitch: number;     // -1 to +1
  yaw: number;       // -1 to +1
  throttle: number;  // -1 to +1 (but typically 0-1 for safety)
  aux1: number;      // -1 to +1
  aux2: number;      // -1 to +1
  aux3: number;      // -1 to +1
  aux4: number;      // -1 to +1 (ARM switch is typically here)
}

// =============================================================================
// ArduPilot SITL Types
// =============================================================================

/**
 * ArduPilot vehicle types
 */
export type ArduPilotVehicleType = 'copter' | 'plane' | 'rover' | 'sub';

/**
 * ArduPilot release tracks
 */
export type ArduPilotReleaseTrack = 'stable' | 'beta' | 'dev';

/**
 * ArduPilot SITL simulator type
 */
export type ArduPilotSimulatorType = 'jsbsim' | 'xplane' | 'none';

/**
 * ArduPilot SITL configuration
 */
export interface ArduPilotSitlConfig {
  /** Vehicle type (copter, plane, rover, sub) */
  vehicleType: ArduPilotVehicleType;
  /** Model/frame type (e.g., 'quad', '+', 'plane', 'quadplane') */
  model?: string;
  /** Release track (stable, beta, dev) */
  releaseTrack: ArduPilotReleaseTrack;
  /** Home location */
  homeLocation: {
    lat: number;
    lng: number;
    alt: number;
    heading: number;
  };
  /** Simulation speedup (1 = real-time, 2 = 2x, etc.) */
  speedup?: number;
  /** Wipe EEPROM on start */
  wipeOnStart?: boolean;
  /** Simulator type for physics */
  simulator?: ArduPilotSimulatorType;
  /** Simulator address (for X-Plane) */
  simAddress?: string;
  /** Default parameter file path */
  defaultsFile?: string;
  /**
   * Simulated battery resting voltage (V). Written to SIM_BATT_VOLTAGE in
   * the defaults overlay so the SITL battery model initializes correctly
   * at boot. Required because runtime PARAM_SET alone does not re-init the
   * simulated SOC. Omit to leave at firmware default (12.6V / 3S LiPo).
   */
  simBattVoltage?: number;
  /**
   * Simulated battery capacity (Ah). Written to SIM_BATT_CAP_AH alongside
   * voltage. Set 0 for unlimited (voltage never sags from drain), positive
   * for realistic decay. Omit to leave at firmware default.
   */
  simBattCapAh?: number;
  /**
   * Path to a user-authored JSON physics frame file. When set, SITL launches
   * with `--model <type>:<path>` overriding the built-in frame physics. The
   * type prefix (quad/hexa/octa) is derived from customFrameMotors.
   */
  customFramePath?: string;
  /**
   * Motor count of the custom frame. Used to pick the SITL --model type
   * prefix (4=quad, 6=hexa, 8=octa). Required when customFramePath is set.
   */
  customFrameMotors?: number;
}

/**
 * ArduPilot SITL process status
 */
export interface ArduPilotSitlStatus {
  isRunning: boolean;
  pid?: number;
  /** Command line used to start */
  command?: string;
  /** Vehicle type of running instance */
  vehicleType?: ArduPilotVehicleType;
  /** Port number SITL is listening on */
  tcpPort?: number;
}

/**
 * ArduPilot SITL exit data. `wasEarlyCrash` lets the renderer offer a
 * one-click "switch to dev track and retry" recovery without re-running
 * heuristics — main process knows when the process died unnaturally
 * during init.
 */
export interface ArduPilotSitlExitData {
  code: number | null;
  signal: string | null;
  uptimeMs?: number;
  wasEarlyCrash?: boolean;
  vehicleType?: ArduPilotVehicleType;
  model?: string;
  releaseTrack?: ArduPilotReleaseTrack;
}

/**
 * ArduPilot SITL download progress
 */
export interface ArduPilotSitlDownloadProgress {
  vehicleType: ArduPilotVehicleType;
  releaseTrack: ArduPilotReleaseTrack;
  progress: number;  // 0-100
  bytesDownloaded: number;
  totalBytes: number;
  status: 'preparing' | 'downloading' | 'extracting' | 'complete' | 'error';
  error?: string;
}

/**
 * ArduPilot SITL binary info
 */
export interface ArduPilotSitlBinaryInfo {
  vehicleType: ArduPilotVehicleType;
  releaseTrack: ArduPilotReleaseTrack;
  exists: boolean;
  path?: string;
  version?: string;
  downloadedAt?: string;
}

/**
 * UI grouping for the SITL frame picker. Mirrors the categories the main
 * process derives from frame names — kept as a string union so adding new
 * groupings doesn't require a coordinated renderer change.
 */
export type ArduPilotFrameCategory =
  | 'Multirotor' | 'Helicopter' | 'Plane' | 'Quadplane'
  | 'Tailsitter' | 'Rover' | 'Boat' | 'Sub' | 'Other';

/**
 * One frame entry returned by the main process. `defaultParamFiles` lists
 * the upstream `Tools/autotest/`-relative paths that will be stacked into
 * the binary's `--defaults` arg at launch time.
 */
export interface ArduPilotFrameInfo {
  value: string;
  label: string;
  vehicleType: ArduPilotVehicleType;
  category: ArduPilotFrameCategory;
  defaultParamFiles: string[];
}

/**
 * Result of listing frames. `source` tells the UI whether the data is fresh
 * from upstream, served from disk cache, or a hardcoded fallback when the
 * network is unreachable on first run.
 */
export interface ArduPilotFrameCatalog {
  frames: ArduPilotFrameInfo[];
  source: 'fresh' | 'cached' | 'fallback';
  fetchedAt?: string;
  error?: string;
}

// =============================================================================
// Update / Version Types
// =============================================================================

export type AppUpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

// =============================================================================
// MAVLink Signing Types
// =============================================================================

export interface SigningStatus {
  enabled: boolean;
  hasKey: boolean;
  sentToFc: boolean;
  /** First 6 bytes of key as hex for visual identification */
  keyFingerprint?: string;
  /** Full key as Base64 (matches Mission Planner display format) */
  keyBase64?: string;
  /** True when our key doesn't match the FC's signing key */
  keyMismatch?: boolean;
  /** All saved signing keys (fingerprint, label, associated FC system IDs) */
  savedKeys?: Array<{ fingerprint: string; label?: string; systemIds: number[] }>;
}

export interface AppUpdateInfo {
  status: AppUpdateStatus;
  currentVersion: string;
  canAutoUpdate: boolean;
  latestVersion?: string;
  releaseUrl?: string;
  releaseName?: string;
  publishedAt?: string;
  downloadProgress?: number; // 0-100
  bytesDownloaded?: number;
  totalBytes?: number;
  downloadSpeed?: number; // bytes per second
  error?: string;
}

/**
 * MAVLink STATUSTEXT severity levels (RFC-5424)
 */
export type StatusSeverity =
  | 'EMERGENCY'   // 0
  | 'ALERT'       // 1
  | 'CRITICAL'    // 2
  | 'ERROR'       // 3
  | 'WARNING'     // 4
  | 'NOTICE'      // 5
  | 'INFO'        // 6
  | 'DEBUG';      // 7

export const SEVERITY_LABELS: StatusSeverity[] = [
  'EMERGENCY', 'ALERT', 'CRITICAL', 'ERROR', 'WARNING', 'NOTICE', 'INFO', 'DEBUG',
];

/**
 * A MAVLink STATUSTEXT message received from the FC
 */
export interface StatusMessage {
  severity: number;
  severityLabel: StatusSeverity;
  text: string;
  timestamp: number;
  count: number;
}

/**
 * Telemetry stream speed preset
 * Controls MAVLink SET_MESSAGE_INTERVAL rates
 */
export type TelemetrySpeed = 'eco' | 'normal' | 'max';

// =============================================================================
// Tile Cache Types (Offline Maps)
// =============================================================================

export interface TileCacheStats {
  totalTiles: number;
  totalSizeBytes: number;
  layers: Record<string, { tiles: number; bytes: number }>;
}

export interface TileCacheDownloadProgress {
  downloadId: string;
  totalTiles: number;
  downloadedTiles: number;
  skippedTiles: number;
  failedTiles: number;
  bytesDownloaded: number;
  status: 'downloading' | 'complete' | 'cancelled';
}

export interface TileCacheSettings {
  maxCacheSizeGB: number;
  enableAutoCache: boolean;
  maxZoomAutoCache: number;
}

export interface TileCacheDownloadRegion {
  id: string;
  bounds: { north: number; south: number; east: number; west: number };
  minZoom: number;
  maxZoom: number;
  layers: string[];
  downloadedAt: number;
  tileCount: number;
}
