import type { MessageInfo } from '@ardudeck/mavlink-ts';

import { serializeHeartbeat, deserializeHeartbeat } from './messages/heartbeat.js';
import { serializeSysStatus, deserializeSysStatus } from './messages/sys-status.js';
import { serializeSystemTime, deserializeSystemTime } from './messages/system-time.js';
import { serializePing, deserializePing } from './messages/ping.js';
import { serializeChangeOperatorControl, deserializeChangeOperatorControl } from './messages/change-operator-control.js';
import { serializeChangeOperatorControlAck, deserializeChangeOperatorControlAck } from './messages/change-operator-control-ack.js';
import { serializeAuthKey, deserializeAuthKey } from './messages/auth-key.js';
import { serializeSetMode, deserializeSetMode } from './messages/set-mode.js';
import { serializeParamRequestRead, deserializeParamRequestRead } from './messages/param-request-read.js';
import { serializeParamRequestList, deserializeParamRequestList } from './messages/param-request-list.js';
import { serializeParamValue, deserializeParamValue } from './messages/param-value.js';
import { serializeParamSet, deserializeParamSet } from './messages/param-set.js';
import { serializeGpsRawInt, deserializeGpsRawInt } from './messages/gps-raw-int.js';
import { serializeGpsStatus, deserializeGpsStatus } from './messages/gps-status.js';
import { serializeScaledImu, deserializeScaledImu } from './messages/scaled-imu.js';
import { serializeRawImu, deserializeRawImu } from './messages/raw-imu.js';
import { serializeRawPressure, deserializeRawPressure } from './messages/raw-pressure.js';
import { serializeScaledPressure, deserializeScaledPressure } from './messages/scaled-pressure.js';
import { serializeAttitude, deserializeAttitude } from './messages/attitude.js';
import { serializeAttitudeQuaternion, deserializeAttitudeQuaternion } from './messages/attitude-quaternion.js';
import { serializeLocalPositionNed, deserializeLocalPositionNed } from './messages/local-position-ned.js';
import { serializeGlobalPositionInt, deserializeGlobalPositionInt } from './messages/global-position-int.js';
import { serializeRcChannelsScaled, deserializeRcChannelsScaled } from './messages/rc-channels-scaled.js';
import { serializeRcChannelsRaw, deserializeRcChannelsRaw } from './messages/rc-channels-raw.js';
import { serializeServoOutputRaw, deserializeServoOutputRaw } from './messages/servo-output-raw.js';
import { serializeMissionRequestPartialList, deserializeMissionRequestPartialList } from './messages/mission-request-partial-list.js';
import { serializeMissionWritePartialList, deserializeMissionWritePartialList } from './messages/mission-write-partial-list.js';
import { serializeMissionItem, deserializeMissionItem } from './messages/mission-item.js';
import { serializeMissionRequest, deserializeMissionRequest } from './messages/mission-request.js';
import { serializeMissionSetCurrent, deserializeMissionSetCurrent } from './messages/mission-set-current.js';
import { serializeMissionCurrent, deserializeMissionCurrent } from './messages/mission-current.js';
import { serializeMissionRequestList, deserializeMissionRequestList } from './messages/mission-request-list.js';
import { serializeMissionCount, deserializeMissionCount } from './messages/mission-count.js';
import { serializeMissionClearAll, deserializeMissionClearAll } from './messages/mission-clear-all.js';
import { serializeMissionItemReached, deserializeMissionItemReached } from './messages/mission-item-reached.js';
import { serializeMissionAck, deserializeMissionAck } from './messages/mission-ack.js';
import { serializeSetGpsGlobalOrigin, deserializeSetGpsGlobalOrigin } from './messages/set-gps-global-origin.js';
import { serializeGpsGlobalOrigin, deserializeGpsGlobalOrigin } from './messages/gps-global-origin.js';
import { serializeParamMapRc, deserializeParamMapRc } from './messages/param-map-rc.js';
import { serializeMissionRequestInt, deserializeMissionRequestInt } from './messages/mission-request-int.js';
import { serializeMissionChecksum, deserializeMissionChecksum } from './messages/mission-checksum.js';
import { serializeSafetySetAllowedArea, deserializeSafetySetAllowedArea } from './messages/safety-set-allowed-area.js';
import { serializeSafetyAllowedArea, deserializeSafetyAllowedArea } from './messages/safety-allowed-area.js';
import { serializeAttitudeQuaternionCov, deserializeAttitudeQuaternionCov } from './messages/attitude-quaternion-cov.js';
import { serializeNavControllerOutput, deserializeNavControllerOutput } from './messages/nav-controller-output.js';
import { serializeGlobalPositionIntCov, deserializeGlobalPositionIntCov } from './messages/global-position-int-cov.js';
import { serializeLocalPositionNedCov, deserializeLocalPositionNedCov } from './messages/local-position-ned-cov.js';
import { serializeRcChannels, deserializeRcChannels } from './messages/rc-channels.js';
import { serializeRequestDataStream, deserializeRequestDataStream } from './messages/request-data-stream.js';
import { serializeDataStream, deserializeDataStream } from './messages/data-stream.js';
import { serializeManualControl, deserializeManualControl } from './messages/manual-control.js';
import { serializeRcChannelsOverride, deserializeRcChannelsOverride } from './messages/rc-channels-override.js';
import { serializeMissionItemInt, deserializeMissionItemInt } from './messages/mission-item-int.js';
import { serializeVfrHud, deserializeVfrHud } from './messages/vfr-hud.js';
import { serializeCommandInt, deserializeCommandInt } from './messages/command-int.js';
import { serializeCommandLong, deserializeCommandLong } from './messages/command-long.js';
import { serializeCommandAck, deserializeCommandAck } from './messages/command-ack.js';
import { serializeManualSetpoint, deserializeManualSetpoint } from './messages/manual-setpoint.js';
import { serializeSetAttitudeTarget, deserializeSetAttitudeTarget } from './messages/set-attitude-target.js';
import { serializeAttitudeTarget, deserializeAttitudeTarget } from './messages/attitude-target.js';
import { serializeSetPositionTargetLocalNed, deserializeSetPositionTargetLocalNed } from './messages/set-position-target-local-ned.js';
import { serializePositionTargetLocalNed, deserializePositionTargetLocalNed } from './messages/position-target-local-ned.js';
import { serializeSetPositionTargetGlobalInt, deserializeSetPositionTargetGlobalInt } from './messages/set-position-target-global-int.js';
import { serializePositionTargetGlobalInt, deserializePositionTargetGlobalInt } from './messages/position-target-global-int.js';
import { serializeLocalPositionNedSystemGlobalOffset, deserializeLocalPositionNedSystemGlobalOffset } from './messages/local-position-ned-system-global-offset.js';
import { serializeHilState, deserializeHilState } from './messages/hil-state.js';
import { serializeHilControls, deserializeHilControls } from './messages/hil-controls.js';
import { serializeHilRcInputsRaw, deserializeHilRcInputsRaw } from './messages/hil-rc-inputs-raw.js';
import { serializeHilActuatorControls, deserializeHilActuatorControls } from './messages/hil-actuator-controls.js';
import { serializeOpticalFlow, deserializeOpticalFlow } from './messages/optical-flow.js';
import { serializeGlobalVisionPositionEstimate, deserializeGlobalVisionPositionEstimate } from './messages/global-vision-position-estimate.js';
import { serializeVisionPositionEstimate, deserializeVisionPositionEstimate } from './messages/vision-position-estimate.js';
import { serializeVisionSpeedEstimate, deserializeVisionSpeedEstimate } from './messages/vision-speed-estimate.js';
import { serializeViconPositionEstimate, deserializeViconPositionEstimate } from './messages/vicon-position-estimate.js';
import { serializeHighresImu, deserializeHighresImu } from './messages/highres-imu.js';
import { serializeOpticalFlowRad, deserializeOpticalFlowRad } from './messages/optical-flow-rad.js';
import { serializeHilSensor, deserializeHilSensor } from './messages/hil-sensor.js';
import { serializeSimState, deserializeSimState } from './messages/sim-state.js';
import { serializeRadioStatus, deserializeRadioStatus } from './messages/radio-status.js';
import { serializeFileTransferProtocol, deserializeFileTransferProtocol } from './messages/file-transfer-protocol.js';
import { serializeTimesync, deserializeTimesync } from './messages/timesync.js';
import { serializeCameraTrigger, deserializeCameraTrigger } from './messages/camera-trigger.js';
import { serializeHilGps, deserializeHilGps } from './messages/hil-gps.js';
import { serializeHilOpticalFlow, deserializeHilOpticalFlow } from './messages/hil-optical-flow.js';
import { serializeHilStateQuaternion, deserializeHilStateQuaternion } from './messages/hil-state-quaternion.js';
import { serializeScaledImu2, deserializeScaledImu2 } from './messages/scaled-imu2.js';
import { serializeLogRequestList, deserializeLogRequestList } from './messages/log-request-list.js';
import { serializeLogEntry, deserializeLogEntry } from './messages/log-entry.js';
import { serializeLogRequestData, deserializeLogRequestData } from './messages/log-request-data.js';
import { serializeLogData, deserializeLogData } from './messages/log-data.js';
import { serializeLogErase, deserializeLogErase } from './messages/log-erase.js';
import { serializeLogRequestEnd, deserializeLogRequestEnd } from './messages/log-request-end.js';
import { serializeGpsInjectData, deserializeGpsInjectData } from './messages/gps-inject-data.js';
import { serializeGps2Raw, deserializeGps2Raw } from './messages/gps2-raw.js';
import { serializePowerStatus, deserializePowerStatus } from './messages/power-status.js';
import { serializeSerialControl, deserializeSerialControl } from './messages/serial-control.js';
import { serializeGpsRtk, deserializeGpsRtk } from './messages/gps-rtk.js';
import { serializeGps2Rtk, deserializeGps2Rtk } from './messages/gps2-rtk.js';
import { serializeScaledImu3, deserializeScaledImu3 } from './messages/scaled-imu3.js';
import { serializeDataTransmissionHandshake, deserializeDataTransmissionHandshake } from './messages/data-transmission-handshake.js';
import { serializeEncapsulatedData, deserializeEncapsulatedData } from './messages/encapsulated-data.js';
import { serializeDistanceSensor, deserializeDistanceSensor } from './messages/distance-sensor.js';
import { serializeTerrainRequest, deserializeTerrainRequest } from './messages/terrain-request.js';
import { serializeTerrainData, deserializeTerrainData } from './messages/terrain-data.js';
import { serializeTerrainCheck, deserializeTerrainCheck } from './messages/terrain-check.js';
import { serializeTerrainReport, deserializeTerrainReport } from './messages/terrain-report.js';
import { serializeScaledPressure2, deserializeScaledPressure2 } from './messages/scaled-pressure2.js';
import { serializeAttPosMocap, deserializeAttPosMocap } from './messages/att-pos-mocap.js';
import { serializeSetActuatorControlTarget, deserializeSetActuatorControlTarget } from './messages/set-actuator-control-target.js';
import { serializeActuatorControlTarget, deserializeActuatorControlTarget } from './messages/actuator-control-target.js';
import { serializeAltitude, deserializeAltitude } from './messages/altitude.js';
import { serializeResourceRequest, deserializeResourceRequest } from './messages/resource-request.js';
import { serializeScaledPressure3, deserializeScaledPressure3 } from './messages/scaled-pressure3.js';
import { serializeFollowTarget, deserializeFollowTarget } from './messages/follow-target.js';
import { serializeControlSystemState, deserializeControlSystemState } from './messages/control-system-state.js';
import { serializeBatteryStatus, deserializeBatteryStatus } from './messages/battery-status.js';
import { serializeAutopilotVersion, deserializeAutopilotVersion } from './messages/autopilot-version.js';
import { serializeLandingTarget, deserializeLandingTarget } from './messages/landing-target.js';
import { serializeFlexifunctionSet, deserializeFlexifunctionSet } from './messages/flexifunction-set.js';
import { serializeFlexifunctionReadReq, deserializeFlexifunctionReadReq } from './messages/flexifunction-read-req.js';
import { serializeFlexifunctionBufferFunction, deserializeFlexifunctionBufferFunction } from './messages/flexifunction-buffer-function.js';
import { serializeFlexifunctionBufferFunctionAck, deserializeFlexifunctionBufferFunctionAck } from './messages/flexifunction-buffer-function-ack.js';
import { serializeDigicamConfigure, deserializeDigicamConfigure } from './messages/digicam-configure.js';
import { serializeFlexifunctionDirectory, deserializeFlexifunctionDirectory } from './messages/flexifunction-directory.js';
import { serializeFlexifunctionDirectoryAck, deserializeFlexifunctionDirectoryAck } from './messages/flexifunction-directory-ack.js';
import { serializeFlexifunctionCommand, deserializeFlexifunctionCommand } from './messages/flexifunction-command.js';
import { serializeFlexifunctionCommandAck, deserializeFlexifunctionCommandAck } from './messages/flexifunction-command-ack.js';
import { serializeFencePoint, deserializeFencePoint } from './messages/fence-point.js';
import { serializeFenceFetchPoint, deserializeFenceFetchPoint } from './messages/fence-fetch-point.js';
import { serializeFenceStatus, deserializeFenceStatus } from './messages/fence-status.js';
import { serializeAhrs, deserializeAhrs } from './messages/ahrs.js';
import { serializeSimstate, deserializeSimstate } from './messages/simstate.js';
import { serializeHwstatus, deserializeHwstatus } from './messages/hwstatus.js';
import { serializeRadio, deserializeRadio } from './messages/radio.js';
import { serializeLimitsStatus, deserializeLimitsStatus } from './messages/limits-status.js';
import { serializeWind, deserializeWind } from './messages/wind.js';
import { serializeData16, deserializeData16 } from './messages/data16.js';
import { serializeSerialUdbExtraF2A, deserializeSerialUdbExtraF2A } from './messages/serial-udb-extra-f2-a.js';
import { serializeSerialUdbExtraF2B, deserializeSerialUdbExtraF2B } from './messages/serial-udb-extra-f2-b.js';
import { serializeSerialUdbExtraF4, deserializeSerialUdbExtraF4 } from './messages/serial-udb-extra-f4.js';
import { serializeSerialUdbExtraF5, deserializeSerialUdbExtraF5 } from './messages/serial-udb-extra-f5.js';
import { serializeSerialUdbExtraF6, deserializeSerialUdbExtraF6 } from './messages/serial-udb-extra-f6.js';
import { serializeSerialUdbExtraF7, deserializeSerialUdbExtraF7 } from './messages/serial-udb-extra-f7.js';
import { serializeSerialUdbExtraF8, deserializeSerialUdbExtraF8 } from './messages/serial-udb-extra-f8.js';
import { serializeSerialUdbExtraF13, deserializeSerialUdbExtraF13 } from './messages/serial-udb-extra-f13.js';
import { serializeSerialUdbExtraF14, deserializeSerialUdbExtraF14 } from './messages/serial-udb-extra-f14.js';
import { serializeSerialUdbExtraF15, deserializeSerialUdbExtraF15 } from './messages/serial-udb-extra-f15.js';
import { serializeScriptItem, deserializeScriptItem } from './messages/script-item.js';
import { serializeScriptRequest, deserializeScriptRequest } from './messages/script-request.js';
import { serializeScriptRequestList, deserializeScriptRequestList } from './messages/script-request-list.js';
import { serializeScriptCount, deserializeScriptCount } from './messages/script-count.js';
import { serializeScriptCurrent, deserializeScriptCurrent } from './messages/script-current.js';
import { serializeSerialUdbExtraF19, deserializeSerialUdbExtraF19 } from './messages/serial-udb-extra-f19.js';
import { serializeSerialUdbExtraF20, deserializeSerialUdbExtraF20 } from './messages/serial-udb-extra-f20.js';
import { serializeSerialUdbExtraF21, deserializeSerialUdbExtraF21 } from './messages/serial-udb-extra-f21.js';
import { serializeSerialUdbExtraF22, deserializeSerialUdbExtraF22 } from './messages/serial-udb-extra-f22.js';
import { serializeMagCalProgress, deserializeMagCalProgress } from './messages/mag-cal-progress.js';
import { serializeMagCalReport, deserializeMagCalReport } from './messages/mag-cal-report.js';
import { serializeEkfStatusReport, deserializeEkfStatusReport } from './messages/ekf-status-report.js';
import { serializePidTuning, deserializePidTuning } from './messages/pid-tuning.js';
import { serializeDeepstall, deserializeDeepstall } from './messages/deepstall.js';
import { serializeGimbalReport, deserializeGimbalReport } from './messages/gimbal-report.js';
import { serializeGimbalControl, deserializeGimbalControl } from './messages/gimbal-control.js';
import { serializeGimbalTorqueCmdReport, deserializeGimbalTorqueCmdReport } from './messages/gimbal-torque-cmd-report.js';
import { serializeGoproHeartbeat, deserializeGoproHeartbeat } from './messages/gopro-heartbeat.js';
import { serializeGoproGetRequest, deserializeGoproGetRequest } from './messages/gopro-get-request.js';
import { serializeGoproGetResponse, deserializeGoproGetResponse } from './messages/gopro-get-response.js';
import { serializeGoproSetRequest, deserializeGoproSetRequest } from './messages/gopro-set-request.js';
import { serializeGoproSetResponse, deserializeGoproSetResponse } from './messages/gopro-set-response.js';
import { serializeNavFilterBias, deserializeNavFilterBias } from './messages/nav-filter-bias.js';
import { serializeRadioCalibration, deserializeRadioCalibration } from './messages/radio-calibration.js';
import { serializeUalbertaSysStatus, deserializeUalbertaSysStatus } from './messages/ualberta-sys-status.js';
import { serializeCommandIntStamped, deserializeCommandIntStamped } from './messages/command-int-stamped.js';
import { serializeCommandLongStamped, deserializeCommandLongStamped } from './messages/command-long-stamped.js';
import { serializeEfiStatus, deserializeEfiStatus } from './messages/efi-status.js';
import { serializeRpm, deserializeRpm } from './messages/rpm.js';
import { serializeEstimatorStatus, deserializeEstimatorStatus } from './messages/estimator-status.js';
import { serializeWindCov, deserializeWindCov } from './messages/wind-cov.js';
import { serializeGpsInput, deserializeGpsInput } from './messages/gps-input.js';
import { serializeGpsRtcmData, deserializeGpsRtcmData } from './messages/gps-rtcm-data.js';
import { serializeHighLatency, deserializeHighLatency } from './messages/high-latency.js';
import { serializeHighLatency2, deserializeHighLatency2 } from './messages/high-latency2.js';
import { serializeVibration, deserializeVibration } from './messages/vibration.js';
import { serializeHomePosition, deserializeHomePosition } from './messages/home-position.js';
import { serializeSetHomePosition, deserializeSetHomePosition } from './messages/set-home-position.js';
import { serializeMessageInterval, deserializeMessageInterval } from './messages/message-interval.js';
import { serializeExtendedSysState, deserializeExtendedSysState } from './messages/extended-sys-state.js';
import { serializeAdsbVehicle, deserializeAdsbVehicle } from './messages/adsb-vehicle.js';
import { serializeCollision, deserializeCollision } from './messages/collision.js';
import { serializeV2Extension, deserializeV2Extension } from './messages/v2-extension.js';
import { serializeMemoryVect, deserializeMemoryVect } from './messages/memory-vect.js';
import { serializeDebugVect, deserializeDebugVect } from './messages/debug-vect.js';
import { serializeNamedValueFloat, deserializeNamedValueFloat } from './messages/named-value-float.js';
import { serializeNamedValueInt, deserializeNamedValueInt } from './messages/named-value-int.js';
import { serializeStatustext, deserializeStatustext } from './messages/statustext.js';
import { serializeDebug, deserializeDebug } from './messages/debug.js';
import { serializeSetupSigning, deserializeSetupSigning } from './messages/setup-signing.js';
import { serializeButtonChange, deserializeButtonChange } from './messages/button-change.js';
import { serializePlayTune, deserializePlayTune } from './messages/play-tune.js';
import { serializeCameraInformation, deserializeCameraInformation } from './messages/camera-information.js';
import { serializeCameraSettings, deserializeCameraSettings } from './messages/camera-settings.js';
import { serializeStorageInformation, deserializeStorageInformation } from './messages/storage-information.js';
import { serializeCameraCaptureStatus, deserializeCameraCaptureStatus } from './messages/camera-capture-status.js';
import { serializeCameraImageCaptured, deserializeCameraImageCaptured } from './messages/camera-image-captured.js';
import { serializeFlightInformation, deserializeFlightInformation } from './messages/flight-information.js';
import { serializeMountOrientation, deserializeMountOrientation } from './messages/mount-orientation.js';
import { serializeLoggingData, deserializeLoggingData } from './messages/logging-data.js';
import { serializeLoggingDataAcked, deserializeLoggingDataAcked } from './messages/logging-data-acked.js';
import { serializeLoggingAck, deserializeLoggingAck } from './messages/logging-ack.js';
import { serializeVideoStreamInformation, deserializeVideoStreamInformation } from './messages/video-stream-information.js';
import { serializeVideoStreamStatus, deserializeVideoStreamStatus } from './messages/video-stream-status.js';
import { serializeCameraFovStatus, deserializeCameraFovStatus } from './messages/camera-fov-status.js';
import { serializeCameraTrackingImageStatus, deserializeCameraTrackingImageStatus } from './messages/camera-tracking-image-status.js';
import { serializeCameraTrackingGeoStatus, deserializeCameraTrackingGeoStatus } from './messages/camera-tracking-geo-status.js';
import { serializeCameraThermalRange, deserializeCameraThermalRange } from './messages/camera-thermal-range.js';
import { serializeGimbalManagerInformation, deserializeGimbalManagerInformation } from './messages/gimbal-manager-information.js';
import { serializeGimbalManagerStatus, deserializeGimbalManagerStatus } from './messages/gimbal-manager-status.js';
import { serializeGimbalManagerSetAttitude, deserializeGimbalManagerSetAttitude } from './messages/gimbal-manager-set-attitude.js';
import { serializeGimbalDeviceInformation, deserializeGimbalDeviceInformation } from './messages/gimbal-device-information.js';
import { serializeGimbalDeviceSetAttitude, deserializeGimbalDeviceSetAttitude } from './messages/gimbal-device-set-attitude.js';
import { serializeGimbalDeviceAttitudeStatus, deserializeGimbalDeviceAttitudeStatus } from './messages/gimbal-device-attitude-status.js';
import { serializeAutopilotStateForGimbalDevice, deserializeAutopilotStateForGimbalDevice } from './messages/autopilot-state-for-gimbal-device.js';
import { serializeGimbalManagerSetPitchyaw, deserializeGimbalManagerSetPitchyaw } from './messages/gimbal-manager-set-pitchyaw.js';
import { serializeGimbalManagerSetManualControl, deserializeGimbalManagerSetManualControl } from './messages/gimbal-manager-set-manual-control.js';
import { serializeAirspeed, deserializeAirspeed } from './messages/airspeed.js';
import { serializeWifiConfigAp, deserializeWifiConfigAp } from './messages/wifi-config-ap.js';
import { serializeAisVessel, deserializeAisVessel } from './messages/ais-vessel.js';
import { serializeUavcanNodeStatus, deserializeUavcanNodeStatus } from './messages/uavcan-node-status.js';
import { serializeUavcanNodeInfo, deserializeUavcanNodeInfo } from './messages/uavcan-node-info.js';
import { serializeParamExtRequestRead, deserializeParamExtRequestRead } from './messages/param-ext-request-read.js';
import { serializeParamExtRequestList, deserializeParamExtRequestList } from './messages/param-ext-request-list.js';
import { serializeParamExtValue, deserializeParamExtValue } from './messages/param-ext-value.js';
import { serializeParamExtSet, deserializeParamExtSet } from './messages/param-ext-set.js';
import { serializeParamExtAck, deserializeParamExtAck } from './messages/param-ext-ack.js';
import { serializeObstacleDistance, deserializeObstacleDistance } from './messages/obstacle-distance.js';
import { serializeOdometry, deserializeOdometry } from './messages/odometry.js';
import { serializeTrajectoryRepresentationWaypoints, deserializeTrajectoryRepresentationWaypoints } from './messages/trajectory-representation-waypoints.js';
import { serializeTrajectoryRepresentationBezier, deserializeTrajectoryRepresentationBezier } from './messages/trajectory-representation-bezier.js';
import { serializeIsbdLinkStatus, deserializeIsbdLinkStatus } from './messages/isbd-link-status.js';
import { serializeRawRpm, deserializeRawRpm } from './messages/raw-rpm.js';
import { serializeUtmGlobalPosition, deserializeUtmGlobalPosition } from './messages/utm-global-position.js';
import { serializeParamError, deserializeParamError } from './messages/param-error.js';
import { serializeDebugFloatArray, deserializeDebugFloatArray } from './messages/debug-float-array.js';
import { serializeSmartBatteryInfo, deserializeSmartBatteryInfo } from './messages/smart-battery-info.js';
import { serializeGeneratorStatus, deserializeGeneratorStatus } from './messages/generator-status.js';
import { serializeActuatorOutputStatus, deserializeActuatorOutputStatus } from './messages/actuator-output-status.js';
import { serializeRelayStatus, deserializeRelayStatus } from './messages/relay-status.js';
import { serializeTunnel, deserializeTunnel } from './messages/tunnel.js';
import { serializeCanFrame, deserializeCanFrame } from './messages/can-frame.js';
import { serializeCanfdFrame, deserializeCanfdFrame } from './messages/canfd-frame.js';
import { serializeCanFilterModify, deserializeCanFilterModify } from './messages/can-filter-modify.js';
import { serializeRadioRcChannels, deserializeRadioRcChannels } from './messages/radio-rc-channels.js';
import { serializeAvailableModes, deserializeAvailableModes } from './messages/available-modes.js';
import { serializeCurrentMode, deserializeCurrentMode } from './messages/current-mode.js';
import { serializeAvailableModesMonitor, deserializeAvailableModesMonitor } from './messages/available-modes-monitor.js';
import { serializeGnssIntegrity, deserializeGnssIntegrity } from './messages/gnss-integrity.js';
import { serializeSensPower, deserializeSensPower } from './messages/sens-power.js';
import { serializeSensMppt, deserializeSensMppt } from './messages/sens-mppt.js';
import { serializeAslctrlData, deserializeAslctrlData } from './messages/aslctrl-data.js';
import { serializeAslctrlDebug, deserializeAslctrlDebug } from './messages/aslctrl-debug.js';
import { serializeAsluavStatus, deserializeAsluavStatus } from './messages/asluav-status.js';
import { serializeEkfExt, deserializeEkfExt } from './messages/ekf-ext.js';
import { serializeAslObctrl, deserializeAslObctrl } from './messages/asl-obctrl.js';
import { serializeSensAtmos, deserializeSensAtmos } from './messages/sens-atmos.js';
import { serializeSensBatmon, deserializeSensBatmon } from './messages/sens-batmon.js';
import { serializeFwSoaringData, deserializeFwSoaringData } from './messages/fw-soaring-data.js';
import { serializeSensorpodStatus, deserializeSensorpodStatus } from './messages/sensorpod-status.js';
import { serializeSensPowerBoard, deserializeSensPowerBoard } from './messages/sens-power-board.js';
import { serializeGsmLinkStatus, deserializeGsmLinkStatus } from './messages/gsm-link-status.js';
import { serializeSatcomLinkStatus, deserializeSatcomLinkStatus } from './messages/satcom-link-status.js';
import { serializeSensorAirflowAngles, deserializeSensorAirflowAngles } from './messages/sensor-airflow-angles.js';
import { serializeWheelDistance, deserializeWheelDistance } from './messages/wheel-distance.js';
import { serializeWinchStatus, deserializeWinchStatus } from './messages/winch-status.js';
import { serializeUavionixAdsbOutCfg, deserializeUavionixAdsbOutCfg } from './messages/uavionix-adsb-out-cfg.js';
import { serializeUavionixAdsbOutDynamic, deserializeUavionixAdsbOutDynamic } from './messages/uavionix-adsb-out-dynamic.js';
import { serializeUavionixAdsbTransceiverHealthReport, deserializeUavionixAdsbTransceiverHealthReport } from './messages/uavionix-adsb-transceiver-health-report.js';
import { serializeUavionixAdsbOutCfgRegistration, deserializeUavionixAdsbOutCfgRegistration } from './messages/uavionix-adsb-out-cfg-registration.js';
import { serializeUavionixAdsbOutCfgFlightid, deserializeUavionixAdsbOutCfgFlightid } from './messages/uavionix-adsb-out-cfg-flightid.js';
import { serializeUavionixAdsbGet, deserializeUavionixAdsbGet } from './messages/uavionix-adsb-get.js';
import { serializeUavionixAdsbOutControl, deserializeUavionixAdsbOutControl } from './messages/uavionix-adsb-out-control.js';
import { serializeUavionixAdsbOutStatus, deserializeUavionixAdsbOutStatus } from './messages/uavionix-adsb-out-status.js';
import { serializeLoweheiserGovEfi, deserializeLoweheiserGovEfi } from './messages/loweheiser-gov-efi.js';
import { serializeDeviceOpRead, deserializeDeviceOpRead } from './messages/device-op-read.js';
import { serializeDeviceOpReadReply, deserializeDeviceOpReadReply } from './messages/device-op-read-reply.js';
import { serializeDeviceOpWrite, deserializeDeviceOpWrite } from './messages/device-op-write.js';
import { serializeDeviceOpWriteReply, deserializeDeviceOpWriteReply } from './messages/device-op-write-reply.js';
import { serializeSecureCommand, deserializeSecureCommand } from './messages/secure-command.js';
import { serializeSecureCommandReply, deserializeSecureCommandReply } from './messages/secure-command-reply.js';
import { serializeAdapTuning, deserializeAdapTuning } from './messages/adap-tuning.js';
import { serializeVisionPositionDelta, deserializeVisionPositionDelta } from './messages/vision-position-delta.js';
import { serializeAoaSsa, deserializeAoaSsa } from './messages/aoa-ssa.js';
import { serializeEscTelemetry1To4, deserializeEscTelemetry1To4 } from './messages/esc-telemetry-1-to-4.js';
import { serializeEscTelemetry5To8, deserializeEscTelemetry5To8 } from './messages/esc-telemetry-5-to-8.js';
import { serializeEscTelemetry9To12, deserializeEscTelemetry9To12 } from './messages/esc-telemetry-9-to-12.js';
import { serializeOsdParamConfig, deserializeOsdParamConfig } from './messages/osd-param-config.js';
import { serializeOsdParamConfigReply, deserializeOsdParamConfigReply } from './messages/osd-param-config-reply.js';
import { serializeOsdParamShowConfig, deserializeOsdParamShowConfig } from './messages/osd-param-show-config.js';
import { serializeOsdParamShowConfigReply, deserializeOsdParamShowConfigReply } from './messages/osd-param-show-config-reply.js';
import { serializeObstacleDistance3d, deserializeObstacleDistance3d } from './messages/obstacle-distance-3d.js';
import { serializeWaterDepth, deserializeWaterDepth } from './messages/water-depth.js';
import { serializeMcuStatus, deserializeMcuStatus } from './messages/mcu-status.js';
import { serializeEscTelemetry13To16, deserializeEscTelemetry13To16 } from './messages/esc-telemetry-13-to-16.js';
import { serializeEscTelemetry17To20, deserializeEscTelemetry17To20 } from './messages/esc-telemetry-17-to-20.js';
import { serializeEscTelemetry21To24, deserializeEscTelemetry21To24 } from './messages/esc-telemetry-21-to-24.js';
import { serializeEscTelemetry25To28, deserializeEscTelemetry25To28 } from './messages/esc-telemetry-25-to-28.js';
import { serializeEscTelemetry29To32, deserializeEscTelemetry29To32 } from './messages/esc-telemetry-29-to-32.js';
import { serializeNamedValueString, deserializeNamedValueString } from './messages/named-value-string.js';
import { serializeOpenDroneIdBasicId, deserializeOpenDroneIdBasicId } from './messages/open-drone-id-basic-id.js';
import { serializeOpenDroneIdLocation, deserializeOpenDroneIdLocation } from './messages/open-drone-id-location.js';
import { serializeOpenDroneIdAuthentication, deserializeOpenDroneIdAuthentication } from './messages/open-drone-id-authentication.js';
import { serializeOpenDroneIdSelfId, deserializeOpenDroneIdSelfId } from './messages/open-drone-id-self-id.js';
import { serializeOpenDroneIdSystem, deserializeOpenDroneIdSystem } from './messages/open-drone-id-system.js';
import { serializeOpenDroneIdOperatorId, deserializeOpenDroneIdOperatorId } from './messages/open-drone-id-operator-id.js';
import { serializeOpenDroneIdMessagePack, deserializeOpenDroneIdMessagePack } from './messages/open-drone-id-message-pack.js';
import { serializeOpenDroneIdArmStatus, deserializeOpenDroneIdArmStatus } from './messages/open-drone-id-arm-status.js';
import { serializeOpenDroneIdSystemUpdate, deserializeOpenDroneIdSystemUpdate } from './messages/open-drone-id-system-update.js';
import { serializeHygrometerSensor, deserializeHygrometerSensor } from './messages/hygrometer-sensor.js';
import { serializeTestTypes, deserializeTestTypes } from './messages/test-types.js';
import { serializeArrayTest0, deserializeArrayTest0 } from './messages/array-test-0.js';
import { serializeArrayTest1, deserializeArrayTest1 } from './messages/array-test-1.js';
import { serializeArrayTest3, deserializeArrayTest3 } from './messages/array-test-3.js';
import { serializeArrayTest4, deserializeArrayTest4 } from './messages/array-test-4.js';
import { serializeArrayTest5, deserializeArrayTest5 } from './messages/array-test-5.js';
import { serializeArrayTest6, deserializeArrayTest6 } from './messages/array-test-6.js';
import { serializeArrayTest7, deserializeArrayTest7 } from './messages/array-test-7.js';
import { serializeArrayTest8, deserializeArrayTest8 } from './messages/array-test-8.js';
import { serializeZvideoStreamInformation, deserializeZvideoStreamInformation } from './messages/zvideo-stream-information.js';
import { serializeIcarousHeartbeat, deserializeIcarousHeartbeat } from './messages/icarous-heartbeat.js';
import { serializeIcarousKinematicBands, deserializeIcarousKinematicBands } from './messages/icarous-kinematic-bands.js';
import { serializeCubepilotRawRc, deserializeCubepilotRawRc } from './messages/cubepilot-raw-rc.js';
import { serializeHerelinkVideoStreamInformation, deserializeHerelinkVideoStreamInformation } from './messages/herelink-video-stream-information.js';
import { serializeHerelinkTelem, deserializeHerelinkTelem } from './messages/herelink-telem.js';
import { serializeCubepilotFirmwareUpdateStart, deserializeCubepilotFirmwareUpdateStart } from './messages/cubepilot-firmware-update-start.js';
import { serializeCubepilotFirmwareUpdateResp, deserializeCubepilotFirmwareUpdateResp } from './messages/cubepilot-firmware-update-resp.js';
import { serializeAirlinkAuth, deserializeAirlinkAuth } from './messages/airlink-auth.js';
import { serializeAirlinkAuthResponse, deserializeAirlinkAuthResponse } from './messages/airlink-auth-response.js';
import { serializeAutopilotStateForGimbalDeviceExt, deserializeAutopilotStateForGimbalDeviceExt } from './messages/autopilot-state-for-gimbal-device-ext.js';
import { serializeStorm32GimbalManagerInformation, deserializeStorm32GimbalManagerInformation } from './messages/storm32-gimbal-manager-information.js';
import { serializeStorm32GimbalManagerStatus, deserializeStorm32GimbalManagerStatus } from './messages/storm32-gimbal-manager-status.js';
import { serializeStorm32GimbalManagerControl, deserializeStorm32GimbalManagerControl } from './messages/storm32-gimbal-manager-control.js';
import { serializeStorm32GimbalManagerControlPitchyaw, deserializeStorm32GimbalManagerControlPitchyaw } from './messages/storm32-gimbal-manager-control-pitchyaw.js';
import { serializeStorm32GimbalManagerCorrectRoll, deserializeStorm32GimbalManagerCorrectRoll } from './messages/storm32-gimbal-manager-correct-roll.js';
import { serializeQshotStatus, deserializeQshotStatus } from './messages/qshot-status.js';
import { serializeFrskyPassthroughArray, deserializeFrskyPassthroughArray } from './messages/frsky-passthrough-array.js';
import { serializeParamValueArray, deserializeParamValueArray } from './messages/param-value-array.js';
import { serializeMlrsRadioLinkStats, deserializeMlrsRadioLinkStats } from './messages/mlrs-radio-link-stats.js';
import { serializeMlrsRadioLinkInformation, deserializeMlrsRadioLinkInformation } from './messages/mlrs-radio-link-information.js';
import { serializeMlrsRadioLinkFlowControl, deserializeMlrsRadioLinkFlowControl } from './messages/mlrs-radio-link-flow-control.js';
import { serializeAvssPrsSysStatus, deserializeAvssPrsSysStatus } from './messages/avss-prs-sys-status.js';
import { serializeAvssDronePosition, deserializeAvssDronePosition } from './messages/avss-drone-position.js';
import { serializeAvssDroneImu, deserializeAvssDroneImu } from './messages/avss-drone-imu.js';
import { serializeAvssDroneOperationMode, deserializeAvssDroneOperationMode } from './messages/avss-drone-operation-mode.js';

/**
 * Message info registry
 * Maps message IDs to their metadata and serialization functions
 */
export const MESSAGE_REGISTRY: Map<number, MessageInfo> = new Map([
  [0, {
    msgid: 0,
    name: 'HEARTBEAT',
    crcExtra: 239,
    minLength: 9,
    maxLength: 9,
    serialize: serializeHeartbeat as (msg: unknown) => Uint8Array,
    deserialize: deserializeHeartbeat as (payload: Uint8Array) => unknown,
  }],
  [1, {
    msgid: 1,
    name: 'SYS_STATUS',
    crcExtra: 124,
    minLength: 31,
    maxLength: 31,
    serialize: serializeSysStatus as (msg: unknown) => Uint8Array,
    deserialize: deserializeSysStatus as (payload: Uint8Array) => unknown,
  }],
  [2, {
    msgid: 2,
    name: 'SYSTEM_TIME',
    crcExtra: 137,
    minLength: 12,
    maxLength: 12,
    serialize: serializeSystemTime as (msg: unknown) => Uint8Array,
    deserialize: deserializeSystemTime as (payload: Uint8Array) => unknown,
  }],
  [4, {
    msgid: 4,
    name: 'PING',
    crcExtra: 237,
    minLength: 14,
    maxLength: 14,
    serialize: serializePing as (msg: unknown) => Uint8Array,
    deserialize: deserializePing as (payload: Uint8Array) => unknown,
  }],
  [5, {
    msgid: 5,
    name: 'CHANGE_OPERATOR_CONTROL',
    crcExtra: 217,
    minLength: 28,
    maxLength: 28,
    serialize: serializeChangeOperatorControl as (msg: unknown) => Uint8Array,
    deserialize: deserializeChangeOperatorControl as (payload: Uint8Array) => unknown,
  }],
  [6, {
    msgid: 6,
    name: 'CHANGE_OPERATOR_CONTROL_ACK',
    crcExtra: 104,
    minLength: 3,
    maxLength: 3,
    serialize: serializeChangeOperatorControlAck as (msg: unknown) => Uint8Array,
    deserialize: deserializeChangeOperatorControlAck as (payload: Uint8Array) => unknown,
  }],
  [7, {
    msgid: 7,
    name: 'AUTH_KEY',
    crcExtra: 119,
    minLength: 32,
    maxLength: 32,
    serialize: serializeAuthKey as (msg: unknown) => Uint8Array,
    deserialize: deserializeAuthKey as (payload: Uint8Array) => unknown,
  }],
  [11, {
    msgid: 11,
    name: 'SET_MODE',
    crcExtra: 89,
    minLength: 6,
    maxLength: 6,
    serialize: serializeSetMode as (msg: unknown) => Uint8Array,
    deserialize: deserializeSetMode as (payload: Uint8Array) => unknown,
  }],
  [20, {
    msgid: 20,
    name: 'PARAM_REQUEST_READ',
    crcExtra: 214,
    minLength: 20,
    maxLength: 20,
    serialize: serializeParamRequestRead as (msg: unknown) => Uint8Array,
    deserialize: deserializeParamRequestRead as (payload: Uint8Array) => unknown,
  }],
  [21, {
    msgid: 21,
    name: 'PARAM_REQUEST_LIST',
    crcExtra: 159,
    minLength: 2,
    maxLength: 2,
    serialize: serializeParamRequestList as (msg: unknown) => Uint8Array,
    deserialize: deserializeParamRequestList as (payload: Uint8Array) => unknown,
  }],
  [22, {
    msgid: 22,
    name: 'PARAM_VALUE',
    crcExtra: 220,
    minLength: 25,
    maxLength: 25,
    serialize: serializeParamValue as (msg: unknown) => Uint8Array,
    deserialize: deserializeParamValue as (payload: Uint8Array) => unknown,
  }],
  [23, {
    msgid: 23,
    name: 'PARAM_SET',
    crcExtra: 168,
    minLength: 23,
    maxLength: 23,
    serialize: serializeParamSet as (msg: unknown) => Uint8Array,
    deserialize: deserializeParamSet as (payload: Uint8Array) => unknown,
  }],
  [24, {
    msgid: 24,
    name: 'GPS_RAW_INT',
    crcExtra: 103,
    minLength: 52,
    maxLength: 52,
    serialize: serializeGpsRawInt as (msg: unknown) => Uint8Array,
    deserialize: deserializeGpsRawInt as (payload: Uint8Array) => unknown,
  }],
  [25, {
    msgid: 25,
    name: 'GPS_STATUS',
    crcExtra: 23,
    minLength: 101,
    maxLength: 101,
    serialize: serializeGpsStatus as (msg: unknown) => Uint8Array,
    deserialize: deserializeGpsStatus as (payload: Uint8Array) => unknown,
  }],
  [26, {
    msgid: 26,
    name: 'SCALED_IMU',
    crcExtra: 48,
    minLength: 24,
    maxLength: 24,
    serialize: serializeScaledImu as (msg: unknown) => Uint8Array,
    deserialize: deserializeScaledImu as (payload: Uint8Array) => unknown,
  }],
  [27, {
    msgid: 27,
    name: 'RAW_IMU',
    crcExtra: 83,
    minLength: 29,
    maxLength: 29,
    serialize: serializeRawImu as (msg: unknown) => Uint8Array,
    deserialize: deserializeRawImu as (payload: Uint8Array) => unknown,
  }],
  [28, {
    msgid: 28,
    name: 'RAW_PRESSURE',
    crcExtra: 67,
    minLength: 16,
    maxLength: 16,
    serialize: serializeRawPressure as (msg: unknown) => Uint8Array,
    deserialize: deserializeRawPressure as (payload: Uint8Array) => unknown,
  }],
  [29, {
    msgid: 29,
    name: 'SCALED_PRESSURE',
    crcExtra: 107,
    minLength: 16,
    maxLength: 16,
    serialize: serializeScaledPressure as (msg: unknown) => Uint8Array,
    deserialize: deserializeScaledPressure as (payload: Uint8Array) => unknown,
  }],
  [30, {
    msgid: 30,
    name: 'ATTITUDE',
    crcExtra: 39,
    minLength: 28,
    maxLength: 28,
    serialize: serializeAttitude as (msg: unknown) => Uint8Array,
    deserialize: deserializeAttitude as (payload: Uint8Array) => unknown,
  }],
  [31, {
    msgid: 31,
    name: 'ATTITUDE_QUATERNION',
    crcExtra: 92,
    minLength: 48,
    maxLength: 48,
    serialize: serializeAttitudeQuaternion as (msg: unknown) => Uint8Array,
    deserialize: deserializeAttitudeQuaternion as (payload: Uint8Array) => unknown,
  }],
  [32, {
    msgid: 32,
    name: 'LOCAL_POSITION_NED',
    crcExtra: 185,
    minLength: 28,
    maxLength: 28,
    serialize: serializeLocalPositionNed as (msg: unknown) => Uint8Array,
    deserialize: deserializeLocalPositionNed as (payload: Uint8Array) => unknown,
  }],
  [33, {
    msgid: 33,
    name: 'GLOBAL_POSITION_INT',
    crcExtra: 104,
    minLength: 28,
    maxLength: 28,
    serialize: serializeGlobalPositionInt as (msg: unknown) => Uint8Array,
    deserialize: deserializeGlobalPositionInt as (payload: Uint8Array) => unknown,
  }],
  [34, {
    msgid: 34,
    name: 'RC_CHANNELS_SCALED',
    crcExtra: 237,
    minLength: 22,
    maxLength: 22,
    serialize: serializeRcChannelsScaled as (msg: unknown) => Uint8Array,
    deserialize: deserializeRcChannelsScaled as (payload: Uint8Array) => unknown,
  }],
  [35, {
    msgid: 35,
    name: 'RC_CHANNELS_RAW',
    crcExtra: 244,
    minLength: 22,
    maxLength: 22,
    serialize: serializeRcChannelsRaw as (msg: unknown) => Uint8Array,
    deserialize: deserializeRcChannelsRaw as (payload: Uint8Array) => unknown,
  }],
  [36, {
    msgid: 36,
    name: 'SERVO_OUTPUT_RAW',
    crcExtra: 175,
    minLength: 37,
    maxLength: 37,
    serialize: serializeServoOutputRaw as (msg: unknown) => Uint8Array,
    deserialize: deserializeServoOutputRaw as (payload: Uint8Array) => unknown,
  }],
  [37, {
    msgid: 37,
    name: 'MISSION_REQUEST_PARTIAL_LIST',
    crcExtra: 4,
    minLength: 7,
    maxLength: 7,
    serialize: serializeMissionRequestPartialList as (msg: unknown) => Uint8Array,
    deserialize: deserializeMissionRequestPartialList as (payload: Uint8Array) => unknown,
  }],
  [38, {
    msgid: 38,
    name: 'MISSION_WRITE_PARTIAL_LIST',
    crcExtra: 168,
    minLength: 7,
    maxLength: 7,
    serialize: serializeMissionWritePartialList as (msg: unknown) => Uint8Array,
    deserialize: deserializeMissionWritePartialList as (payload: Uint8Array) => unknown,
  }],
  [39, {
    msgid: 39,
    name: 'MISSION_ITEM',
    crcExtra: 254,
    minLength: 37,
    maxLength: 38,
    serialize: serializeMissionItem as (msg: unknown) => Uint8Array,
    deserialize: deserializeMissionItem as (payload: Uint8Array) => unknown,
  }],
  [40, {
    msgid: 40,
    name: 'MISSION_REQUEST',
    crcExtra: 230,
    minLength: 4,
    maxLength: 5,
    serialize: serializeMissionRequest as (msg: unknown) => Uint8Array,
    deserialize: deserializeMissionRequest as (payload: Uint8Array) => unknown,
  }],
  [41, {
    msgid: 41,
    name: 'MISSION_SET_CURRENT',
    crcExtra: 28,
    minLength: 4,
    maxLength: 4,
    serialize: serializeMissionSetCurrent as (msg: unknown) => Uint8Array,
    deserialize: deserializeMissionSetCurrent as (payload: Uint8Array) => unknown,
  }],
  [42, {
    msgid: 42,
    name: 'MISSION_CURRENT',
    crcExtra: 218,
    minLength: 6,
    maxLength: 6,
    serialize: serializeMissionCurrent as (msg: unknown) => Uint8Array,
    deserialize: deserializeMissionCurrent as (payload: Uint8Array) => unknown,
  }],
  [43, {
    msgid: 43,
    name: 'MISSION_REQUEST_LIST',
    crcExtra: 132,
    minLength: 2,
    maxLength: 3,
    serialize: serializeMissionRequestList as (msg: unknown) => Uint8Array,
    deserialize: deserializeMissionRequestList as (payload: Uint8Array) => unknown,
  }],
  [44, {
    msgid: 44,
    name: 'MISSION_COUNT',
    crcExtra: 221,
    minLength: 4,
    maxLength: 5,
    serialize: serializeMissionCount as (msg: unknown) => Uint8Array,
    deserialize: deserializeMissionCount as (payload: Uint8Array) => unknown,
  }],
  [45, {
    msgid: 45,
    name: 'MISSION_CLEAR_ALL',
    crcExtra: 232,
    minLength: 2,
    maxLength: 3,
    serialize: serializeMissionClearAll as (msg: unknown) => Uint8Array,
    deserialize: deserializeMissionClearAll as (payload: Uint8Array) => unknown,
  }],
  [46, {
    msgid: 46,
    name: 'MISSION_ITEM_REACHED',
    crcExtra: 11,
    minLength: 2,
    maxLength: 2,
    serialize: serializeMissionItemReached as (msg: unknown) => Uint8Array,
    deserialize: deserializeMissionItemReached as (payload: Uint8Array) => unknown,
  }],
  [47, {
    msgid: 47,
    name: 'MISSION_ACK',
    crcExtra: 153,
    minLength: 3,
    maxLength: 4,
    serialize: serializeMissionAck as (msg: unknown) => Uint8Array,
    deserialize: deserializeMissionAck as (payload: Uint8Array) => unknown,
  }],
  [48, {
    msgid: 48,
    name: 'SET_GPS_GLOBAL_ORIGIN',
    crcExtra: 62,
    minLength: 21,
    maxLength: 21,
    serialize: serializeSetGpsGlobalOrigin as (msg: unknown) => Uint8Array,
    deserialize: deserializeSetGpsGlobalOrigin as (payload: Uint8Array) => unknown,
  }],
  [49, {
    msgid: 49,
    name: 'GPS_GLOBAL_ORIGIN',
    crcExtra: 95,
    minLength: 20,
    maxLength: 20,
    serialize: serializeGpsGlobalOrigin as (msg: unknown) => Uint8Array,
    deserialize: deserializeGpsGlobalOrigin as (payload: Uint8Array) => unknown,
  }],
  [50, {
    msgid: 50,
    name: 'PARAM_MAP_RC',
    crcExtra: 78,
    minLength: 37,
    maxLength: 37,
    serialize: serializeParamMapRc as (msg: unknown) => Uint8Array,
    deserialize: deserializeParamMapRc as (payload: Uint8Array) => unknown,
  }],
  [51, {
    msgid: 51,
    name: 'MISSION_REQUEST_INT',
    crcExtra: 196,
    minLength: 4,
    maxLength: 5,
    serialize: serializeMissionRequestInt as (msg: unknown) => Uint8Array,
    deserialize: deserializeMissionRequestInt as (payload: Uint8Array) => unknown,
  }],
  [53, {
    msgid: 53,
    name: 'MISSION_CHECKSUM',
    crcExtra: 3,
    minLength: 5,
    maxLength: 5,
    serialize: serializeMissionChecksum as (msg: unknown) => Uint8Array,
    deserialize: deserializeMissionChecksum as (payload: Uint8Array) => unknown,
  }],
  [54, {
    msgid: 54,
    name: 'SAFETY_SET_ALLOWED_AREA',
    crcExtra: 15,
    minLength: 27,
    maxLength: 27,
    serialize: serializeSafetySetAllowedArea as (msg: unknown) => Uint8Array,
    deserialize: deserializeSafetySetAllowedArea as (payload: Uint8Array) => unknown,
  }],
  [55, {
    msgid: 55,
    name: 'SAFETY_ALLOWED_AREA',
    crcExtra: 3,
    minLength: 25,
    maxLength: 25,
    serialize: serializeSafetyAllowedArea as (msg: unknown) => Uint8Array,
    deserialize: deserializeSafetyAllowedArea as (payload: Uint8Array) => unknown,
  }],
  [61, {
    msgid: 61,
    name: 'ATTITUDE_QUATERNION_COV',
    crcExtra: 167,
    minLength: 72,
    maxLength: 72,
    serialize: serializeAttitudeQuaternionCov as (msg: unknown) => Uint8Array,
    deserialize: deserializeAttitudeQuaternionCov as (payload: Uint8Array) => unknown,
  }],
  [62, {
    msgid: 62,
    name: 'NAV_CONTROLLER_OUTPUT',
    crcExtra: 183,
    minLength: 26,
    maxLength: 26,
    serialize: serializeNavControllerOutput as (msg: unknown) => Uint8Array,
    deserialize: deserializeNavControllerOutput as (payload: Uint8Array) => unknown,
  }],
  [63, {
    msgid: 63,
    name: 'GLOBAL_POSITION_INT_COV',
    crcExtra: 119,
    minLength: 181,
    maxLength: 181,
    serialize: serializeGlobalPositionIntCov as (msg: unknown) => Uint8Array,
    deserialize: deserializeGlobalPositionIntCov as (payload: Uint8Array) => unknown,
  }],
  [64, {
    msgid: 64,
    name: 'LOCAL_POSITION_NED_COV',
    crcExtra: 191,
    minLength: 225,
    maxLength: 225,
    serialize: serializeLocalPositionNedCov as (msg: unknown) => Uint8Array,
    deserialize: deserializeLocalPositionNedCov as (payload: Uint8Array) => unknown,
  }],
  [65, {
    msgid: 65,
    name: 'RC_CHANNELS',
    crcExtra: 118,
    minLength: 42,
    maxLength: 42,
    serialize: serializeRcChannels as (msg: unknown) => Uint8Array,
    deserialize: deserializeRcChannels as (payload: Uint8Array) => unknown,
  }],
  [66, {
    msgid: 66,
    name: 'REQUEST_DATA_STREAM',
    crcExtra: 148,
    minLength: 6,
    maxLength: 6,
    serialize: serializeRequestDataStream as (msg: unknown) => Uint8Array,
    deserialize: deserializeRequestDataStream as (payload: Uint8Array) => unknown,
  }],
  [67, {
    msgid: 67,
    name: 'DATA_STREAM',
    crcExtra: 21,
    minLength: 4,
    maxLength: 4,
    serialize: serializeDataStream as (msg: unknown) => Uint8Array,
    deserialize: deserializeDataStream as (payload: Uint8Array) => unknown,
  }],
  [69, {
    msgid: 69,
    name: 'MANUAL_CONTROL',
    crcExtra: 14,
    minLength: 30,
    maxLength: 30,
    serialize: serializeManualControl as (msg: unknown) => Uint8Array,
    deserialize: deserializeManualControl as (payload: Uint8Array) => unknown,
  }],
  [70, {
    msgid: 70,
    name: 'RC_CHANNELS_OVERRIDE',
    crcExtra: 140,
    minLength: 38,
    maxLength: 38,
    serialize: serializeRcChannelsOverride as (msg: unknown) => Uint8Array,
    deserialize: deserializeRcChannelsOverride as (payload: Uint8Array) => unknown,
  }],
  [73, {
    msgid: 73,
    name: 'MISSION_ITEM_INT',
    crcExtra: 38,
    minLength: 37,
    maxLength: 38,
    serialize: serializeMissionItemInt as (msg: unknown) => Uint8Array,
    deserialize: deserializeMissionItemInt as (payload: Uint8Array) => unknown,
  }],
  [74, {
    msgid: 74,
    name: 'VFR_HUD',
    crcExtra: 20,
    minLength: 20,
    maxLength: 20,
    serialize: serializeVfrHud as (msg: unknown) => Uint8Array,
    deserialize: deserializeVfrHud as (payload: Uint8Array) => unknown,
  }],
  [75, {
    msgid: 75,
    name: 'COMMAND_INT',
    crcExtra: 158,
    minLength: 35,
    maxLength: 35,
    serialize: serializeCommandInt as (msg: unknown) => Uint8Array,
    deserialize: deserializeCommandInt as (payload: Uint8Array) => unknown,
  }],
  [76, {
    msgid: 76,
    name: 'COMMAND_LONG',
    crcExtra: 152,
    minLength: 33,
    maxLength: 33,
    serialize: serializeCommandLong as (msg: unknown) => Uint8Array,
    deserialize: deserializeCommandLong as (payload: Uint8Array) => unknown,
  }],
  [77, {
    msgid: 77,
    name: 'COMMAND_ACK',
    crcExtra: 205,
    minLength: 10,
    maxLength: 10,
    serialize: serializeCommandAck as (msg: unknown) => Uint8Array,
    deserialize: deserializeCommandAck as (payload: Uint8Array) => unknown,
  }],
  [81, {
    msgid: 81,
    name: 'MANUAL_SETPOINT',
    crcExtra: 106,
    minLength: 22,
    maxLength: 22,
    serialize: serializeManualSetpoint as (msg: unknown) => Uint8Array,
    deserialize: deserializeManualSetpoint as (payload: Uint8Array) => unknown,
  }],
  [82, {
    msgid: 82,
    name: 'SET_ATTITUDE_TARGET',
    crcExtra: 49,
    minLength: 39,
    maxLength: 39,
    serialize: serializeSetAttitudeTarget as (msg: unknown) => Uint8Array,
    deserialize: deserializeSetAttitudeTarget as (payload: Uint8Array) => unknown,
  }],
  [83, {
    msgid: 83,
    name: 'ATTITUDE_TARGET',
    crcExtra: 22,
    minLength: 37,
    maxLength: 37,
    serialize: serializeAttitudeTarget as (msg: unknown) => Uint8Array,
    deserialize: deserializeAttitudeTarget as (payload: Uint8Array) => unknown,
  }],
  [84, {
    msgid: 84,
    name: 'SET_POSITION_TARGET_LOCAL_NED',
    crcExtra: 143,
    minLength: 53,
    maxLength: 53,
    serialize: serializeSetPositionTargetLocalNed as (msg: unknown) => Uint8Array,
    deserialize: deserializeSetPositionTargetLocalNed as (payload: Uint8Array) => unknown,
  }],
  [85, {
    msgid: 85,
    name: 'POSITION_TARGET_LOCAL_NED',
    crcExtra: 140,
    minLength: 51,
    maxLength: 51,
    serialize: serializePositionTargetLocalNed as (msg: unknown) => Uint8Array,
    deserialize: deserializePositionTargetLocalNed as (payload: Uint8Array) => unknown,
  }],
  [86, {
    msgid: 86,
    name: 'SET_POSITION_TARGET_GLOBAL_INT',
    crcExtra: 5,
    minLength: 53,
    maxLength: 53,
    serialize: serializeSetPositionTargetGlobalInt as (msg: unknown) => Uint8Array,
    deserialize: deserializeSetPositionTargetGlobalInt as (payload: Uint8Array) => unknown,
  }],
  [87, {
    msgid: 87,
    name: 'POSITION_TARGET_GLOBAL_INT',
    crcExtra: 150,
    minLength: 51,
    maxLength: 51,
    serialize: serializePositionTargetGlobalInt as (msg: unknown) => Uint8Array,
    deserialize: deserializePositionTargetGlobalInt as (payload: Uint8Array) => unknown,
  }],
  [89, {
    msgid: 89,
    name: 'LOCAL_POSITION_NED_SYSTEM_GLOBAL_OFFSET',
    crcExtra: 231,
    minLength: 28,
    maxLength: 28,
    serialize: serializeLocalPositionNedSystemGlobalOffset as (msg: unknown) => Uint8Array,
    deserialize: deserializeLocalPositionNedSystemGlobalOffset as (payload: Uint8Array) => unknown,
  }],
  [90, {
    msgid: 90,
    name: 'HIL_STATE',
    crcExtra: 183,
    minLength: 56,
    maxLength: 56,
    serialize: serializeHilState as (msg: unknown) => Uint8Array,
    deserialize: deserializeHilState as (payload: Uint8Array) => unknown,
  }],
  [91, {
    msgid: 91,
    name: 'HIL_CONTROLS',
    crcExtra: 63,
    minLength: 42,
    maxLength: 42,
    serialize: serializeHilControls as (msg: unknown) => Uint8Array,
    deserialize: deserializeHilControls as (payload: Uint8Array) => unknown,
  }],
  [92, {
    msgid: 92,
    name: 'HIL_RC_INPUTS_RAW',
    crcExtra: 54,
    minLength: 33,
    maxLength: 33,
    serialize: serializeHilRcInputsRaw as (msg: unknown) => Uint8Array,
    deserialize: deserializeHilRcInputsRaw as (payload: Uint8Array) => unknown,
  }],
  [93, {
    msgid: 93,
    name: 'HIL_ACTUATOR_CONTROLS',
    crcExtra: 47,
    minLength: 81,
    maxLength: 81,
    serialize: serializeHilActuatorControls as (msg: unknown) => Uint8Array,
    deserialize: deserializeHilActuatorControls as (payload: Uint8Array) => unknown,
  }],
  [100, {
    msgid: 100,
    name: 'OPTICAL_FLOW',
    crcExtra: 145,
    minLength: 34,
    maxLength: 34,
    serialize: serializeOpticalFlow as (msg: unknown) => Uint8Array,
    deserialize: deserializeOpticalFlow as (payload: Uint8Array) => unknown,
  }],
  [101, {
    msgid: 101,
    name: 'GLOBAL_VISION_POSITION_ESTIMATE',
    crcExtra: 18,
    minLength: 117,
    maxLength: 117,
    serialize: serializeGlobalVisionPositionEstimate as (msg: unknown) => Uint8Array,
    deserialize: deserializeGlobalVisionPositionEstimate as (payload: Uint8Array) => unknown,
  }],
  [102, {
    msgid: 102,
    name: 'VISION_POSITION_ESTIMATE',
    crcExtra: 152,
    minLength: 117,
    maxLength: 117,
    serialize: serializeVisionPositionEstimate as (msg: unknown) => Uint8Array,
    deserialize: deserializeVisionPositionEstimate as (payload: Uint8Array) => unknown,
  }],
  [103, {
    msgid: 103,
    name: 'VISION_SPEED_ESTIMATE',
    crcExtra: 153,
    minLength: 57,
    maxLength: 57,
    serialize: serializeVisionSpeedEstimate as (msg: unknown) => Uint8Array,
    deserialize: deserializeVisionSpeedEstimate as (payload: Uint8Array) => unknown,
  }],
  [104, {
    msgid: 104,
    name: 'VICON_POSITION_ESTIMATE',
    crcExtra: 176,
    minLength: 116,
    maxLength: 116,
    serialize: serializeViconPositionEstimate as (msg: unknown) => Uint8Array,
    deserialize: deserializeViconPositionEstimate as (payload: Uint8Array) => unknown,
  }],
  [105, {
    msgid: 105,
    name: 'HIGHRES_IMU',
    crcExtra: 253,
    minLength: 63,
    maxLength: 63,
    serialize: serializeHighresImu as (msg: unknown) => Uint8Array,
    deserialize: deserializeHighresImu as (payload: Uint8Array) => unknown,
  }],
  [106, {
    msgid: 106,
    name: 'OPTICAL_FLOW_RAD',
    crcExtra: 138,
    minLength: 44,
    maxLength: 44,
    serialize: serializeOpticalFlowRad as (msg: unknown) => Uint8Array,
    deserialize: deserializeOpticalFlowRad as (payload: Uint8Array) => unknown,
  }],
  [107, {
    msgid: 107,
    name: 'HIL_SENSOR',
    crcExtra: 207,
    minLength: 65,
    maxLength: 65,
    serialize: serializeHilSensor as (msg: unknown) => Uint8Array,
    deserialize: deserializeHilSensor as (payload: Uint8Array) => unknown,
  }],
  [108, {
    msgid: 108,
    name: 'SIM_STATE',
    crcExtra: 205,
    minLength: 92,
    maxLength: 92,
    serialize: serializeSimState as (msg: unknown) => Uint8Array,
    deserialize: deserializeSimState as (payload: Uint8Array) => unknown,
  }],
  [109, {
    msgid: 109,
    name: 'RADIO_STATUS',
    crcExtra: 185,
    minLength: 9,
    maxLength: 9,
    serialize: serializeRadioStatus as (msg: unknown) => Uint8Array,
    deserialize: deserializeRadioStatus as (payload: Uint8Array) => unknown,
  }],
  [110, {
    msgid: 110,
    name: 'FILE_TRANSFER_PROTOCOL',
    crcExtra: 84,
    minLength: 254,
    maxLength: 254,
    serialize: serializeFileTransferProtocol as (msg: unknown) => Uint8Array,
    deserialize: deserializeFileTransferProtocol as (payload: Uint8Array) => unknown,
  }],
  [111, {
    msgid: 111,
    name: 'TIMESYNC',
    crcExtra: 34,
    minLength: 16,
    maxLength: 16,
    serialize: serializeTimesync as (msg: unknown) => Uint8Array,
    deserialize: deserializeTimesync as (payload: Uint8Array) => unknown,
  }],
  [112, {
    msgid: 112,
    name: 'CAMERA_TRIGGER',
    crcExtra: 174,
    minLength: 12,
    maxLength: 12,
    serialize: serializeCameraTrigger as (msg: unknown) => Uint8Array,
    deserialize: deserializeCameraTrigger as (payload: Uint8Array) => unknown,
  }],
  [113, {
    msgid: 113,
    name: 'HIL_GPS',
    crcExtra: 204,
    minLength: 39,
    maxLength: 39,
    serialize: serializeHilGps as (msg: unknown) => Uint8Array,
    deserialize: deserializeHilGps as (payload: Uint8Array) => unknown,
  }],
  [114, {
    msgid: 114,
    name: 'HIL_OPTICAL_FLOW',
    crcExtra: 237,
    minLength: 44,
    maxLength: 44,
    serialize: serializeHilOpticalFlow as (msg: unknown) => Uint8Array,
    deserialize: deserializeHilOpticalFlow as (payload: Uint8Array) => unknown,
  }],
  [115, {
    msgid: 115,
    name: 'HIL_STATE_QUATERNION',
    crcExtra: 4,
    minLength: 64,
    maxLength: 64,
    serialize: serializeHilStateQuaternion as (msg: unknown) => Uint8Array,
    deserialize: deserializeHilStateQuaternion as (payload: Uint8Array) => unknown,
  }],
  [116, {
    msgid: 116,
    name: 'SCALED_IMU2',
    crcExtra: 220,
    minLength: 24,
    maxLength: 24,
    serialize: serializeScaledImu2 as (msg: unknown) => Uint8Array,
    deserialize: deserializeScaledImu2 as (payload: Uint8Array) => unknown,
  }],
  [117, {
    msgid: 117,
    name: 'LOG_REQUEST_LIST',
    crcExtra: 128,
    minLength: 6,
    maxLength: 6,
    serialize: serializeLogRequestList as (msg: unknown) => Uint8Array,
    deserialize: deserializeLogRequestList as (payload: Uint8Array) => unknown,
  }],
  [118, {
    msgid: 118,
    name: 'LOG_ENTRY',
    crcExtra: 56,
    minLength: 14,
    maxLength: 14,
    serialize: serializeLogEntry as (msg: unknown) => Uint8Array,
    deserialize: deserializeLogEntry as (payload: Uint8Array) => unknown,
  }],
  [119, {
    msgid: 119,
    name: 'LOG_REQUEST_DATA',
    crcExtra: 116,
    minLength: 12,
    maxLength: 12,
    serialize: serializeLogRequestData as (msg: unknown) => Uint8Array,
    deserialize: deserializeLogRequestData as (payload: Uint8Array) => unknown,
  }],
  [120, {
    msgid: 120,
    name: 'LOG_DATA',
    crcExtra: 134,
    minLength: 97,
    maxLength: 97,
    serialize: serializeLogData as (msg: unknown) => Uint8Array,
    deserialize: deserializeLogData as (payload: Uint8Array) => unknown,
  }],
  [121, {
    msgid: 121,
    name: 'LOG_ERASE',
    crcExtra: 237,
    minLength: 2,
    maxLength: 2,
    serialize: serializeLogErase as (msg: unknown) => Uint8Array,
    deserialize: deserializeLogErase as (payload: Uint8Array) => unknown,
  }],
  [122, {
    msgid: 122,
    name: 'LOG_REQUEST_END',
    crcExtra: 203,
    minLength: 2,
    maxLength: 2,
    serialize: serializeLogRequestEnd as (msg: unknown) => Uint8Array,
    deserialize: deserializeLogRequestEnd as (payload: Uint8Array) => unknown,
  }],
  [123, {
    msgid: 123,
    name: 'GPS_INJECT_DATA',
    crcExtra: 250,
    minLength: 113,
    maxLength: 113,
    serialize: serializeGpsInjectData as (msg: unknown) => Uint8Array,
    deserialize: deserializeGpsInjectData as (payload: Uint8Array) => unknown,
  }],
  [124, {
    msgid: 124,
    name: 'GPS2_RAW',
    crcExtra: 57,
    minLength: 57,
    maxLength: 57,
    serialize: serializeGps2Raw as (msg: unknown) => Uint8Array,
    deserialize: deserializeGps2Raw as (payload: Uint8Array) => unknown,
  }],
  [125, {
    msgid: 125,
    name: 'POWER_STATUS',
    crcExtra: 203,
    minLength: 6,
    maxLength: 6,
    serialize: serializePowerStatus as (msg: unknown) => Uint8Array,
    deserialize: deserializePowerStatus as (payload: Uint8Array) => unknown,
  }],
  [126, {
    msgid: 126,
    name: 'SERIAL_CONTROL',
    crcExtra: 220,
    minLength: 79,
    maxLength: 79,
    serialize: serializeSerialControl as (msg: unknown) => Uint8Array,
    deserialize: deserializeSerialControl as (payload: Uint8Array) => unknown,
  }],
  [127, {
    msgid: 127,
    name: 'GPS_RTK',
    crcExtra: 25,
    minLength: 35,
    maxLength: 35,
    serialize: serializeGpsRtk as (msg: unknown) => Uint8Array,
    deserialize: deserializeGpsRtk as (payload: Uint8Array) => unknown,
  }],
  [128, {
    msgid: 128,
    name: 'GPS2_RTK',
    crcExtra: 226,
    minLength: 35,
    maxLength: 35,
    serialize: serializeGps2Rtk as (msg: unknown) => Uint8Array,
    deserialize: deserializeGps2Rtk as (payload: Uint8Array) => unknown,
  }],
  [129, {
    msgid: 129,
    name: 'SCALED_IMU3',
    crcExtra: 106,
    minLength: 24,
    maxLength: 24,
    serialize: serializeScaledImu3 as (msg: unknown) => Uint8Array,
    deserialize: deserializeScaledImu3 as (payload: Uint8Array) => unknown,
  }],
  [130, {
    msgid: 130,
    name: 'DATA_TRANSMISSION_HANDSHAKE',
    crcExtra: 29,
    minLength: 13,
    maxLength: 13,
    serialize: serializeDataTransmissionHandshake as (msg: unknown) => Uint8Array,
    deserialize: deserializeDataTransmissionHandshake as (payload: Uint8Array) => unknown,
  }],
  [131, {
    msgid: 131,
    name: 'ENCAPSULATED_DATA',
    crcExtra: 223,
    minLength: 255,
    maxLength: 255,
    serialize: serializeEncapsulatedData as (msg: unknown) => Uint8Array,
    deserialize: deserializeEncapsulatedData as (payload: Uint8Array) => unknown,
  }],
  [132, {
    msgid: 132,
    name: 'DISTANCE_SENSOR',
    crcExtra: 40,
    minLength: 39,
    maxLength: 39,
    serialize: serializeDistanceSensor as (msg: unknown) => Uint8Array,
    deserialize: deserializeDistanceSensor as (payload: Uint8Array) => unknown,
  }],
  [133, {
    msgid: 133,
    name: 'TERRAIN_REQUEST',
    crcExtra: 6,
    minLength: 18,
    maxLength: 18,
    serialize: serializeTerrainRequest as (msg: unknown) => Uint8Array,
    deserialize: deserializeTerrainRequest as (payload: Uint8Array) => unknown,
  }],
  [134, {
    msgid: 134,
    name: 'TERRAIN_DATA',
    crcExtra: 229,
    minLength: 43,
    maxLength: 43,
    serialize: serializeTerrainData as (msg: unknown) => Uint8Array,
    deserialize: deserializeTerrainData as (payload: Uint8Array) => unknown,
  }],
  [135, {
    msgid: 135,
    name: 'TERRAIN_CHECK',
    crcExtra: 203,
    minLength: 8,
    maxLength: 8,
    serialize: serializeTerrainCheck as (msg: unknown) => Uint8Array,
    deserialize: deserializeTerrainCheck as (payload: Uint8Array) => unknown,
  }],
  [136, {
    msgid: 136,
    name: 'TERRAIN_REPORT',
    crcExtra: 1,
    minLength: 22,
    maxLength: 22,
    serialize: serializeTerrainReport as (msg: unknown) => Uint8Array,
    deserialize: deserializeTerrainReport as (payload: Uint8Array) => unknown,
  }],
  [137, {
    msgid: 137,
    name: 'SCALED_PRESSURE2',
    crcExtra: 48,
    minLength: 16,
    maxLength: 16,
    serialize: serializeScaledPressure2 as (msg: unknown) => Uint8Array,
    deserialize: deserializeScaledPressure2 as (payload: Uint8Array) => unknown,
  }],
  [138, {
    msgid: 138,
    name: 'ATT_POS_MOCAP',
    crcExtra: 19,
    minLength: 120,
    maxLength: 120,
    serialize: serializeAttPosMocap as (msg: unknown) => Uint8Array,
    deserialize: deserializeAttPosMocap as (payload: Uint8Array) => unknown,
  }],
  [139, {
    msgid: 139,
    name: 'SET_ACTUATOR_CONTROL_TARGET',
    crcExtra: 168,
    minLength: 43,
    maxLength: 43,
    serialize: serializeSetActuatorControlTarget as (msg: unknown) => Uint8Array,
    deserialize: deserializeSetActuatorControlTarget as (payload: Uint8Array) => unknown,
  }],
  [140, {
    msgid: 140,
    name: 'ACTUATOR_CONTROL_TARGET',
    crcExtra: 181,
    minLength: 41,
    maxLength: 41,
    serialize: serializeActuatorControlTarget as (msg: unknown) => Uint8Array,
    deserialize: deserializeActuatorControlTarget as (payload: Uint8Array) => unknown,
  }],
  [141, {
    msgid: 141,
    name: 'ALTITUDE',
    crcExtra: 47,
    minLength: 32,
    maxLength: 32,
    serialize: serializeAltitude as (msg: unknown) => Uint8Array,
    deserialize: deserializeAltitude as (payload: Uint8Array) => unknown,
  }],
  [142, {
    msgid: 142,
    name: 'RESOURCE_REQUEST',
    crcExtra: 72,
    minLength: 243,
    maxLength: 243,
    serialize: serializeResourceRequest as (msg: unknown) => Uint8Array,
    deserialize: deserializeResourceRequest as (payload: Uint8Array) => unknown,
  }],
  [143, {
    msgid: 143,
    name: 'SCALED_PRESSURE3',
    crcExtra: 69,
    minLength: 16,
    maxLength: 16,
    serialize: serializeScaledPressure3 as (msg: unknown) => Uint8Array,
    deserialize: deserializeScaledPressure3 as (payload: Uint8Array) => unknown,
  }],
  [144, {
    msgid: 144,
    name: 'FOLLOW_TARGET',
    crcExtra: 127,
    minLength: 93,
    maxLength: 93,
    serialize: serializeFollowTarget as (msg: unknown) => Uint8Array,
    deserialize: deserializeFollowTarget as (payload: Uint8Array) => unknown,
  }],
  [146, {
    msgid: 146,
    name: 'CONTROL_SYSTEM_STATE',
    crcExtra: 103,
    minLength: 100,
    maxLength: 100,
    serialize: serializeControlSystemState as (msg: unknown) => Uint8Array,
    deserialize: deserializeControlSystemState as (payload: Uint8Array) => unknown,
  }],
  [147, {
    msgid: 147,
    name: 'BATTERY_STATUS',
    crcExtra: 11,
    minLength: 54,
    maxLength: 54,
    serialize: serializeBatteryStatus as (msg: unknown) => Uint8Array,
    deserialize: deserializeBatteryStatus as (payload: Uint8Array) => unknown,
  }],
  [148, {
    msgid: 148,
    name: 'AUTOPILOT_VERSION',
    crcExtra: 39,
    minLength: 78,
    maxLength: 78,
    serialize: serializeAutopilotVersion as (msg: unknown) => Uint8Array,
    deserialize: deserializeAutopilotVersion as (payload: Uint8Array) => unknown,
  }],
  [149, {
    msgid: 149,
    name: 'LANDING_TARGET',
    crcExtra: 48,
    minLength: 60,
    maxLength: 60,
    serialize: serializeLandingTarget as (msg: unknown) => Uint8Array,
    deserialize: deserializeLandingTarget as (payload: Uint8Array) => unknown,
  }],
  [150, {
    msgid: 150,
    name: 'FLEXIFUNCTION_SET',
    crcExtra: 181,
    minLength: 2,
    maxLength: 2,
    serialize: serializeFlexifunctionSet as (msg: unknown) => Uint8Array,
    deserialize: deserializeFlexifunctionSet as (payload: Uint8Array) => unknown,
  }],
  [151, {
    msgid: 151,
    name: 'FLEXIFUNCTION_READ_REQ',
    crcExtra: 26,
    minLength: 6,
    maxLength: 6,
    serialize: serializeFlexifunctionReadReq as (msg: unknown) => Uint8Array,
    deserialize: deserializeFlexifunctionReadReq as (payload: Uint8Array) => unknown,
  }],
  [152, {
    msgid: 152,
    name: 'FLEXIFUNCTION_BUFFER_FUNCTION',
    crcExtra: 101,
    minLength: 58,
    maxLength: 58,
    serialize: serializeFlexifunctionBufferFunction as (msg: unknown) => Uint8Array,
    deserialize: deserializeFlexifunctionBufferFunction as (payload: Uint8Array) => unknown,
  }],
  [153, {
    msgid: 153,
    name: 'FLEXIFUNCTION_BUFFER_FUNCTION_ACK',
    crcExtra: 109,
    minLength: 6,
    maxLength: 6,
    serialize: serializeFlexifunctionBufferFunctionAck as (msg: unknown) => Uint8Array,
    deserialize: deserializeFlexifunctionBufferFunctionAck as (payload: Uint8Array) => unknown,
  }],
  [154, {
    msgid: 154,
    name: 'DIGICAM_CONFIGURE',
    crcExtra: 84,
    minLength: 15,
    maxLength: 15,
    serialize: serializeDigicamConfigure as (msg: unknown) => Uint8Array,
    deserialize: deserializeDigicamConfigure as (payload: Uint8Array) => unknown,
  }],
  [155, {
    msgid: 155,
    name: 'FLEXIFUNCTION_DIRECTORY',
    crcExtra: 12,
    minLength: 53,
    maxLength: 53,
    serialize: serializeFlexifunctionDirectory as (msg: unknown) => Uint8Array,
    deserialize: deserializeFlexifunctionDirectory as (payload: Uint8Array) => unknown,
  }],
  [156, {
    msgid: 156,
    name: 'FLEXIFUNCTION_DIRECTORY_ACK',
    crcExtra: 218,
    minLength: 7,
    maxLength: 7,
    serialize: serializeFlexifunctionDirectoryAck as (msg: unknown) => Uint8Array,
    deserialize: deserializeFlexifunctionDirectoryAck as (payload: Uint8Array) => unknown,
  }],
  [157, {
    msgid: 157,
    name: 'FLEXIFUNCTION_COMMAND',
    crcExtra: 133,
    minLength: 3,
    maxLength: 3,
    serialize: serializeFlexifunctionCommand as (msg: unknown) => Uint8Array,
    deserialize: deserializeFlexifunctionCommand as (payload: Uint8Array) => unknown,
  }],
  [158, {
    msgid: 158,
    name: 'FLEXIFUNCTION_COMMAND_ACK',
    crcExtra: 208,
    minLength: 4,
    maxLength: 4,
    serialize: serializeFlexifunctionCommandAck as (msg: unknown) => Uint8Array,
    deserialize: deserializeFlexifunctionCommandAck as (payload: Uint8Array) => unknown,
  }],
  [160, {
    msgid: 160,
    name: 'FENCE_POINT',
    crcExtra: 78,
    minLength: 12,
    maxLength: 12,
    serialize: serializeFencePoint as (msg: unknown) => Uint8Array,
    deserialize: deserializeFencePoint as (payload: Uint8Array) => unknown,
  }],
  [161, {
    msgid: 161,
    name: 'FENCE_FETCH_POINT',
    crcExtra: 68,
    minLength: 3,
    maxLength: 3,
    serialize: serializeFenceFetchPoint as (msg: unknown) => Uint8Array,
    deserialize: deserializeFenceFetchPoint as (payload: Uint8Array) => unknown,
  }],
  [162, {
    msgid: 162,
    name: 'FENCE_STATUS',
    crcExtra: 178,
    minLength: 9,
    maxLength: 9,
    serialize: serializeFenceStatus as (msg: unknown) => Uint8Array,
    deserialize: deserializeFenceStatus as (payload: Uint8Array) => unknown,
  }],
  [163, {
    msgid: 163,
    name: 'AHRS',
    crcExtra: 127,
    minLength: 28,
    maxLength: 28,
    serialize: serializeAhrs as (msg: unknown) => Uint8Array,
    deserialize: deserializeAhrs as (payload: Uint8Array) => unknown,
  }],
  [164, {
    msgid: 164,
    name: 'SIMSTATE',
    crcExtra: 154,
    minLength: 44,
    maxLength: 44,
    serialize: serializeSimstate as (msg: unknown) => Uint8Array,
    deserialize: deserializeSimstate as (payload: Uint8Array) => unknown,
  }],
  [165, {
    msgid: 165,
    name: 'HWSTATUS',
    crcExtra: 21,
    minLength: 3,
    maxLength: 3,
    serialize: serializeHwstatus as (msg: unknown) => Uint8Array,
    deserialize: deserializeHwstatus as (payload: Uint8Array) => unknown,
  }],
  [166, {
    msgid: 166,
    name: 'RADIO',
    crcExtra: 21,
    minLength: 9,
    maxLength: 9,
    serialize: serializeRadio as (msg: unknown) => Uint8Array,
    deserialize: deserializeRadio as (payload: Uint8Array) => unknown,
  }],
  [167, {
    msgid: 167,
    name: 'LIMITS_STATUS',
    crcExtra: 144,
    minLength: 22,
    maxLength: 22,
    serialize: serializeLimitsStatus as (msg: unknown) => Uint8Array,
    deserialize: deserializeLimitsStatus as (payload: Uint8Array) => unknown,
  }],
  [168, {
    msgid: 168,
    name: 'WIND',
    crcExtra: 1,
    minLength: 12,
    maxLength: 12,
    serialize: serializeWind as (msg: unknown) => Uint8Array,
    deserialize: deserializeWind as (payload: Uint8Array) => unknown,
  }],
  [169, {
    msgid: 169,
    name: 'DATA16',
    crcExtra: 234,
    minLength: 18,
    maxLength: 18,
    serialize: serializeData16 as (msg: unknown) => Uint8Array,
    deserialize: deserializeData16 as (payload: Uint8Array) => unknown,
  }],
  [170, {
    msgid: 170,
    name: 'SERIAL_UDB_EXTRA_F2_A',
    crcExtra: 103,
    minLength: 61,
    maxLength: 61,
    serialize: serializeSerialUdbExtraF2A as (msg: unknown) => Uint8Array,
    deserialize: deserializeSerialUdbExtraF2A as (payload: Uint8Array) => unknown,
  }],
  [171, {
    msgid: 171,
    name: 'SERIAL_UDB_EXTRA_F2_B',
    crcExtra: 245,
    minLength: 108,
    maxLength: 108,
    serialize: serializeSerialUdbExtraF2B as (msg: unknown) => Uint8Array,
    deserialize: deserializeSerialUdbExtraF2B as (payload: Uint8Array) => unknown,
  }],
  [172, {
    msgid: 172,
    name: 'SERIAL_UDB_EXTRA_F4',
    crcExtra: 191,
    minLength: 10,
    maxLength: 10,
    serialize: serializeSerialUdbExtraF4 as (msg: unknown) => Uint8Array,
    deserialize: deserializeSerialUdbExtraF4 as (payload: Uint8Array) => unknown,
  }],
  [173, {
    msgid: 173,
    name: 'SERIAL_UDB_EXTRA_F5',
    crcExtra: 54,
    minLength: 16,
    maxLength: 16,
    serialize: serializeSerialUdbExtraF5 as (msg: unknown) => Uint8Array,
    deserialize: deserializeSerialUdbExtraF5 as (payload: Uint8Array) => unknown,
  }],
  [174, {
    msgid: 174,
    name: 'SERIAL_UDB_EXTRA_F6',
    crcExtra: 54,
    minLength: 20,
    maxLength: 20,
    serialize: serializeSerialUdbExtraF6 as (msg: unknown) => Uint8Array,
    deserialize: deserializeSerialUdbExtraF6 as (payload: Uint8Array) => unknown,
  }],
  [175, {
    msgid: 175,
    name: 'SERIAL_UDB_EXTRA_F7',
    crcExtra: 171,
    minLength: 24,
    maxLength: 24,
    serialize: serializeSerialUdbExtraF7 as (msg: unknown) => Uint8Array,
    deserialize: deserializeSerialUdbExtraF7 as (payload: Uint8Array) => unknown,
  }],
  [176, {
    msgid: 176,
    name: 'SERIAL_UDB_EXTRA_F8',
    crcExtra: 142,
    minLength: 28,
    maxLength: 28,
    serialize: serializeSerialUdbExtraF8 as (msg: unknown) => Uint8Array,
    deserialize: deserializeSerialUdbExtraF8 as (payload: Uint8Array) => unknown,
  }],
  [177, {
    msgid: 177,
    name: 'SERIAL_UDB_EXTRA_F13',
    crcExtra: 249,
    minLength: 14,
    maxLength: 14,
    serialize: serializeSerialUdbExtraF13 as (msg: unknown) => Uint8Array,
    deserialize: deserializeSerialUdbExtraF13 as (payload: Uint8Array) => unknown,
  }],
  [178, {
    msgid: 178,
    name: 'SERIAL_UDB_EXTRA_F14',
    crcExtra: 123,
    minLength: 17,
    maxLength: 17,
    serialize: serializeSerialUdbExtraF14 as (msg: unknown) => Uint8Array,
    deserialize: deserializeSerialUdbExtraF14 as (payload: Uint8Array) => unknown,
  }],
  [179, {
    msgid: 179,
    name: 'SERIAL_UDB_EXTRA_F15',
    crcExtra: 7,
    minLength: 60,
    maxLength: 60,
    serialize: serializeSerialUdbExtraF15 as (msg: unknown) => Uint8Array,
    deserialize: deserializeSerialUdbExtraF15 as (payload: Uint8Array) => unknown,
  }],
  [180, {
    msgid: 180,
    name: 'SCRIPT_ITEM',
    crcExtra: 231,
    minLength: 54,
    maxLength: 54,
    serialize: serializeScriptItem as (msg: unknown) => Uint8Array,
    deserialize: deserializeScriptItem as (payload: Uint8Array) => unknown,
  }],
  [181, {
    msgid: 181,
    name: 'SCRIPT_REQUEST',
    crcExtra: 129,
    minLength: 4,
    maxLength: 4,
    serialize: serializeScriptRequest as (msg: unknown) => Uint8Array,
    deserialize: deserializeScriptRequest as (payload: Uint8Array) => unknown,
  }],
  [182, {
    msgid: 182,
    name: 'SCRIPT_REQUEST_LIST',
    crcExtra: 115,
    minLength: 2,
    maxLength: 2,
    serialize: serializeScriptRequestList as (msg: unknown) => Uint8Array,
    deserialize: deserializeScriptRequestList as (payload: Uint8Array) => unknown,
  }],
  [183, {
    msgid: 183,
    name: 'SCRIPT_COUNT',
    crcExtra: 186,
    minLength: 4,
    maxLength: 4,
    serialize: serializeScriptCount as (msg: unknown) => Uint8Array,
    deserialize: deserializeScriptCount as (payload: Uint8Array) => unknown,
  }],
  [184, {
    msgid: 184,
    name: 'SCRIPT_CURRENT',
    crcExtra: 40,
    minLength: 2,
    maxLength: 2,
    serialize: serializeScriptCurrent as (msg: unknown) => Uint8Array,
    deserialize: deserializeScriptCurrent as (payload: Uint8Array) => unknown,
  }],
  [185, {
    msgid: 185,
    name: 'SERIAL_UDB_EXTRA_F19',
    crcExtra: 87,
    minLength: 8,
    maxLength: 8,
    serialize: serializeSerialUdbExtraF19 as (msg: unknown) => Uint8Array,
    deserialize: deserializeSerialUdbExtraF19 as (payload: Uint8Array) => unknown,
  }],
  [186, {
    msgid: 186,
    name: 'SERIAL_UDB_EXTRA_F20',
    crcExtra: 144,
    minLength: 25,
    maxLength: 25,
    serialize: serializeSerialUdbExtraF20 as (msg: unknown) => Uint8Array,
    deserialize: deserializeSerialUdbExtraF20 as (payload: Uint8Array) => unknown,
  }],
  [187, {
    msgid: 187,
    name: 'SERIAL_UDB_EXTRA_F21',
    crcExtra: 134,
    minLength: 12,
    maxLength: 12,
    serialize: serializeSerialUdbExtraF21 as (msg: unknown) => Uint8Array,
    deserialize: deserializeSerialUdbExtraF21 as (payload: Uint8Array) => unknown,
  }],
  [188, {
    msgid: 188,
    name: 'SERIAL_UDB_EXTRA_F22',
    crcExtra: 91,
    minLength: 12,
    maxLength: 12,
    serialize: serializeSerialUdbExtraF22 as (msg: unknown) => Uint8Array,
    deserialize: deserializeSerialUdbExtraF22 as (payload: Uint8Array) => unknown,
  }],
  [191, {
    msgid: 191,
    name: 'MAG_CAL_PROGRESS',
    crcExtra: 92,
    minLength: 27,
    maxLength: 27,
    serialize: serializeMagCalProgress as (msg: unknown) => Uint8Array,
    deserialize: deserializeMagCalProgress as (payload: Uint8Array) => unknown,
  }],
  [192, {
    msgid: 192,
    name: 'MAG_CAL_REPORT',
    crcExtra: 104,
    minLength: 54,
    maxLength: 54,
    serialize: serializeMagCalReport as (msg: unknown) => Uint8Array,
    deserialize: deserializeMagCalReport as (payload: Uint8Array) => unknown,
  }],
  [193, {
    msgid: 193,
    name: 'EKF_STATUS_REPORT',
    crcExtra: 203,
    minLength: 26,
    maxLength: 26,
    serialize: serializeEkfStatusReport as (msg: unknown) => Uint8Array,
    deserialize: deserializeEkfStatusReport as (payload: Uint8Array) => unknown,
  }],
  [194, {
    msgid: 194,
    name: 'PID_TUNING',
    crcExtra: 146,
    minLength: 33,
    maxLength: 33,
    serialize: serializePidTuning as (msg: unknown) => Uint8Array,
    deserialize: deserializePidTuning as (payload: Uint8Array) => unknown,
  }],
  [195, {
    msgid: 195,
    name: 'DEEPSTALL',
    crcExtra: 120,
    minLength: 37,
    maxLength: 37,
    serialize: serializeDeepstall as (msg: unknown) => Uint8Array,
    deserialize: deserializeDeepstall as (payload: Uint8Array) => unknown,
  }],
  [200, {
    msgid: 200,
    name: 'GIMBAL_REPORT',
    crcExtra: 134,
    minLength: 42,
    maxLength: 42,
    serialize: serializeGimbalReport as (msg: unknown) => Uint8Array,
    deserialize: deserializeGimbalReport as (payload: Uint8Array) => unknown,
  }],
  [201, {
    msgid: 201,
    name: 'GIMBAL_CONTROL',
    crcExtra: 205,
    minLength: 14,
    maxLength: 14,
    serialize: serializeGimbalControl as (msg: unknown) => Uint8Array,
    deserialize: deserializeGimbalControl as (payload: Uint8Array) => unknown,
  }],
  [214, {
    msgid: 214,
    name: 'GIMBAL_TORQUE_CMD_REPORT',
    crcExtra: 69,
    minLength: 8,
    maxLength: 8,
    serialize: serializeGimbalTorqueCmdReport as (msg: unknown) => Uint8Array,
    deserialize: deserializeGimbalTorqueCmdReport as (payload: Uint8Array) => unknown,
  }],
  [215, {
    msgid: 215,
    name: 'GOPRO_HEARTBEAT',
    crcExtra: 101,
    minLength: 3,
    maxLength: 3,
    serialize: serializeGoproHeartbeat as (msg: unknown) => Uint8Array,
    deserialize: deserializeGoproHeartbeat as (payload: Uint8Array) => unknown,
  }],
  [216, {
    msgid: 216,
    name: 'GOPRO_GET_REQUEST',
    crcExtra: 50,
    minLength: 3,
    maxLength: 3,
    serialize: serializeGoproGetRequest as (msg: unknown) => Uint8Array,
    deserialize: deserializeGoproGetRequest as (payload: Uint8Array) => unknown,
  }],
  [217, {
    msgid: 217,
    name: 'GOPRO_GET_RESPONSE',
    crcExtra: 202,
    minLength: 6,
    maxLength: 6,
    serialize: serializeGoproGetResponse as (msg: unknown) => Uint8Array,
    deserialize: deserializeGoproGetResponse as (payload: Uint8Array) => unknown,
  }],
  [218, {
    msgid: 218,
    name: 'GOPRO_SET_REQUEST',
    crcExtra: 17,
    minLength: 7,
    maxLength: 7,
    serialize: serializeGoproSetRequest as (msg: unknown) => Uint8Array,
    deserialize: deserializeGoproSetRequest as (payload: Uint8Array) => unknown,
  }],
  [219, {
    msgid: 219,
    name: 'GOPRO_SET_RESPONSE',
    crcExtra: 162,
    minLength: 2,
    maxLength: 2,
    serialize: serializeGoproSetResponse as (msg: unknown) => Uint8Array,
    deserialize: deserializeGoproSetResponse as (payload: Uint8Array) => unknown,
  }],
  [220, {
    msgid: 220,
    name: 'NAV_FILTER_BIAS',
    crcExtra: 34,
    minLength: 32,
    maxLength: 32,
    serialize: serializeNavFilterBias as (msg: unknown) => Uint8Array,
    deserialize: deserializeNavFilterBias as (payload: Uint8Array) => unknown,
  }],
  [221, {
    msgid: 221,
    name: 'RADIO_CALIBRATION',
    crcExtra: 71,
    minLength: 42,
    maxLength: 42,
    serialize: serializeRadioCalibration as (msg: unknown) => Uint8Array,
    deserialize: deserializeRadioCalibration as (payload: Uint8Array) => unknown,
  }],
  [222, {
    msgid: 222,
    name: 'UALBERTA_SYS_STATUS',
    crcExtra: 15,
    minLength: 3,
    maxLength: 3,
    serialize: serializeUalbertaSysStatus as (msg: unknown) => Uint8Array,
    deserialize: deserializeUalbertaSysStatus as (payload: Uint8Array) => unknown,
  }],
  [223, {
    msgid: 223,
    name: 'COMMAND_INT_STAMPED',
    crcExtra: 119,
    minLength: 47,
    maxLength: 47,
    serialize: serializeCommandIntStamped as (msg: unknown) => Uint8Array,
    deserialize: deserializeCommandIntStamped as (payload: Uint8Array) => unknown,
  }],
  [224, {
    msgid: 224,
    name: 'COMMAND_LONG_STAMPED',
    crcExtra: 102,
    minLength: 45,
    maxLength: 45,
    serialize: serializeCommandLongStamped as (msg: unknown) => Uint8Array,
    deserialize: deserializeCommandLongStamped as (payload: Uint8Array) => unknown,
  }],
  [225, {
    msgid: 225,
    name: 'EFI_STATUS',
    crcExtra: 10,
    minLength: 73,
    maxLength: 73,
    serialize: serializeEfiStatus as (msg: unknown) => Uint8Array,
    deserialize: deserializeEfiStatus as (payload: Uint8Array) => unknown,
  }],
  [226, {
    msgid: 226,
    name: 'RPM',
    crcExtra: 207,
    minLength: 8,
    maxLength: 8,
    serialize: serializeRpm as (msg: unknown) => Uint8Array,
    deserialize: deserializeRpm as (payload: Uint8Array) => unknown,
  }],
  [230, {
    msgid: 230,
    name: 'ESTIMATOR_STATUS',
    crcExtra: 163,
    minLength: 42,
    maxLength: 42,
    serialize: serializeEstimatorStatus as (msg: unknown) => Uint8Array,
    deserialize: deserializeEstimatorStatus as (payload: Uint8Array) => unknown,
  }],
  [231, {
    msgid: 231,
    name: 'WIND_COV',
    crcExtra: 105,
    minLength: 40,
    maxLength: 40,
    serialize: serializeWindCov as (msg: unknown) => Uint8Array,
    deserialize: deserializeWindCov as (payload: Uint8Array) => unknown,
  }],
  [232, {
    msgid: 232,
    name: 'GPS_INPUT',
    crcExtra: 187,
    minLength: 65,
    maxLength: 65,
    serialize: serializeGpsInput as (msg: unknown) => Uint8Array,
    deserialize: deserializeGpsInput as (payload: Uint8Array) => unknown,
  }],
  [233, {
    msgid: 233,
    name: 'GPS_RTCM_DATA',
    crcExtra: 35,
    minLength: 182,
    maxLength: 182,
    serialize: serializeGpsRtcmData as (msg: unknown) => Uint8Array,
    deserialize: deserializeGpsRtcmData as (payload: Uint8Array) => unknown,
  }],
  [234, {
    msgid: 234,
    name: 'HIGH_LATENCY',
    crcExtra: 150,
    minLength: 40,
    maxLength: 40,
    serialize: serializeHighLatency as (msg: unknown) => Uint8Array,
    deserialize: deserializeHighLatency as (payload: Uint8Array) => unknown,
  }],
  [235, {
    msgid: 235,
    name: 'HIGH_LATENCY2',
    crcExtra: 179,
    minLength: 42,
    maxLength: 42,
    serialize: serializeHighLatency2 as (msg: unknown) => Uint8Array,
    deserialize: deserializeHighLatency2 as (payload: Uint8Array) => unknown,
  }],
  [241, {
    msgid: 241,
    name: 'VIBRATION',
    crcExtra: 90,
    minLength: 32,
    maxLength: 32,
    serialize: serializeVibration as (msg: unknown) => Uint8Array,
    deserialize: deserializeVibration as (payload: Uint8Array) => unknown,
  }],
  [242, {
    msgid: 242,
    name: 'HOME_POSITION',
    crcExtra: 1,
    minLength: 60,
    maxLength: 60,
    serialize: serializeHomePosition as (msg: unknown) => Uint8Array,
    deserialize: deserializeHomePosition as (payload: Uint8Array) => unknown,
  }],
  [243, {
    msgid: 243,
    name: 'SET_HOME_POSITION',
    crcExtra: 57,
    minLength: 61,
    maxLength: 61,
    serialize: serializeSetHomePosition as (msg: unknown) => Uint8Array,
    deserialize: deserializeSetHomePosition as (payload: Uint8Array) => unknown,
  }],
  [244, {
    msgid: 244,
    name: 'MESSAGE_INTERVAL',
    crcExtra: 95,
    minLength: 6,
    maxLength: 6,
    serialize: serializeMessageInterval as (msg: unknown) => Uint8Array,
    deserialize: deserializeMessageInterval as (payload: Uint8Array) => unknown,
  }],
  [245, {
    msgid: 245,
    name: 'EXTENDED_SYS_STATE',
    crcExtra: 130,
    minLength: 2,
    maxLength: 2,
    serialize: serializeExtendedSysState as (msg: unknown) => Uint8Array,
    deserialize: deserializeExtendedSysState as (payload: Uint8Array) => unknown,
  }],
  [246, {
    msgid: 246,
    name: 'ADSB_VEHICLE',
    crcExtra: 184,
    minLength: 38,
    maxLength: 38,
    serialize: serializeAdsbVehicle as (msg: unknown) => Uint8Array,
    deserialize: deserializeAdsbVehicle as (payload: Uint8Array) => unknown,
  }],
  [247, {
    msgid: 247,
    name: 'COLLISION',
    crcExtra: 81,
    minLength: 19,
    maxLength: 19,
    serialize: serializeCollision as (msg: unknown) => Uint8Array,
    deserialize: deserializeCollision as (payload: Uint8Array) => unknown,
  }],
  [248, {
    msgid: 248,
    name: 'V2_EXTENSION',
    crcExtra: 8,
    minLength: 254,
    maxLength: 254,
    serialize: serializeV2Extension as (msg: unknown) => Uint8Array,
    deserialize: deserializeV2Extension as (payload: Uint8Array) => unknown,
  }],
  [249, {
    msgid: 249,
    name: 'MEMORY_VECT',
    crcExtra: 204,
    minLength: 36,
    maxLength: 36,
    serialize: serializeMemoryVect as (msg: unknown) => Uint8Array,
    deserialize: deserializeMemoryVect as (payload: Uint8Array) => unknown,
  }],
  [250, {
    msgid: 250,
    name: 'DEBUG_VECT',
    crcExtra: 49,
    minLength: 30,
    maxLength: 30,
    serialize: serializeDebugVect as (msg: unknown) => Uint8Array,
    deserialize: deserializeDebugVect as (payload: Uint8Array) => unknown,
  }],
  [251, {
    msgid: 251,
    name: 'NAMED_VALUE_FLOAT',
    crcExtra: 170,
    minLength: 18,
    maxLength: 18,
    serialize: serializeNamedValueFloat as (msg: unknown) => Uint8Array,
    deserialize: deserializeNamedValueFloat as (payload: Uint8Array) => unknown,
  }],
  [252, {
    msgid: 252,
    name: 'NAMED_VALUE_INT',
    crcExtra: 44,
    minLength: 18,
    maxLength: 18,
    serialize: serializeNamedValueInt as (msg: unknown) => Uint8Array,
    deserialize: deserializeNamedValueInt as (payload: Uint8Array) => unknown,
  }],
  [253, {
    msgid: 253,
    name: 'STATUSTEXT',
    crcExtra: 66,
    minLength: 54,
    maxLength: 54,
    serialize: serializeStatustext as (msg: unknown) => Uint8Array,
    deserialize: deserializeStatustext as (payload: Uint8Array) => unknown,
  }],
  [254, {
    msgid: 254,
    name: 'DEBUG',
    crcExtra: 46,
    minLength: 9,
    maxLength: 9,
    serialize: serializeDebug as (msg: unknown) => Uint8Array,
    deserialize: deserializeDebug as (payload: Uint8Array) => unknown,
  }],
  [256, {
    msgid: 256,
    name: 'SETUP_SIGNING',
    crcExtra: 71,
    minLength: 42,
    maxLength: 42,
    serialize: serializeSetupSigning as (msg: unknown) => Uint8Array,
    deserialize: deserializeSetupSigning as (payload: Uint8Array) => unknown,
  }],
  [257, {
    msgid: 257,
    name: 'BUTTON_CHANGE',
    crcExtra: 131,
    minLength: 9,
    maxLength: 9,
    serialize: serializeButtonChange as (msg: unknown) => Uint8Array,
    deserialize: deserializeButtonChange as (payload: Uint8Array) => unknown,
  }],
  [258, {
    msgid: 258,
    name: 'PLAY_TUNE',
    crcExtra: 139,
    minLength: 232,
    maxLength: 232,
    serialize: serializePlayTune as (msg: unknown) => Uint8Array,
    deserialize: deserializePlayTune as (payload: Uint8Array) => unknown,
  }],
  [259, {
    msgid: 259,
    name: 'CAMERA_INFORMATION',
    crcExtra: 160,
    minLength: 236,
    maxLength: 236,
    serialize: serializeCameraInformation as (msg: unknown) => Uint8Array,
    deserialize: deserializeCameraInformation as (payload: Uint8Array) => unknown,
  }],
  [260, {
    msgid: 260,
    name: 'CAMERA_SETTINGS',
    crcExtra: 8,
    minLength: 13,
    maxLength: 13,
    serialize: serializeCameraSettings as (msg: unknown) => Uint8Array,
    deserialize: deserializeCameraSettings as (payload: Uint8Array) => unknown,
  }],
  [261, {
    msgid: 261,
    name: 'STORAGE_INFORMATION',
    crcExtra: 114,
    minLength: 60,
    maxLength: 60,
    serialize: serializeStorageInformation as (msg: unknown) => Uint8Array,
    deserialize: deserializeStorageInformation as (payload: Uint8Array) => unknown,
  }],
  [262, {
    msgid: 262,
    name: 'CAMERA_CAPTURE_STATUS',
    crcExtra: 196,
    minLength: 22,
    maxLength: 22,
    serialize: serializeCameraCaptureStatus as (msg: unknown) => Uint8Array,
    deserialize: deserializeCameraCaptureStatus as (payload: Uint8Array) => unknown,
  }],
  [263, {
    msgid: 263,
    name: 'CAMERA_IMAGE_CAPTURED',
    crcExtra: 133,
    minLength: 255,
    maxLength: 255,
    serialize: serializeCameraImageCaptured as (msg: unknown) => Uint8Array,
    deserialize: deserializeCameraImageCaptured as (payload: Uint8Array) => unknown,
  }],
  [264, {
    msgid: 264,
    name: 'FLIGHT_INFORMATION',
    crcExtra: 49,
    minLength: 28,
    maxLength: 28,
    serialize: serializeFlightInformation as (msg: unknown) => Uint8Array,
    deserialize: deserializeFlightInformation as (payload: Uint8Array) => unknown,
  }],
  [265, {
    msgid: 265,
    name: 'MOUNT_ORIENTATION',
    crcExtra: 77,
    minLength: 20,
    maxLength: 20,
    serialize: serializeMountOrientation as (msg: unknown) => Uint8Array,
    deserialize: deserializeMountOrientation as (payload: Uint8Array) => unknown,
  }],
  [266, {
    msgid: 266,
    name: 'LOGGING_DATA',
    crcExtra: 193,
    minLength: 255,
    maxLength: 255,
    serialize: serializeLoggingData as (msg: unknown) => Uint8Array,
    deserialize: deserializeLoggingData as (payload: Uint8Array) => unknown,
  }],
  [267, {
    msgid: 267,
    name: 'LOGGING_DATA_ACKED',
    crcExtra: 35,
    minLength: 255,
    maxLength: 255,
    serialize: serializeLoggingDataAcked as (msg: unknown) => Uint8Array,
    deserialize: deserializeLoggingDataAcked as (payload: Uint8Array) => unknown,
  }],
  [268, {
    msgid: 268,
    name: 'LOGGING_ACK',
    crcExtra: 14,
    minLength: 4,
    maxLength: 4,
    serialize: serializeLoggingAck as (msg: unknown) => Uint8Array,
    deserialize: deserializeLoggingAck as (payload: Uint8Array) => unknown,
  }],
  [269, {
    msgid: 269,
    name: 'VIDEO_STREAM_INFORMATION',
    crcExtra: 51,
    minLength: 214,
    maxLength: 214,
    serialize: serializeVideoStreamInformation as (msg: unknown) => Uint8Array,
    deserialize: deserializeVideoStreamInformation as (payload: Uint8Array) => unknown,
  }],
  [270, {
    msgid: 270,
    name: 'VIDEO_STREAM_STATUS',
    crcExtra: 59,
    minLength: 19,
    maxLength: 19,
    serialize: serializeVideoStreamStatus as (msg: unknown) => Uint8Array,
    deserialize: deserializeVideoStreamStatus as (payload: Uint8Array) => unknown,
  }],
  [271, {
    msgid: 271,
    name: 'CAMERA_FOV_STATUS',
    crcExtra: 22,
    minLength: 52,
    maxLength: 52,
    serialize: serializeCameraFovStatus as (msg: unknown) => Uint8Array,
    deserialize: deserializeCameraFovStatus as (payload: Uint8Array) => unknown,
  }],
  [275, {
    msgid: 275,
    name: 'CAMERA_TRACKING_IMAGE_STATUS',
    crcExtra: 126,
    minLength: 31,
    maxLength: 31,
    serialize: serializeCameraTrackingImageStatus as (msg: unknown) => Uint8Array,
    deserialize: deserializeCameraTrackingImageStatus as (payload: Uint8Array) => unknown,
  }],
  [276, {
    msgid: 276,
    name: 'CAMERA_TRACKING_GEO_STATUS',
    crcExtra: 18,
    minLength: 49,
    maxLength: 49,
    serialize: serializeCameraTrackingGeoStatus as (msg: unknown) => Uint8Array,
    deserialize: deserializeCameraTrackingGeoStatus as (payload: Uint8Array) => unknown,
  }],
  [277, {
    msgid: 277,
    name: 'CAMERA_THERMAL_RANGE',
    crcExtra: 62,
    minLength: 30,
    maxLength: 30,
    serialize: serializeCameraThermalRange as (msg: unknown) => Uint8Array,
    deserialize: deserializeCameraThermalRange as (payload: Uint8Array) => unknown,
  }],
  [280, {
    msgid: 280,
    name: 'GIMBAL_MANAGER_INFORMATION',
    crcExtra: 70,
    minLength: 33,
    maxLength: 33,
    serialize: serializeGimbalManagerInformation as (msg: unknown) => Uint8Array,
    deserialize: deserializeGimbalManagerInformation as (payload: Uint8Array) => unknown,
  }],
  [281, {
    msgid: 281,
    name: 'GIMBAL_MANAGER_STATUS',
    crcExtra: 48,
    minLength: 13,
    maxLength: 13,
    serialize: serializeGimbalManagerStatus as (msg: unknown) => Uint8Array,
    deserialize: deserializeGimbalManagerStatus as (payload: Uint8Array) => unknown,
  }],
  [282, {
    msgid: 282,
    name: 'GIMBAL_MANAGER_SET_ATTITUDE',
    crcExtra: 123,
    minLength: 35,
    maxLength: 35,
    serialize: serializeGimbalManagerSetAttitude as (msg: unknown) => Uint8Array,
    deserialize: deserializeGimbalManagerSetAttitude as (payload: Uint8Array) => unknown,
  }],
  [283, {
    msgid: 283,
    name: 'GIMBAL_DEVICE_INFORMATION',
    crcExtra: 205,
    minLength: 145,
    maxLength: 145,
    serialize: serializeGimbalDeviceInformation as (msg: unknown) => Uint8Array,
    deserialize: deserializeGimbalDeviceInformation as (payload: Uint8Array) => unknown,
  }],
  [284, {
    msgid: 284,
    name: 'GIMBAL_DEVICE_SET_ATTITUDE',
    crcExtra: 99,
    minLength: 32,
    maxLength: 32,
    serialize: serializeGimbalDeviceSetAttitude as (msg: unknown) => Uint8Array,
    deserialize: deserializeGimbalDeviceSetAttitude as (payload: Uint8Array) => unknown,
  }],
  [285, {
    msgid: 285,
    name: 'GIMBAL_DEVICE_ATTITUDE_STATUS',
    crcExtra: 234,
    minLength: 49,
    maxLength: 49,
    serialize: serializeGimbalDeviceAttitudeStatus as (msg: unknown) => Uint8Array,
    deserialize: deserializeGimbalDeviceAttitudeStatus as (payload: Uint8Array) => unknown,
  }],
  [286, {
    msgid: 286,
    name: 'AUTOPILOT_STATE_FOR_GIMBAL_DEVICE',
    crcExtra: 31,
    minLength: 57,
    maxLength: 57,
    serialize: serializeAutopilotStateForGimbalDevice as (msg: unknown) => Uint8Array,
    deserialize: deserializeAutopilotStateForGimbalDevice as (payload: Uint8Array) => unknown,
  }],
  [287, {
    msgid: 287,
    name: 'GIMBAL_MANAGER_SET_PITCHYAW',
    crcExtra: 1,
    minLength: 23,
    maxLength: 23,
    serialize: serializeGimbalManagerSetPitchyaw as (msg: unknown) => Uint8Array,
    deserialize: deserializeGimbalManagerSetPitchyaw as (payload: Uint8Array) => unknown,
  }],
  [288, {
    msgid: 288,
    name: 'GIMBAL_MANAGER_SET_MANUAL_CONTROL',
    crcExtra: 20,
    minLength: 23,
    maxLength: 23,
    serialize: serializeGimbalManagerSetManualControl as (msg: unknown) => Uint8Array,
    deserialize: deserializeGimbalManagerSetManualControl as (payload: Uint8Array) => unknown,
  }],
  [295, {
    msgid: 295,
    name: 'AIRSPEED',
    crcExtra: 234,
    minLength: 12,
    maxLength: 12,
    serialize: serializeAirspeed as (msg: unknown) => Uint8Array,
    deserialize: deserializeAirspeed as (payload: Uint8Array) => unknown,
  }],
  [299, {
    msgid: 299,
    name: 'WIFI_CONFIG_AP',
    crcExtra: 19,
    minLength: 96,
    maxLength: 96,
    serialize: serializeWifiConfigAp as (msg: unknown) => Uint8Array,
    deserialize: deserializeWifiConfigAp as (payload: Uint8Array) => unknown,
  }],
  [301, {
    msgid: 301,
    name: 'AIS_VESSEL',
    crcExtra: 243,
    minLength: 58,
    maxLength: 58,
    serialize: serializeAisVessel as (msg: unknown) => Uint8Array,
    deserialize: deserializeAisVessel as (payload: Uint8Array) => unknown,
  }],
  [310, {
    msgid: 310,
    name: 'UAVCAN_NODE_STATUS',
    crcExtra: 28,
    minLength: 17,
    maxLength: 17,
    serialize: serializeUavcanNodeStatus as (msg: unknown) => Uint8Array,
    deserialize: deserializeUavcanNodeStatus as (payload: Uint8Array) => unknown,
  }],
  [311, {
    msgid: 311,
    name: 'UAVCAN_NODE_INFO',
    crcExtra: 95,
    minLength: 116,
    maxLength: 116,
    serialize: serializeUavcanNodeInfo as (msg: unknown) => Uint8Array,
    deserialize: deserializeUavcanNodeInfo as (payload: Uint8Array) => unknown,
  }],
  [320, {
    msgid: 320,
    name: 'PARAM_EXT_REQUEST_READ',
    crcExtra: 243,
    minLength: 20,
    maxLength: 20,
    serialize: serializeParamExtRequestRead as (msg: unknown) => Uint8Array,
    deserialize: deserializeParamExtRequestRead as (payload: Uint8Array) => unknown,
  }],
  [321, {
    msgid: 321,
    name: 'PARAM_EXT_REQUEST_LIST',
    crcExtra: 88,
    minLength: 2,
    maxLength: 2,
    serialize: serializeParamExtRequestList as (msg: unknown) => Uint8Array,
    deserialize: deserializeParamExtRequestList as (payload: Uint8Array) => unknown,
  }],
  [322, {
    msgid: 322,
    name: 'PARAM_EXT_VALUE',
    crcExtra: 243,
    minLength: 149,
    maxLength: 149,
    serialize: serializeParamExtValue as (msg: unknown) => Uint8Array,
    deserialize: deserializeParamExtValue as (payload: Uint8Array) => unknown,
  }],
  [323, {
    msgid: 323,
    name: 'PARAM_EXT_SET',
    crcExtra: 78,
    minLength: 147,
    maxLength: 147,
    serialize: serializeParamExtSet as (msg: unknown) => Uint8Array,
    deserialize: deserializeParamExtSet as (payload: Uint8Array) => unknown,
  }],
  [324, {
    msgid: 324,
    name: 'PARAM_EXT_ACK',
    crcExtra: 132,
    minLength: 146,
    maxLength: 146,
    serialize: serializeParamExtAck as (msg: unknown) => Uint8Array,
    deserialize: deserializeParamExtAck as (payload: Uint8Array) => unknown,
  }],
  [330, {
    msgid: 330,
    name: 'OBSTACLE_DISTANCE',
    crcExtra: 183,
    minLength: 167,
    maxLength: 167,
    serialize: serializeObstacleDistance as (msg: unknown) => Uint8Array,
    deserialize: deserializeObstacleDistance as (payload: Uint8Array) => unknown,
  }],
  [331, {
    msgid: 331,
    name: 'ODOMETRY',
    crcExtra: 147,
    minLength: 233,
    maxLength: 233,
    serialize: serializeOdometry as (msg: unknown) => Uint8Array,
    deserialize: deserializeOdometry as (payload: Uint8Array) => unknown,
  }],
  [332, {
    msgid: 332,
    name: 'TRAJECTORY_REPRESENTATION_WAYPOINTS',
    crcExtra: 236,
    minLength: 239,
    maxLength: 239,
    serialize: serializeTrajectoryRepresentationWaypoints as (msg: unknown) => Uint8Array,
    deserialize: deserializeTrajectoryRepresentationWaypoints as (payload: Uint8Array) => unknown,
  }],
  [333, {
    msgid: 333,
    name: 'TRAJECTORY_REPRESENTATION_BEZIER',
    crcExtra: 231,
    minLength: 109,
    maxLength: 109,
    serialize: serializeTrajectoryRepresentationBezier as (msg: unknown) => Uint8Array,
    deserialize: deserializeTrajectoryRepresentationBezier as (payload: Uint8Array) => unknown,
  }],
  [335, {
    msgid: 335,
    name: 'ISBD_LINK_STATUS',
    crcExtra: 225,
    minLength: 24,
    maxLength: 24,
    serialize: serializeIsbdLinkStatus as (msg: unknown) => Uint8Array,
    deserialize: deserializeIsbdLinkStatus as (payload: Uint8Array) => unknown,
  }],
  [339, {
    msgid: 339,
    name: 'RAW_RPM',
    crcExtra: 199,
    minLength: 5,
    maxLength: 5,
    serialize: serializeRawRpm as (msg: unknown) => Uint8Array,
    deserialize: deserializeRawRpm as (payload: Uint8Array) => unknown,
  }],
  [340, {
    msgid: 340,
    name: 'UTM_GLOBAL_POSITION',
    crcExtra: 99,
    minLength: 70,
    maxLength: 70,
    serialize: serializeUtmGlobalPosition as (msg: unknown) => Uint8Array,
    deserialize: deserializeUtmGlobalPosition as (payload: Uint8Array) => unknown,
  }],
  [345, {
    msgid: 345,
    name: 'PARAM_ERROR',
    crcExtra: 209,
    minLength: 21,
    maxLength: 21,
    serialize: serializeParamError as (msg: unknown) => Uint8Array,
    deserialize: deserializeParamError as (payload: Uint8Array) => unknown,
  }],
  [350, {
    msgid: 350,
    name: 'DEBUG_FLOAT_ARRAY',
    crcExtra: 68,
    minLength: 252,
    maxLength: 252,
    serialize: serializeDebugFloatArray as (msg: unknown) => Uint8Array,
    deserialize: deserializeDebugFloatArray as (payload: Uint8Array) => unknown,
  }],
  [370, {
    msgid: 370,
    name: 'SMART_BATTERY_INFO',
    crcExtra: 98,
    minLength: 109,
    maxLength: 109,
    serialize: serializeSmartBatteryInfo as (msg: unknown) => Uint8Array,
    deserialize: deserializeSmartBatteryInfo as (payload: Uint8Array) => unknown,
  }],
  [373, {
    msgid: 373,
    name: 'GENERATOR_STATUS',
    crcExtra: 117,
    minLength: 42,
    maxLength: 42,
    serialize: serializeGeneratorStatus as (msg: unknown) => Uint8Array,
    deserialize: deserializeGeneratorStatus as (payload: Uint8Array) => unknown,
  }],
  [375, {
    msgid: 375,
    name: 'ACTUATOR_OUTPUT_STATUS',
    crcExtra: 251,
    minLength: 140,
    maxLength: 140,
    serialize: serializeActuatorOutputStatus as (msg: unknown) => Uint8Array,
    deserialize: deserializeActuatorOutputStatus as (payload: Uint8Array) => unknown,
  }],
  [376, {
    msgid: 376,
    name: 'RELAY_STATUS',
    crcExtra: 199,
    minLength: 8,
    maxLength: 8,
    serialize: serializeRelayStatus as (msg: unknown) => Uint8Array,
    deserialize: deserializeRelayStatus as (payload: Uint8Array) => unknown,
  }],
  [385, {
    msgid: 385,
    name: 'TUNNEL',
    crcExtra: 147,
    minLength: 133,
    maxLength: 133,
    serialize: serializeTunnel as (msg: unknown) => Uint8Array,
    deserialize: deserializeTunnel as (payload: Uint8Array) => unknown,
  }],
  [386, {
    msgid: 386,
    name: 'CAN_FRAME',
    crcExtra: 132,
    minLength: 16,
    maxLength: 16,
    serialize: serializeCanFrame as (msg: unknown) => Uint8Array,
    deserialize: deserializeCanFrame as (payload: Uint8Array) => unknown,
  }],
  [387, {
    msgid: 387,
    name: 'CANFD_FRAME',
    crcExtra: 4,
    minLength: 72,
    maxLength: 72,
    serialize: serializeCanfdFrame as (msg: unknown) => Uint8Array,
    deserialize: deserializeCanfdFrame as (payload: Uint8Array) => unknown,
  }],
  [388, {
    msgid: 388,
    name: 'CAN_FILTER_MODIFY',
    crcExtra: 8,
    minLength: 37,
    maxLength: 37,
    serialize: serializeCanFilterModify as (msg: unknown) => Uint8Array,
    deserialize: deserializeCanFilterModify as (payload: Uint8Array) => unknown,
  }],
  [420, {
    msgid: 420,
    name: 'RADIO_RC_CHANNELS',
    crcExtra: 189,
    minLength: 73,
    maxLength: 73,
    serialize: serializeRadioRcChannels as (msg: unknown) => Uint8Array,
    deserialize: deserializeRadioRcChannels as (payload: Uint8Array) => unknown,
  }],
  [435, {
    msgid: 435,
    name: 'AVAILABLE_MODES',
    crcExtra: 134,
    minLength: 46,
    maxLength: 46,
    serialize: serializeAvailableModes as (msg: unknown) => Uint8Array,
    deserialize: deserializeAvailableModes as (payload: Uint8Array) => unknown,
  }],
  [436, {
    msgid: 436,
    name: 'CURRENT_MODE',
    crcExtra: 193,
    minLength: 9,
    maxLength: 9,
    serialize: serializeCurrentMode as (msg: unknown) => Uint8Array,
    deserialize: deserializeCurrentMode as (payload: Uint8Array) => unknown,
  }],
  [437, {
    msgid: 437,
    name: 'AVAILABLE_MODES_MONITOR',
    crcExtra: 30,
    minLength: 1,
    maxLength: 1,
    serialize: serializeAvailableModesMonitor as (msg: unknown) => Uint8Array,
    deserialize: deserializeAvailableModesMonitor as (payload: Uint8Array) => unknown,
  }],
  [441, {
    msgid: 441,
    name: 'GNSS_INTEGRITY',
    crcExtra: 169,
    minLength: 17,
    maxLength: 17,
    serialize: serializeGnssIntegrity as (msg: unknown) => Uint8Array,
    deserialize: deserializeGnssIntegrity as (payload: Uint8Array) => unknown,
  }],
  [8002, {
    msgid: 8002,
    name: 'SENS_POWER',
    crcExtra: 218,
    minLength: 16,
    maxLength: 16,
    serialize: serializeSensPower as (msg: unknown) => Uint8Array,
    deserialize: deserializeSensPower as (payload: Uint8Array) => unknown,
  }],
  [8003, {
    msgid: 8003,
    name: 'SENS_MPPT',
    crcExtra: 231,
    minLength: 41,
    maxLength: 41,
    serialize: serializeSensMppt as (msg: unknown) => Uint8Array,
    deserialize: deserializeSensMppt as (payload: Uint8Array) => unknown,
  }],
  [8004, {
    msgid: 8004,
    name: 'ASLCTRL_DATA',
    crcExtra: 172,
    minLength: 98,
    maxLength: 98,
    serialize: serializeAslctrlData as (msg: unknown) => Uint8Array,
    deserialize: deserializeAslctrlData as (payload: Uint8Array) => unknown,
  }],
  [8005, {
    msgid: 8005,
    name: 'ASLCTRL_DEBUG',
    crcExtra: 251,
    minLength: 38,
    maxLength: 38,
    serialize: serializeAslctrlDebug as (msg: unknown) => Uint8Array,
    deserialize: deserializeAslctrlDebug as (payload: Uint8Array) => unknown,
  }],
  [8006, {
    msgid: 8006,
    name: 'ASLUAV_STATUS',
    crcExtra: 97,
    minLength: 14,
    maxLength: 14,
    serialize: serializeAsluavStatus as (msg: unknown) => Uint8Array,
    deserialize: deserializeAsluavStatus as (payload: Uint8Array) => unknown,
  }],
  [8007, {
    msgid: 8007,
    name: 'EKF_EXT',
    crcExtra: 64,
    minLength: 32,
    maxLength: 32,
    serialize: serializeEkfExt as (msg: unknown) => Uint8Array,
    deserialize: deserializeEkfExt as (payload: Uint8Array) => unknown,
  }],
  [8008, {
    msgid: 8008,
    name: 'ASL_OBCTRL',
    crcExtra: 234,
    minLength: 33,
    maxLength: 33,
    serialize: serializeAslObctrl as (msg: unknown) => Uint8Array,
    deserialize: deserializeAslObctrl as (payload: Uint8Array) => unknown,
  }],
  [8009, {
    msgid: 8009,
    name: 'SENS_ATMOS',
    crcExtra: 144,
    minLength: 16,
    maxLength: 16,
    serialize: serializeSensAtmos as (msg: unknown) => Uint8Array,
    deserialize: deserializeSensAtmos as (payload: Uint8Array) => unknown,
  }],
  [8010, {
    msgid: 8010,
    name: 'SENS_BATMON',
    crcExtra: 155,
    minLength: 41,
    maxLength: 41,
    serialize: serializeSensBatmon as (msg: unknown) => Uint8Array,
    deserialize: deserializeSensBatmon as (payload: Uint8Array) => unknown,
  }],
  [8011, {
    msgid: 8011,
    name: 'FW_SOARING_DATA',
    crcExtra: 20,
    minLength: 102,
    maxLength: 102,
    serialize: serializeFwSoaringData as (msg: unknown) => Uint8Array,
    deserialize: deserializeFwSoaringData as (payload: Uint8Array) => unknown,
  }],
  [8012, {
    msgid: 8012,
    name: 'SENSORPOD_STATUS',
    crcExtra: 54,
    minLength: 16,
    maxLength: 16,
    serialize: serializeSensorpodStatus as (msg: unknown) => Uint8Array,
    deserialize: deserializeSensorpodStatus as (payload: Uint8Array) => unknown,
  }],
  [8013, {
    msgid: 8013,
    name: 'SENS_POWER_BOARD',
    crcExtra: 222,
    minLength: 46,
    maxLength: 46,
    serialize: serializeSensPowerBoard as (msg: unknown) => Uint8Array,
    deserialize: deserializeSensPowerBoard as (payload: Uint8Array) => unknown,
  }],
  [8014, {
    msgid: 8014,
    name: 'GSM_LINK_STATUS',
    crcExtra: 200,
    minLength: 14,
    maxLength: 14,
    serialize: serializeGsmLinkStatus as (msg: unknown) => Uint8Array,
    deserialize: deserializeGsmLinkStatus as (payload: Uint8Array) => unknown,
  }],
  [8015, {
    msgid: 8015,
    name: 'SATCOM_LINK_STATUS',
    crcExtra: 23,
    minLength: 24,
    maxLength: 24,
    serialize: serializeSatcomLinkStatus as (msg: unknown) => Uint8Array,
    deserialize: deserializeSatcomLinkStatus as (payload: Uint8Array) => unknown,
  }],
  [8016, {
    msgid: 8016,
    name: 'SENSOR_AIRFLOW_ANGLES',
    crcExtra: 149,
    minLength: 18,
    maxLength: 18,
    serialize: serializeSensorAirflowAngles as (msg: unknown) => Uint8Array,
    deserialize: deserializeSensorAirflowAngles as (payload: Uint8Array) => unknown,
  }],
  [9000, {
    msgid: 9000,
    name: 'WHEEL_DISTANCE',
    crcExtra: 113,
    minLength: 137,
    maxLength: 137,
    serialize: serializeWheelDistance as (msg: unknown) => Uint8Array,
    deserialize: deserializeWheelDistance as (payload: Uint8Array) => unknown,
  }],
  [9005, {
    msgid: 9005,
    name: 'WINCH_STATUS',
    crcExtra: 117,
    minLength: 34,
    maxLength: 34,
    serialize: serializeWinchStatus as (msg: unknown) => Uint8Array,
    deserialize: deserializeWinchStatus as (payload: Uint8Array) => unknown,
  }],
  [10001, {
    msgid: 10001,
    name: 'UAVIONIX_ADSB_OUT_CFG',
    crcExtra: 209,
    minLength: 20,
    maxLength: 20,
    serialize: serializeUavionixAdsbOutCfg as (msg: unknown) => Uint8Array,
    deserialize: deserializeUavionixAdsbOutCfg as (payload: Uint8Array) => unknown,
  }],
  [10002, {
    msgid: 10002,
    name: 'UAVIONIX_ADSB_OUT_DYNAMIC',
    crcExtra: 186,
    minLength: 41,
    maxLength: 41,
    serialize: serializeUavionixAdsbOutDynamic as (msg: unknown) => Uint8Array,
    deserialize: deserializeUavionixAdsbOutDynamic as (payload: Uint8Array) => unknown,
  }],
  [10003, {
    msgid: 10003,
    name: 'UAVIONIX_ADSB_TRANSCEIVER_HEALTH_REPORT',
    crcExtra: 4,
    minLength: 1,
    maxLength: 1,
    serialize: serializeUavionixAdsbTransceiverHealthReport as (msg: unknown) => Uint8Array,
    deserialize: deserializeUavionixAdsbTransceiverHealthReport as (payload: Uint8Array) => unknown,
  }],
  [10004, {
    msgid: 10004,
    name: 'UAVIONIX_ADSB_OUT_CFG_REGISTRATION',
    crcExtra: 133,
    minLength: 9,
    maxLength: 9,
    serialize: serializeUavionixAdsbOutCfgRegistration as (msg: unknown) => Uint8Array,
    deserialize: deserializeUavionixAdsbOutCfgRegistration as (payload: Uint8Array) => unknown,
  }],
  [10005, {
    msgid: 10005,
    name: 'UAVIONIX_ADSB_OUT_CFG_FLIGHTID',
    crcExtra: 103,
    minLength: 9,
    maxLength: 9,
    serialize: serializeUavionixAdsbOutCfgFlightid as (msg: unknown) => Uint8Array,
    deserialize: deserializeUavionixAdsbOutCfgFlightid as (payload: Uint8Array) => unknown,
  }],
  [10006, {
    msgid: 10006,
    name: 'UAVIONIX_ADSB_GET',
    crcExtra: 193,
    minLength: 4,
    maxLength: 4,
    serialize: serializeUavionixAdsbGet as (msg: unknown) => Uint8Array,
    deserialize: deserializeUavionixAdsbGet as (payload: Uint8Array) => unknown,
  }],
  [10007, {
    msgid: 10007,
    name: 'UAVIONIX_ADSB_OUT_CONTROL',
    crcExtra: 71,
    minLength: 17,
    maxLength: 17,
    serialize: serializeUavionixAdsbOutControl as (msg: unknown) => Uint8Array,
    deserialize: deserializeUavionixAdsbOutControl as (payload: Uint8Array) => unknown,
  }],
  [10008, {
    msgid: 10008,
    name: 'UAVIONIX_ADSB_OUT_STATUS',
    crcExtra: 240,
    minLength: 14,
    maxLength: 14,
    serialize: serializeUavionixAdsbOutStatus as (msg: unknown) => Uint8Array,
    deserialize: deserializeUavionixAdsbOutStatus as (payload: Uint8Array) => unknown,
  }],
  [10151, {
    msgid: 10151,
    name: 'LOWEHEISER_GOV_EFI',
    crcExtra: 195,
    minLength: 85,
    maxLength: 85,
    serialize: serializeLoweheiserGovEfi as (msg: unknown) => Uint8Array,
    deserialize: deserializeLoweheiserGovEfi as (payload: Uint8Array) => unknown,
  }],
  [11000, {
    msgid: 11000,
    name: 'DEVICE_OP_READ',
    crcExtra: 187,
    minLength: 52,
    maxLength: 52,
    serialize: serializeDeviceOpRead as (msg: unknown) => Uint8Array,
    deserialize: deserializeDeviceOpRead as (payload: Uint8Array) => unknown,
  }],
  [11001, {
    msgid: 11001,
    name: 'DEVICE_OP_READ_REPLY',
    crcExtra: 206,
    minLength: 136,
    maxLength: 136,
    serialize: serializeDeviceOpReadReply as (msg: unknown) => Uint8Array,
    deserialize: deserializeDeviceOpReadReply as (payload: Uint8Array) => unknown,
  }],
  [11002, {
    msgid: 11002,
    name: 'DEVICE_OP_WRITE',
    crcExtra: 71,
    minLength: 180,
    maxLength: 180,
    serialize: serializeDeviceOpWrite as (msg: unknown) => Uint8Array,
    deserialize: deserializeDeviceOpWrite as (payload: Uint8Array) => unknown,
  }],
  [11003, {
    msgid: 11003,
    name: 'DEVICE_OP_WRITE_REPLY',
    crcExtra: 64,
    minLength: 5,
    maxLength: 5,
    serialize: serializeDeviceOpWriteReply as (msg: unknown) => Uint8Array,
    deserialize: deserializeDeviceOpWriteReply as (payload: Uint8Array) => unknown,
  }],
  [11004, {
    msgid: 11004,
    name: 'SECURE_COMMAND',
    crcExtra: 11,
    minLength: 232,
    maxLength: 232,
    serialize: serializeSecureCommand as (msg: unknown) => Uint8Array,
    deserialize: deserializeSecureCommand as (payload: Uint8Array) => unknown,
  }],
  [11005, {
    msgid: 11005,
    name: 'SECURE_COMMAND_REPLY',
    crcExtra: 93,
    minLength: 230,
    maxLength: 230,
    serialize: serializeSecureCommandReply as (msg: unknown) => Uint8Array,
    deserialize: deserializeSecureCommandReply as (payload: Uint8Array) => unknown,
  }],
  [11010, {
    msgid: 11010,
    name: 'ADAP_TUNING',
    crcExtra: 46,
    minLength: 49,
    maxLength: 49,
    serialize: serializeAdapTuning as (msg: unknown) => Uint8Array,
    deserialize: deserializeAdapTuning as (payload: Uint8Array) => unknown,
  }],
  [11011, {
    msgid: 11011,
    name: 'VISION_POSITION_DELTA',
    crcExtra: 106,
    minLength: 44,
    maxLength: 44,
    serialize: serializeVisionPositionDelta as (msg: unknown) => Uint8Array,
    deserialize: deserializeVisionPositionDelta as (payload: Uint8Array) => unknown,
  }],
  [11020, {
    msgid: 11020,
    name: 'AOA_SSA',
    crcExtra: 205,
    minLength: 16,
    maxLength: 16,
    serialize: serializeAoaSsa as (msg: unknown) => Uint8Array,
    deserialize: deserializeAoaSsa as (payload: Uint8Array) => unknown,
  }],
  [11030, {
    msgid: 11030,
    name: 'ESC_TELEMETRY_1_TO_4',
    crcExtra: 144,
    minLength: 44,
    maxLength: 44,
    serialize: serializeEscTelemetry1To4 as (msg: unknown) => Uint8Array,
    deserialize: deserializeEscTelemetry1To4 as (payload: Uint8Array) => unknown,
  }],
  [11031, {
    msgid: 11031,
    name: 'ESC_TELEMETRY_5_TO_8',
    crcExtra: 133,
    minLength: 44,
    maxLength: 44,
    serialize: serializeEscTelemetry5To8 as (msg: unknown) => Uint8Array,
    deserialize: deserializeEscTelemetry5To8 as (payload: Uint8Array) => unknown,
  }],
  [11032, {
    msgid: 11032,
    name: 'ESC_TELEMETRY_9_TO_12',
    crcExtra: 85,
    minLength: 44,
    maxLength: 44,
    serialize: serializeEscTelemetry9To12 as (msg: unknown) => Uint8Array,
    deserialize: deserializeEscTelemetry9To12 as (payload: Uint8Array) => unknown,
  }],
  [11033, {
    msgid: 11033,
    name: 'OSD_PARAM_CONFIG',
    crcExtra: 195,
    minLength: 37,
    maxLength: 37,
    serialize: serializeOsdParamConfig as (msg: unknown) => Uint8Array,
    deserialize: deserializeOsdParamConfig as (payload: Uint8Array) => unknown,
  }],
  [11034, {
    msgid: 11034,
    name: 'OSD_PARAM_CONFIG_REPLY',
    crcExtra: 79,
    minLength: 5,
    maxLength: 5,
    serialize: serializeOsdParamConfigReply as (msg: unknown) => Uint8Array,
    deserialize: deserializeOsdParamConfigReply as (payload: Uint8Array) => unknown,
  }],
  [11035, {
    msgid: 11035,
    name: 'OSD_PARAM_SHOW_CONFIG',
    crcExtra: 128,
    minLength: 8,
    maxLength: 8,
    serialize: serializeOsdParamShowConfig as (msg: unknown) => Uint8Array,
    deserialize: deserializeOsdParamShowConfig as (payload: Uint8Array) => unknown,
  }],
  [11036, {
    msgid: 11036,
    name: 'OSD_PARAM_SHOW_CONFIG_REPLY',
    crcExtra: 177,
    minLength: 34,
    maxLength: 34,
    serialize: serializeOsdParamShowConfigReply as (msg: unknown) => Uint8Array,
    deserialize: deserializeOsdParamShowConfigReply as (payload: Uint8Array) => unknown,
  }],
  [11037, {
    msgid: 11037,
    name: 'OBSTACLE_DISTANCE_3D',
    crcExtra: 130,
    minLength: 28,
    maxLength: 28,
    serialize: serializeObstacleDistance3d as (msg: unknown) => Uint8Array,
    deserialize: deserializeObstacleDistance3d as (payload: Uint8Array) => unknown,
  }],
  [11038, {
    msgid: 11038,
    name: 'WATER_DEPTH',
    crcExtra: 47,
    minLength: 38,
    maxLength: 38,
    serialize: serializeWaterDepth as (msg: unknown) => Uint8Array,
    deserialize: deserializeWaterDepth as (payload: Uint8Array) => unknown,
  }],
  [11039, {
    msgid: 11039,
    name: 'MCU_STATUS',
    crcExtra: 142,
    minLength: 9,
    maxLength: 9,
    serialize: serializeMcuStatus as (msg: unknown) => Uint8Array,
    deserialize: deserializeMcuStatus as (payload: Uint8Array) => unknown,
  }],
  [11040, {
    msgid: 11040,
    name: 'ESC_TELEMETRY_13_TO_16',
    crcExtra: 132,
    minLength: 44,
    maxLength: 44,
    serialize: serializeEscTelemetry13To16 as (msg: unknown) => Uint8Array,
    deserialize: deserializeEscTelemetry13To16 as (payload: Uint8Array) => unknown,
  }],
  [11041, {
    msgid: 11041,
    name: 'ESC_TELEMETRY_17_TO_20',
    crcExtra: 208,
    minLength: 44,
    maxLength: 44,
    serialize: serializeEscTelemetry17To20 as (msg: unknown) => Uint8Array,
    deserialize: deserializeEscTelemetry17To20 as (payload: Uint8Array) => unknown,
  }],
  [11042, {
    msgid: 11042,
    name: 'ESC_TELEMETRY_21_TO_24',
    crcExtra: 201,
    minLength: 44,
    maxLength: 44,
    serialize: serializeEscTelemetry21To24 as (msg: unknown) => Uint8Array,
    deserialize: deserializeEscTelemetry21To24 as (payload: Uint8Array) => unknown,
  }],
  [11043, {
    msgid: 11043,
    name: 'ESC_TELEMETRY_25_TO_28',
    crcExtra: 193,
    minLength: 44,
    maxLength: 44,
    serialize: serializeEscTelemetry25To28 as (msg: unknown) => Uint8Array,
    deserialize: deserializeEscTelemetry25To28 as (payload: Uint8Array) => unknown,
  }],
  [11044, {
    msgid: 11044,
    name: 'ESC_TELEMETRY_29_TO_32',
    crcExtra: 189,
    minLength: 44,
    maxLength: 44,
    serialize: serializeEscTelemetry29To32 as (msg: unknown) => Uint8Array,
    deserialize: deserializeEscTelemetry29To32 as (payload: Uint8Array) => unknown,
  }],
  [11060, {
    msgid: 11060,
    name: 'NAMED_VALUE_STRING',
    crcExtra: 162,
    minLength: 78,
    maxLength: 78,
    serialize: serializeNamedValueString as (msg: unknown) => Uint8Array,
    deserialize: deserializeNamedValueString as (payload: Uint8Array) => unknown,
  }],
  [12900, {
    msgid: 12900,
    name: 'OPEN_DRONE_ID_BASIC_ID',
    crcExtra: 114,
    minLength: 44,
    maxLength: 44,
    serialize: serializeOpenDroneIdBasicId as (msg: unknown) => Uint8Array,
    deserialize: deserializeOpenDroneIdBasicId as (payload: Uint8Array) => unknown,
  }],
  [12901, {
    msgid: 12901,
    name: 'OPEN_DRONE_ID_LOCATION',
    crcExtra: 254,
    minLength: 59,
    maxLength: 59,
    serialize: serializeOpenDroneIdLocation as (msg: unknown) => Uint8Array,
    deserialize: deserializeOpenDroneIdLocation as (payload: Uint8Array) => unknown,
  }],
  [12902, {
    msgid: 12902,
    name: 'OPEN_DRONE_ID_AUTHENTICATION',
    crcExtra: 140,
    minLength: 53,
    maxLength: 53,
    serialize: serializeOpenDroneIdAuthentication as (msg: unknown) => Uint8Array,
    deserialize: deserializeOpenDroneIdAuthentication as (payload: Uint8Array) => unknown,
  }],
  [12903, {
    msgid: 12903,
    name: 'OPEN_DRONE_ID_SELF_ID',
    crcExtra: 249,
    minLength: 46,
    maxLength: 46,
    serialize: serializeOpenDroneIdSelfId as (msg: unknown) => Uint8Array,
    deserialize: deserializeOpenDroneIdSelfId as (payload: Uint8Array) => unknown,
  }],
  [12904, {
    msgid: 12904,
    name: 'OPEN_DRONE_ID_SYSTEM',
    crcExtra: 77,
    minLength: 54,
    maxLength: 54,
    serialize: serializeOpenDroneIdSystem as (msg: unknown) => Uint8Array,
    deserialize: deserializeOpenDroneIdSystem as (payload: Uint8Array) => unknown,
  }],
  [12905, {
    msgid: 12905,
    name: 'OPEN_DRONE_ID_OPERATOR_ID',
    crcExtra: 49,
    minLength: 43,
    maxLength: 43,
    serialize: serializeOpenDroneIdOperatorId as (msg: unknown) => Uint8Array,
    deserialize: deserializeOpenDroneIdOperatorId as (payload: Uint8Array) => unknown,
  }],
  [12915, {
    msgid: 12915,
    name: 'OPEN_DRONE_ID_MESSAGE_PACK',
    crcExtra: 94,
    minLength: 249,
    maxLength: 249,
    serialize: serializeOpenDroneIdMessagePack as (msg: unknown) => Uint8Array,
    deserialize: deserializeOpenDroneIdMessagePack as (payload: Uint8Array) => unknown,
  }],
  [12918, {
    msgid: 12918,
    name: 'OPEN_DRONE_ID_ARM_STATUS',
    crcExtra: 139,
    minLength: 51,
    maxLength: 51,
    serialize: serializeOpenDroneIdArmStatus as (msg: unknown) => Uint8Array,
    deserialize: deserializeOpenDroneIdArmStatus as (payload: Uint8Array) => unknown,
  }],
  [12919, {
    msgid: 12919,
    name: 'OPEN_DRONE_ID_SYSTEM_UPDATE',
    crcExtra: 7,
    minLength: 18,
    maxLength: 18,
    serialize: serializeOpenDroneIdSystemUpdate as (msg: unknown) => Uint8Array,
    deserialize: deserializeOpenDroneIdSystemUpdate as (payload: Uint8Array) => unknown,
  }],
  [12920, {
    msgid: 12920,
    name: 'HYGROMETER_SENSOR',
    crcExtra: 20,
    minLength: 5,
    maxLength: 5,
    serialize: serializeHygrometerSensor as (msg: unknown) => Uint8Array,
    deserialize: deserializeHygrometerSensor as (payload: Uint8Array) => unknown,
  }],
  [17000, {
    msgid: 17000,
    name: 'TEST_TYPES',
    crcExtra: 103,
    minLength: 179,
    maxLength: 179,
    serialize: serializeTestTypes as (msg: unknown) => Uint8Array,
    deserialize: deserializeTestTypes as (payload: Uint8Array) => unknown,
  }],
  [17150, {
    msgid: 17150,
    name: 'ARRAY_TEST_0',
    crcExtra: 26,
    minLength: 33,
    maxLength: 33,
    serialize: serializeArrayTest0 as (msg: unknown) => Uint8Array,
    deserialize: deserializeArrayTest0 as (payload: Uint8Array) => unknown,
  }],
  [17151, {
    msgid: 17151,
    name: 'ARRAY_TEST_1',
    crcExtra: 72,
    minLength: 16,
    maxLength: 16,
    serialize: serializeArrayTest1 as (msg: unknown) => Uint8Array,
    deserialize: deserializeArrayTest1 as (payload: Uint8Array) => unknown,
  }],
  [17153, {
    msgid: 17153,
    name: 'ARRAY_TEST_3',
    crcExtra: 19,
    minLength: 17,
    maxLength: 17,
    serialize: serializeArrayTest3 as (msg: unknown) => Uint8Array,
    deserialize: deserializeArrayTest3 as (payload: Uint8Array) => unknown,
  }],
  [17154, {
    msgid: 17154,
    name: 'ARRAY_TEST_4',
    crcExtra: 89,
    minLength: 17,
    maxLength: 17,
    serialize: serializeArrayTest4 as (msg: unknown) => Uint8Array,
    deserialize: deserializeArrayTest4 as (payload: Uint8Array) => unknown,
  }],
  [17155, {
    msgid: 17155,
    name: 'ARRAY_TEST_5',
    crcExtra: 27,
    minLength: 10,
    maxLength: 10,
    serialize: serializeArrayTest5 as (msg: unknown) => Uint8Array,
    deserialize: deserializeArrayTest5 as (payload: Uint8Array) => unknown,
  }],
  [17156, {
    msgid: 17156,
    name: 'ARRAY_TEST_6',
    crcExtra: 14,
    minLength: 91,
    maxLength: 91,
    serialize: serializeArrayTest6 as (msg: unknown) => Uint8Array,
    deserialize: deserializeArrayTest6 as (payload: Uint8Array) => unknown,
  }],
  [17157, {
    msgid: 17157,
    name: 'ARRAY_TEST_7',
    crcExtra: 187,
    minLength: 84,
    maxLength: 84,
    serialize: serializeArrayTest7 as (msg: unknown) => Uint8Array,
    deserialize: deserializeArrayTest7 as (payload: Uint8Array) => unknown,
  }],
  [17158, {
    msgid: 17158,
    name: 'ARRAY_TEST_8',
    crcExtra: 106,
    minLength: 24,
    maxLength: 24,
    serialize: serializeArrayTest8 as (msg: unknown) => Uint8Array,
    deserialize: deserializeArrayTest8 as (payload: Uint8Array) => unknown,
  }],
  [26900, {
    msgid: 26900,
    name: 'zVIDEO_STREAM_INFORMATION',
    crcExtra: 124,
    minLength: 246,
    maxLength: 246,
    serialize: serializeZvideoStreamInformation as (msg: unknown) => Uint8Array,
    deserialize: deserializeZvideoStreamInformation as (payload: Uint8Array) => unknown,
  }],
  [42000, {
    msgid: 42000,
    name: 'ICAROUS_HEARTBEAT',
    crcExtra: 227,
    minLength: 1,
    maxLength: 1,
    serialize: serializeIcarousHeartbeat as (msg: unknown) => Uint8Array,
    deserialize: deserializeIcarousHeartbeat as (payload: Uint8Array) => unknown,
  }],
  [42001, {
    msgid: 42001,
    name: 'ICAROUS_KINEMATIC_BANDS',
    crcExtra: 239,
    minLength: 46,
    maxLength: 46,
    serialize: serializeIcarousKinematicBands as (msg: unknown) => Uint8Array,
    deserialize: deserializeIcarousKinematicBands as (payload: Uint8Array) => unknown,
  }],
  [50001, {
    msgid: 50001,
    name: 'CUBEPILOT_RAW_RC',
    crcExtra: 246,
    minLength: 32,
    maxLength: 32,
    serialize: serializeCubepilotRawRc as (msg: unknown) => Uint8Array,
    deserialize: deserializeCubepilotRawRc as (payload: Uint8Array) => unknown,
  }],
  [50002, {
    msgid: 50002,
    name: 'HERELINK_VIDEO_STREAM_INFORMATION',
    crcExtra: 181,
    minLength: 246,
    maxLength: 246,
    serialize: serializeHerelinkVideoStreamInformation as (msg: unknown) => Uint8Array,
    deserialize: deserializeHerelinkVideoStreamInformation as (payload: Uint8Array) => unknown,
  }],
  [50003, {
    msgid: 50003,
    name: 'HERELINK_TELEM',
    crcExtra: 62,
    minLength: 19,
    maxLength: 19,
    serialize: serializeHerelinkTelem as (msg: unknown) => Uint8Array,
    deserialize: deserializeHerelinkTelem as (payload: Uint8Array) => unknown,
  }],
  [50004, {
    msgid: 50004,
    name: 'CUBEPILOT_FIRMWARE_UPDATE_START',
    crcExtra: 240,
    minLength: 10,
    maxLength: 10,
    serialize: serializeCubepilotFirmwareUpdateStart as (msg: unknown) => Uint8Array,
    deserialize: deserializeCubepilotFirmwareUpdateStart as (payload: Uint8Array) => unknown,
  }],
  [50005, {
    msgid: 50005,
    name: 'CUBEPILOT_FIRMWARE_UPDATE_RESP',
    crcExtra: 152,
    minLength: 6,
    maxLength: 6,
    serialize: serializeCubepilotFirmwareUpdateResp as (msg: unknown) => Uint8Array,
    deserialize: deserializeCubepilotFirmwareUpdateResp as (payload: Uint8Array) => unknown,
  }],
  [52000, {
    msgid: 52000,
    name: 'AIRLINK_AUTH',
    crcExtra: 13,
    minLength: 100,
    maxLength: 100,
    serialize: serializeAirlinkAuth as (msg: unknown) => Uint8Array,
    deserialize: deserializeAirlinkAuth as (payload: Uint8Array) => unknown,
  }],
  [52001, {
    msgid: 52001,
    name: 'AIRLINK_AUTH_RESPONSE',
    crcExtra: 239,
    minLength: 1,
    maxLength: 1,
    serialize: serializeAirlinkAuthResponse as (msg: unknown) => Uint8Array,
    deserialize: deserializeAirlinkAuthResponse as (payload: Uint8Array) => unknown,
  }],
  [60000, {
    msgid: 60000,
    name: 'AUTOPILOT_STATE_FOR_GIMBAL_DEVICE_EXT',
    crcExtra: 4,
    minLength: 22,
    maxLength: 22,
    serialize: serializeAutopilotStateForGimbalDeviceExt as (msg: unknown) => Uint8Array,
    deserialize: deserializeAutopilotStateForGimbalDeviceExt as (payload: Uint8Array) => unknown,
  }],
  [60010, {
    msgid: 60010,
    name: 'STORM32_GIMBAL_MANAGER_INFORMATION',
    crcExtra: 208,
    minLength: 33,
    maxLength: 33,
    serialize: serializeStorm32GimbalManagerInformation as (msg: unknown) => Uint8Array,
    deserialize: deserializeStorm32GimbalManagerInformation as (payload: Uint8Array) => unknown,
  }],
  [60011, {
    msgid: 60011,
    name: 'STORM32_GIMBAL_MANAGER_STATUS',
    crcExtra: 183,
    minLength: 7,
    maxLength: 7,
    serialize: serializeStorm32GimbalManagerStatus as (msg: unknown) => Uint8Array,
    deserialize: deserializeStorm32GimbalManagerStatus as (payload: Uint8Array) => unknown,
  }],
  [60012, {
    msgid: 60012,
    name: 'STORM32_GIMBAL_MANAGER_CONTROL',
    crcExtra: 99,
    minLength: 36,
    maxLength: 36,
    serialize: serializeStorm32GimbalManagerControl as (msg: unknown) => Uint8Array,
    deserialize: deserializeStorm32GimbalManagerControl as (payload: Uint8Array) => unknown,
  }],
  [60013, {
    msgid: 60013,
    name: 'STORM32_GIMBAL_MANAGER_CONTROL_PITCHYAW',
    crcExtra: 129,
    minLength: 24,
    maxLength: 24,
    serialize: serializeStorm32GimbalManagerControlPitchyaw as (msg: unknown) => Uint8Array,
    deserialize: deserializeStorm32GimbalManagerControlPitchyaw as (payload: Uint8Array) => unknown,
  }],
  [60014, {
    msgid: 60014,
    name: 'STORM32_GIMBAL_MANAGER_CORRECT_ROLL',
    crcExtra: 134,
    minLength: 8,
    maxLength: 8,
    serialize: serializeStorm32GimbalManagerCorrectRoll as (msg: unknown) => Uint8Array,
    deserialize: deserializeStorm32GimbalManagerCorrectRoll as (payload: Uint8Array) => unknown,
  }],
  [60020, {
    msgid: 60020,
    name: 'QSHOT_STATUS',
    crcExtra: 202,
    minLength: 4,
    maxLength: 4,
    serialize: serializeQshotStatus as (msg: unknown) => Uint8Array,
    deserialize: deserializeQshotStatus as (payload: Uint8Array) => unknown,
  }],
  [60040, {
    msgid: 60040,
    name: 'FRSKY_PASSTHROUGH_ARRAY',
    crcExtra: 156,
    minLength: 245,
    maxLength: 245,
    serialize: serializeFrskyPassthroughArray as (msg: unknown) => Uint8Array,
    deserialize: deserializeFrskyPassthroughArray as (payload: Uint8Array) => unknown,
  }],
  [60041, {
    msgid: 60041,
    name: 'PARAM_VALUE_ARRAY',
    crcExtra: 191,
    minLength: 255,
    maxLength: 255,
    serialize: serializeParamValueArray as (msg: unknown) => Uint8Array,
    deserialize: deserializeParamValueArray as (payload: Uint8Array) => unknown,
  }],
  [60045, {
    msgid: 60045,
    name: 'MLRS_RADIO_LINK_STATS',
    crcExtra: 186,
    minLength: 23,
    maxLength: 23,
    serialize: serializeMlrsRadioLinkStats as (msg: unknown) => Uint8Array,
    deserialize: deserializeMlrsRadioLinkStats as (payload: Uint8Array) => unknown,
  }],
  [60046, {
    msgid: 60046,
    name: 'MLRS_RADIO_LINK_INFORMATION',
    crcExtra: 171,
    minLength: 28,
    maxLength: 28,
    serialize: serializeMlrsRadioLinkInformation as (msg: unknown) => Uint8Array,
    deserialize: deserializeMlrsRadioLinkInformation as (payload: Uint8Array) => unknown,
  }],
  [60047, {
    msgid: 60047,
    name: 'MLRS_RADIO_LINK_FLOW_CONTROL',
    crcExtra: 55,
    minLength: 7,
    maxLength: 7,
    serialize: serializeMlrsRadioLinkFlowControl as (msg: unknown) => Uint8Array,
    deserialize: deserializeMlrsRadioLinkFlowControl as (payload: Uint8Array) => unknown,
  }],
  [60050, {
    msgid: 60050,
    name: 'AVSS_PRS_SYS_STATUS',
    crcExtra: 220,
    minLength: 14,
    maxLength: 14,
    serialize: serializeAvssPrsSysStatus as (msg: unknown) => Uint8Array,
    deserialize: deserializeAvssPrsSysStatus as (payload: Uint8Array) => unknown,
  }],
  [60051, {
    msgid: 60051,
    name: 'AVSS_DRONE_POSITION',
    crcExtra: 245,
    minLength: 24,
    maxLength: 24,
    serialize: serializeAvssDronePosition as (msg: unknown) => Uint8Array,
    deserialize: deserializeAvssDronePosition as (payload: Uint8Array) => unknown,
  }],
  [60052, {
    msgid: 60052,
    name: 'AVSS_DRONE_IMU',
    crcExtra: 101,
    minLength: 44,
    maxLength: 44,
    serialize: serializeAvssDroneImu as (msg: unknown) => Uint8Array,
    deserialize: deserializeAvssDroneImu as (payload: Uint8Array) => unknown,
  }],
  [60053, {
    msgid: 60053,
    name: 'AVSS_DRONE_OPERATION_MODE',
    crcExtra: 45,
    minLength: 6,
    maxLength: 6,
    serialize: serializeAvssDroneOperationMode as (msg: unknown) => Uint8Array,
    deserialize: deserializeAvssDroneOperationMode as (payload: Uint8Array) => unknown,
  }],
]);

/**
 * Get message info by ID
 */
export function getMessageInfo(msgid: number): MessageInfo | undefined {
  return MESSAGE_REGISTRY.get(msgid);
}

/**
 * Get message info by name
 */
export function getMessageInfoByName(name: string): MessageInfo | undefined {
  for (const info of MESSAGE_REGISTRY.values()) {
    if (info.name === name) {
      return info;
    }
  }
  return undefined;
}

/**
 * Get all registered message IDs
 */
export function getMessageIds(): number[] {
  return Array.from(MESSAGE_REGISTRY.keys());
}

/**
 * Get all message infos as an array
 */
export function getAllMessageInfos(): MessageInfo[] {
  return Array.from(MESSAGE_REGISTRY.values());
}