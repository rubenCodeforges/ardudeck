import { describe, it, expect } from 'vitest';
import { formatSurveyAreaHa, formatSurveyDistanceM } from './survey-units';

describe('survey-units', () => {
  it('formats area using the selected area unit', () => {
    expect(formatSurveyAreaHa(12.5, 'ha')).toBe('12.50 ha');
    expect(formatSurveyAreaHa(10, 'ac')).toBe('24.71 ac');
  });

  it('formats distance using the selected distance unit without autoscaling', () => {
    expect(formatSurveyDistanceM(2500, 'm')).toBe('2500 m');
    expect(formatSurveyDistanceM(2500, 'km')).toBe('2.50 km');
    expect(formatSurveyDistanceM(100, 'ft')).toBe('328 ft');
    expect(formatSurveyDistanceM(1609.344, 'mi')).toBe('1.00 mi');
  });
});
