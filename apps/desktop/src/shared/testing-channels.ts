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
} as const;

export type TestingChannel = typeof TESTING_CHANNELS[keyof typeof TESTING_CHANNELS];
