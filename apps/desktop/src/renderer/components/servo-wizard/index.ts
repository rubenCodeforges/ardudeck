/**
 * Servo Wizard
 *
 * A beginner-friendly wizard for configuring servo outputs.
 * Replaces the confusing ServoMixerTab with a guided 5-step flow.
 */

export { default as ServoWizard, ServoWizardInline } from './ServoWizard';

// Export steps for direct use if needed
export * from './steps';

// Export diagrams for reuse elsewhere
export { default as AircraftDiagram } from './diagrams/AircraftDiagram';

// Export shared components
export { default as ServoBar } from './shared/ServoBar';
export { default as ServoEndpointSlider } from './shared/ServoEndpointSlider';

// Export presets and types
export * from './presets/servo-presets';
