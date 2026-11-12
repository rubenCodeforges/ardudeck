// apps/desktop/src/shared/testing-channels.ts
export const TESTING_CHANNELS = {
  // Observation
  FIND_ELEMENTS: 'testing:find-elements',
  GET_PAGE_STATE: 'testing:get-page-state',
  GET_STORE_STATE: 'testing:get-store-state',
  GET_ELEMENT_TEXT: 'testing:get-element-text',
  LIST_TEST_IDS: 'testing:list-test-ids',
  GET_APP_INFO: 'testing:get-app-info',
  GET_VIEWS: 'testing:get-views',

  // Interaction
  CLICK: 'testing:click',
  TYPE: 'testing:type',
  SELECT: 'testing:select',
  SCROLL: 'testing:scroll',
  KEYBOARD: 'testing:keyboard',
  HOVER: 'testing:hover',
  NAVIGATE: 'testing:navigate',

  // Waiting
  WAIT_FOR_ELEMENT: 'testing:wait-for-element',
  WAIT_FOR_STORE: 'testing:wait-for-store',
  WAIT_FOR_IDLE: 'testing:wait-for-idle',

  // Data ensure (assistant helpers)
  ENSURE_PARAMETERS_LOADED: 'testing:ensure-parameters-loaded',

  // Parameter write (approval-gated via compare modal)
  PROPOSE_PARAMETERS: 'testing:propose-parameters',

  // Mission planning (approval-gated via the proposal dialog; nothing is uploaded except an approved fence)
  GET_MISSION: 'testing:get-mission',
  PROPOSE_MISSION: 'testing:propose-mission',
  PROPOSE_SURVEY: 'testing:propose-survey',
  PROPOSE_FENCE: 'testing:propose-fence',
  SET_VEHICLE_PROFILE: 'testing:set-vehicle-profile',
  SET_HOME: 'testing:set-home',
  LIST_SURVEY_OPTIONS: 'testing:list-survey-options',
  FIT_MISSION: 'testing:fit-mission',
  DRAW_AREA: 'testing:draw-area',
  LIST_AREAS: 'testing:list-areas',
  DELETE_AREA: 'testing:delete-area',
  SURVEY_AREA: 'testing:survey-area',
  GET_FLIGHT_ESTIMATE: 'testing:get-flight-estimate',
} as const;

export type TestingChannel = typeof TESTING_CHANNELS[keyof typeof TESTING_CHANNELS];
