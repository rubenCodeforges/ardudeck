export enum MavTunnelPayloadType {
  /** Encoding of payload unknown. */
  MAV_TUNNEL_PAYLOAD_TYPE_UNKNOWN = 0,
  /** Registered for STorM32 gimbal controller. */
  MAV_TUNNEL_PAYLOAD_TYPE_STORM32_RESERVED0 = 200,
  /** Registered for STorM32 gimbal controller. */
  MAV_TUNNEL_PAYLOAD_TYPE_STORM32_RESERVED1 = 201,
  /** Registered for STorM32 gimbal controller. */
  MAV_TUNNEL_PAYLOAD_TYPE_STORM32_RESERVED2 = 202,
  /** Registered for STorM32 gimbal controller. */
  MAV_TUNNEL_PAYLOAD_TYPE_STORM32_RESERVED3 = 203,
  /** Registered for STorM32 gimbal controller. */
  MAV_TUNNEL_PAYLOAD_TYPE_STORM32_RESERVED4 = 204,
  /** Registered for STorM32 gimbal controller. */
  MAV_TUNNEL_PAYLOAD_TYPE_STORM32_RESERVED5 = 205,
  /** Registered for STorM32 gimbal controller. */
  MAV_TUNNEL_PAYLOAD_TYPE_STORM32_RESERVED6 = 206,
  /** Registered for STorM32 gimbal controller. */
  MAV_TUNNEL_PAYLOAD_TYPE_STORM32_RESERVED7 = 207,
  /** Registered for STorM32 gimbal controller. */
  MAV_TUNNEL_PAYLOAD_TYPE_STORM32_RESERVED8 = 208,
  /** Registered for STorM32 gimbal controller. */
  MAV_TUNNEL_PAYLOAD_TYPE_STORM32_RESERVED9 = 209,
}

/** @deprecated Use MavTunnelPayloadType instead */
export const MAV_TUNNEL_PAYLOAD_TYPE = MavTunnelPayloadType;