// MAVFTP lives in @ardudeck/vehicle-core so the ArduDeck OS link service can share it.
export {
  MavlinkFtpClient,
  type SendFtpPacket,
  type FtpProgressCallback,
  type FtpLogCallback,
  parseParamPack,
  type PackedParam,
  type ParamPackResult,
  FtpOpcode,
  FtpError,
  PARAM_PCK_PATH,
  parseFtpPayload,
} from '@ardudeck/vehicle-core';
