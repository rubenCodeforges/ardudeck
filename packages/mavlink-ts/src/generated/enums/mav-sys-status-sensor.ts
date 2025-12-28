/**
 * These encode the sensors whose status is sent as part of the SYS_STATUS message.
 * @bitmask
 */
export enum MavSysStatusSensor {
  /** 0x01 3D gyro */
  MAV_SYS_STATUS_SENSOR_3D_GYRO = 1,
  /** 0x02 3D accelerometer */
  MAV_SYS_STATUS_SENSOR_3D_ACCEL = 2,
  /** 0x04 3D magnetometer */
  MAV_SYS_STATUS_SENSOR_3D_MAG = 4,
  /** 0x08 absolute pressure */
  MAV_SYS_STATUS_SENSOR_ABSOLUTE_PRESSURE = 8,
  /** 0x10 differential pressure */
  MAV_SYS_STATUS_SENSOR_DIFFERENTIAL_PRESSURE = 16,
  /** 0x20 GPS */
  MAV_SYS_STATUS_SENSOR_GPS = 32,
  /** 0x40 optical flow */
  MAV_SYS_STATUS_SENSOR_OPTICAL_FLOW = 64,
  /** 0x80 computer vision position */
  MAV_SYS_STATUS_SENSOR_VISION_POSITION = 128,
  /** 0x100 laser based position */
  MAV_SYS_STATUS_SENSOR_LASER_POSITION = 256,
  /** 0x200 external ground truth (Vicon or Leica) */
  MAV_SYS_STATUS_SENSOR_EXTERNAL_GROUND_TRUTH = 512,
  /** 0x400 3D angular rate control */
  MAV_SYS_STATUS_SENSOR_ANGULAR_RATE_CONTROL = 1024,
  /** 0x800 attitude stabilization */
  MAV_SYS_STATUS_SENSOR_ATTITUDE_STABILIZATION = 2048,
  /** 0x1000 yaw position */
  MAV_SYS_STATUS_SENSOR_YAW_POSITION = 4096,
  /** 0x2000 z/altitude control */
  MAV_SYS_STATUS_SENSOR_Z_ALTITUDE_CONTROL = 8192,
  /** 0x4000 x/y position control */
  MAV_SYS_STATUS_SENSOR_XY_POSITION_CONTROL = 16384,
  /** 0x8000 motor outputs / control */
  MAV_SYS_STATUS_SENSOR_MOTOR_OUTPUTS = 32768,
  /** 0x10000 RC receiver */
  MAV_SYS_STATUS_SENSOR_RC_RECEIVER = 65536,
  /** 0x20000 2nd 3D gyro */
  MAV_SYS_STATUS_SENSOR_3D_GYRO2 = 131072,
  /** 0x40000 2nd 3D accelerometer */
  MAV_SYS_STATUS_SENSOR_3D_ACCEL2 = 262144,
  /** 0x80000 2nd 3D magnetometer */
  MAV_SYS_STATUS_SENSOR_3D_MAG2 = 524288,
  /** 0x100000 geofence */
  MAV_SYS_STATUS_GEOFENCE = 1048576,
  /** 0x200000 AHRS subsystem health */
  MAV_SYS_STATUS_AHRS = 2097152,
  /** 0x400000 Terrain subsystem health */
  MAV_SYS_STATUS_TERRAIN = 4194304,
  /** 0x800000 Motors are reversed */
  MAV_SYS_STATUS_REVERSE_MOTOR = 8388608,
  /** 0x1000000 Logging */
  MAV_SYS_STATUS_LOGGING = 16777216,
  /** 0x2000000 Battery */
  MAV_SYS_STATUS_SENSOR_BATTERY = 33554432,
  /** 0x4000000 Proximity */
  MAV_SYS_STATUS_SENSOR_PROXIMITY = 67108864,
  /** 0x8000000 Satellite Communication */
  MAV_SYS_STATUS_SENSOR_SATCOM = 134217728,
  /** 0x10000000 pre-arm check status. Always healthy when armed */
  MAV_SYS_STATUS_PREARM_CHECK = 268435456,
  /** 0x20000000 Avoidance/collision prevention */
  MAV_SYS_STATUS_OBSTACLE_AVOIDANCE = 536870912,
  /** 0x40000000 propulsion (actuator, esc, motor or propellor) */
  MAV_SYS_STATUS_SENSOR_PROPULSION = 1073741824,
}

/** @deprecated Use MavSysStatusSensor instead */
export const MAV_SYS_STATUS_SENSOR = MavSysStatusSensor;