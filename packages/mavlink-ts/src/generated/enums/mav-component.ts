/**
 * Component ids (values) for the different types and instances of onboard hardware/software that might make up a MAVLink system (autopilot, cameras, servos, GPS systems, avoidance systems etc.).
 *       Components must use the appropriate ID in their source address when sending messages. Components can also use IDs to determine if they are the intended recipient of an incoming message. The MAV_COMP_ID_ALL value is used to indicate messages that must be processed by all components.
 *       When creating new entries, components that can have multiple instances (e.g. cameras, servos etc.) should be allocated sequential values. An appropriate number of values should be left free after these components to allow the number of instances to be expanded.
 */
export enum MavComponent {
  /** Target id (target_component) used to broadcast messages to all components of the receiving system. Components should attempt to process messages with this component ID and forward to components on any other interfaces. Note: This is not a valid *source* component id for a message. */
  MAV_COMP_ID_ALL = 0,
  /** System flight controller component ("autopilot"). Only one autopilot is expected in a particular system. */
  MAV_COMP_ID_AUTOPILOT1 = 1,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER1 = 25,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER2 = 26,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER3 = 27,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER4 = 28,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER5 = 29,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER6 = 30,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER7 = 31,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER8 = 32,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER9 = 33,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER10 = 34,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER11 = 35,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER12 = 36,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER13 = 37,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER14 = 38,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER15 = 39,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER16 = 40,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER17 = 41,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER18 = 42,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER19 = 43,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER20 = 44,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER21 = 45,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER22 = 46,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER23 = 47,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER24 = 48,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER25 = 49,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER26 = 50,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER27 = 51,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER28 = 52,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER29 = 53,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER30 = 54,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER31 = 55,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER32 = 56,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER33 = 57,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER34 = 58,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER35 = 59,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER36 = 60,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER37 = 61,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER38 = 62,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER39 = 63,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER40 = 64,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER41 = 65,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER42 = 66,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER43 = 67,
  /** Telemetry radio (e.g. SiK radio, or other component that emits RADIO_STATUS messages). */
  MAV_COMP_ID_TELEMETRY_RADIO = 68,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER45 = 69,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER46 = 70,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER47 = 71,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER48 = 72,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER49 = 73,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER50 = 74,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER51 = 75,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER52 = 76,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER53 = 77,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER54 = 78,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER55 = 79,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER56 = 80,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER57 = 81,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER58 = 82,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER59 = 83,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER60 = 84,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER61 = 85,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER62 = 86,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER63 = 87,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER64 = 88,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER65 = 89,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER66 = 90,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER67 = 91,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER68 = 92,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER69 = 93,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER70 = 94,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER71 = 95,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER72 = 96,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER73 = 97,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER74 = 98,
  /** Id for a component on privately managed MAVLink network. Can be used for any purpose but may not be published by components outside of the private network. */
  MAV_COMP_ID_USER75 = 99,
  /** Camera #1. */
  MAV_COMP_ID_CAMERA = 100,
  /** Camera #2. */
  MAV_COMP_ID_CAMERA2 = 101,
  /** Camera #3. */
  MAV_COMP_ID_CAMERA3 = 102,
  /** Camera #4. */
  MAV_COMP_ID_CAMERA4 = 103,
  /** Camera #5. */
  MAV_COMP_ID_CAMERA5 = 104,
  /** Camera #6. */
  MAV_COMP_ID_CAMERA6 = 105,
  /** Servo #1. */
  MAV_COMP_ID_SERVO1 = 140,
  /** Servo #2. */
  MAV_COMP_ID_SERVO2 = 141,
  /** Servo #3. */
  MAV_COMP_ID_SERVO3 = 142,
  /** Servo #4. */
  MAV_COMP_ID_SERVO4 = 143,
  /** Servo #5. */
  MAV_COMP_ID_SERVO5 = 144,
  /** Servo #6. */
  MAV_COMP_ID_SERVO6 = 145,
  /** Servo #7. */
  MAV_COMP_ID_SERVO7 = 146,
  /** Servo #8. */
  MAV_COMP_ID_SERVO8 = 147,
  /** Servo #9. */
  MAV_COMP_ID_SERVO9 = 148,
  /** Servo #10. */
  MAV_COMP_ID_SERVO10 = 149,
  /** Servo #11. */
  MAV_COMP_ID_SERVO11 = 150,
  /** Servo #12. */
  MAV_COMP_ID_SERVO12 = 151,
  /** Servo #13. */
  MAV_COMP_ID_SERVO13 = 152,
  /** Servo #14. */
  MAV_COMP_ID_SERVO14 = 153,
  /** Gimbal #1. */
  MAV_COMP_ID_GIMBAL = 154,
  /** Logging component. */
  MAV_COMP_ID_LOG = 155,
  /** Automatic Dependent Surveillance-Broadcast (ADS-B) component. */
  MAV_COMP_ID_ADSB = 156,
  /** On Screen Display (OSD) devices for video links. */
  MAV_COMP_ID_OSD = 157,
  /** Generic autopilot peripheral component ID. Meant for devices that do not implement the parameter microservice. */
  MAV_COMP_ID_PERIPHERAL = 158,
  /** Gimbal ID for QX1. */
  MAV_COMP_ID_QX1_GIMBAL = 159,
  /** FLARM collision alert component. */
  MAV_COMP_ID_FLARM = 160,
  /** Parachute component. */
  MAV_COMP_ID_PARACHUTE = 161,
  /** Winch component. */
  MAV_COMP_ID_WINCH = 169,
  /** Gimbal #2. */
  MAV_COMP_ID_GIMBAL2 = 171,
  /** Gimbal #3. */
  MAV_COMP_ID_GIMBAL3 = 172,
  /** Gimbal #4 */
  MAV_COMP_ID_GIMBAL4 = 173,
  /** Gimbal #5. */
  MAV_COMP_ID_GIMBAL5 = 174,
  /** Gimbal #6. */
  MAV_COMP_ID_GIMBAL6 = 175,
  /** Battery #1. */
  MAV_COMP_ID_BATTERY = 180,
  /** Battery #2. */
  MAV_COMP_ID_BATTERY2 = 181,
  /** CAN over MAVLink client. */
  MAV_COMP_ID_MAVCAN = 189,
  /** Component that can generate/supply a mission flight plan (e.g. GCS or developer API). */
  MAV_COMP_ID_MISSIONPLANNER = 190,
  /** Component that lives on the onboard computer (companion computer) and has some generic functionalities, such as settings system parameters and monitoring the status of some processes that don't directly speak mavlink and so on. */
  MAV_COMP_ID_ONBOARD_COMPUTER = 191,
  /** Component that lives on the onboard computer (companion computer) and has some generic functionalities, such as settings system parameters and monitoring the status of some processes that don't directly speak mavlink and so on. */
  MAV_COMP_ID_ONBOARD_COMPUTER2 = 192,
  /** Component that lives on the onboard computer (companion computer) and has some generic functionalities, such as settings system parameters and monitoring the status of some processes that don't directly speak mavlink and so on. */
  MAV_COMP_ID_ONBOARD_COMPUTER3 = 193,
  /** Component that lives on the onboard computer (companion computer) and has some generic functionalities, such as settings system parameters and monitoring the status of some processes that don't directly speak mavlink and so on. */
  MAV_COMP_ID_ONBOARD_COMPUTER4 = 194,
  /** Component that finds an optimal path between points based on a certain constraint (e.g. minimum snap, shortest path, cost, etc.). */
  MAV_COMP_ID_PATHPLANNER = 195,
  /** Component that plans a collision free path between two points. */
  MAV_COMP_ID_OBSTACLE_AVOIDANCE = 196,
  /** Component that provides position estimates using VIO techniques. */
  MAV_COMP_ID_VISUAL_INERTIAL_ODOMETRY = 197,
  /** Component that manages pairing of vehicle and GCS. */
  MAV_COMP_ID_PAIRING_MANAGER = 198,
  /** Inertial Measurement Unit (IMU) #1. */
  MAV_COMP_ID_IMU = 200,
  /** Inertial Measurement Unit (IMU) #2. */
  MAV_COMP_ID_IMU_2 = 201,
  /** Inertial Measurement Unit (IMU) #3. */
  MAV_COMP_ID_IMU_3 = 202,
  /** GPS #1. */
  MAV_COMP_ID_GPS = 220,
  /** GPS #2. */
  MAV_COMP_ID_GPS2 = 221,
  /** Open Drone ID transmitter/receiver (Bluetooth/WiFi/Internet). */
  MAV_COMP_ID_ODID_TXRX_1 = 236,
  /** Open Drone ID transmitter/receiver (Bluetooth/WiFi/Internet). */
  MAV_COMP_ID_ODID_TXRX_2 = 237,
  /** Open Drone ID transmitter/receiver (Bluetooth/WiFi/Internet). */
  MAV_COMP_ID_ODID_TXRX_3 = 238,
  /** Component to bridge MAVLink to UDP (i.e. from a UART). */
  MAV_COMP_ID_UDP_BRIDGE = 240,
  /** Component to bridge to UART (i.e. from UDP). */
  MAV_COMP_ID_UART_BRIDGE = 241,
  /** Component handling TUNNEL messages (e.g. vendor specific GUI of a component). */
  MAV_COMP_ID_TUNNEL_NODE = 242,
  /** Illuminator */
  MAV_COMP_ID_ILLUMINATOR = 243,
  /** Deprecated, don't use. Component for handling system messages (e.g. to ARM, takeoff, etc.). */
  MAV_COMP_ID_SYSTEM_CONTROL = 250,
}

/** @deprecated Use MavComponent instead */
export const MAV_COMPONENT = MavComponent;