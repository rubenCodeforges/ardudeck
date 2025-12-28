export enum MavStorm32TunnelPayloadType {
  /** Registered for STorM32 gimbal controller. For communication with gimbal or camera. */
  MAV_STORM32_TUNNEL_PAYLOAD_TYPE_STORM32_CH1_IN = 200,
  /** Registered for STorM32 gimbal controller. For communication with gimbal or camera. */
  MAV_STORM32_TUNNEL_PAYLOAD_TYPE_STORM32_CH1_OUT = 201,
  /** Registered for STorM32 gimbal controller. For communication with gimbal. */
  MAV_STORM32_TUNNEL_PAYLOAD_TYPE_STORM32_CH2_IN = 202,
  /** Registered for STorM32 gimbal controller. For communication with gimbal. */
  MAV_STORM32_TUNNEL_PAYLOAD_TYPE_STORM32_CH2_OUT = 203,
  /** Registered for STorM32 gimbal controller. For communication with camera. */
  MAV_STORM32_TUNNEL_PAYLOAD_TYPE_STORM32_CH3_IN = 204,
  /** Registered for STorM32 gimbal controller. For communication with camera. */
  MAV_STORM32_TUNNEL_PAYLOAD_TYPE_STORM32_CH3_OUT = 205,
}

/** @deprecated Use MavStorm32TunnelPayloadType instead */
export const MAV_STORM32_TUNNEL_PAYLOAD_TYPE = MavStorm32TunnelPayloadType;