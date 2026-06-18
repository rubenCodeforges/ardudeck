// PX4 ULog (.ulg) parser. Emits the SAME serialized model shape as
// @ardudeck/dataflash-parser so the entire downstream log UI (Explorer charts,
// map, AI tools, health report) can consume one model. The actual ULog parsing
// and PX4 health checks land in later tasks; this package currently re-exports
// the shared types.
export type {
  FMTMessage,
  DataFlashMessage,
  LogMetadata,
  DataFlashLog,
  DataFlashStreamParser,
  HealthCheckResult,
  CheckStatus,
  ExplorerPreset,
} from '@ardudeck/dataflash-parser';
