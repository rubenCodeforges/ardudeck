/** What the app knows about the ArduDeck OS link service, if it is running. */
export type OsIntegrationInfo =
  | { available: false }
  | {
      available: true;
      /** NAME from /etc/os-release as reported by the service. */
      osName: string | null;
      serviceVersion: string | null;
      /** Where the app connects (UDP client mode) to reach the vehicle through the service. */
      clientHost: string;
      clientPort: number;
      clientLocalPort: number;
      /** The vehicle the service currently sees, or null when none is on the link. */
      vehicle: { sysid: number; uid: string; firmware: string; mode: string; armed: boolean } | null;
      /** A complete parameter set is cached for that vehicle. */
      paramsCached: boolean;
    };

/** Parameter snapshot served by the ArduDeck OS link service. */
export interface OsParamSnapshot {
  uid: string;
  firmwareVersion: string | null;
  fetchedAt: number | null;
  updatedAt: number;
  complete: boolean;
  source: 'ftp' | 'list' | 'stream';
  paramCount: number;
  params: { paramId: string; paramValue: number; paramType: number; paramIndex: number; defaultValue?: number }[];
}
