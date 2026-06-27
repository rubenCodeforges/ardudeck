import {
  formatAreaFromHectares,
  formatDistanceFromMeters,
  type AreaUnit,
  type DistanceUnit,
} from '../../shared/user-units.js';

/** Format an area given in hectares. */
export function formatSurveyAreaHa(ha: number, unit: AreaUnit): string {
  return formatAreaFromHectares(ha, unit);
}

/** Format a distance given in meters. */
export function formatSurveyDistanceM(m: number, unit: DistanceUnit): string {
  return formatDistanceFromMeters(m, unit);
}
