sed "s/import { stopMspTelemetry }/import { stopMspTelemetry, startMspTelemetry }/" /Users/daddy/work/ardudeck/apps/desktop/src/main/msp/msp-servo.ts > /Users/daddy/work/ardudeck/apps/desktop/src/main/msp/msp-servo.tmp
mv /Users/daddy/work/ardudeck/apps/desktop/src/main/msp/msp-servo.tmp /Users/daddy/work/ardudeck/apps/desktop/src/main/msp/msp-servo.ts
