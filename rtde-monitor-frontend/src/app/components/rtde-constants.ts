/** English labels from the RTDE Guide constants section. Protocol tokens stay untranslated. */

export interface RtdeConstant {
    readonly name?: string;
    readonly description?: string;
}

const TIME_SCALE_SOURCE: Readonly<Record<number, RtdeConstant>> = {
    [-1]: { description: 'Other' },
    0: { description: 'Program is not running' },
    1: { description: 'Speed is not scaled' },
    2: { description: 'Joint torque limit reached' },
    3: { description: 'Joint acceleration limit reached' },
    4: { description: 'Power supply limit reached' },
    5: { description: 'Momentum safety limit reached' },
    6: { description: 'Stopping time safety limit reached' },
    7: { description: 'Stopping distance safety limit reached' },
    8: { description: 'Tool speed safety limit reached' },
    9: { description: 'Elbow speed safety limit reached' },
    10: { description: 'Joint speed safety limit reached' },
    11: { description: 'Smooth transition after safety state change' },
    12: { description: 'Stopping distance defined through safety API reached' },
    13: { description: 'User defined tool wrench limit reached' },
    14: { description: 'Scaling due to external axis speed limit' },
    15: { description: 'Scaling due to external axis stopping' },
    55: { description: 'Joint speed reduced to respect force limiting because elbow or tool is above base' },
};

const SAFETY_STATUS: Readonly<Record<number, RtdeConstant>> = {
    1: { name: 'NORMAL' },
    2: { name: 'REDUCED' },
    3: { name: 'PROTECTIVE_STOP' },
    4: { name: 'RECOVERY' },
    5: { name: 'SAFEGUARD_STOP' },
    6: { name: 'SYSTEM_EMERGENCY_STOP' },
    7: { name: 'ROBOT_EMERGENCY_STOP' },
    8: { name: 'VIOLATION' },
    9: { name: 'FAULT' },
    12: { name: 'AUTOMATIC_MODE_SAFEGUARD_STOP' },
    13: { name: 'SYSTEM_THREE_POSITION_ENABLING_STOP' },
    14: { name: 'TP_THREE_POSITION_ENABLING_STOP' },
    15: { name: 'IMMI_EMERGENCY_STOP' },
    16: { name: 'IMMI_SAFEGUARD_STOP' },
    17: { name: 'PROFISAFE_WAITING_FOR_PARAMETERS' },
    18: { name: 'PROFISAFE_AUTOMATIC_MODE_SAFEGUARD_STOP' },
    19: { name: 'PROFISAFE_SAFEGUARD_STOP' },
    20: { name: 'PROFISAFE_EMERGENCY_STOP' },
    22: { name: 'SAFETY_API_SAFEGUARD_STOP' },
    23: { name: 'IO_PLANE_STOP' },
};

const ROBOT_MODE: Readonly<Record<number, RtdeConstant>> = {
    0: { name: 'DISCONNECTED', description: 'Connection with the safety control board is not established.' },
    1: { name: 'CONFIRM_SAFETY', description: 'Robot is validating and updating the safety settings.' },
    2: { name: 'BOOTING', description: 'Safety control board is booting up and its communication with the other components is being verified.' },
    3: { name: 'POWER_OFF', description: 'Robot is ready to boot up the joints.' },
    4: { name: 'POWER_ON', description: 'Robot’s joints are booting up.' },
    5: { name: 'IDLE', description: 'Robot’s joints are ready (to go to RUNNING or BACKDRIVE modes).' },
    6: { name: 'BACKDRIVE', description: 'Robot is in back-drive mode. It is possible to move the robot in a restricted way. Brakes are being released when needed.' },
    7: { name: 'RUNNING', description: 'Brakes are fully released. Robot is ready for running a program. In Polyscope, the current safety mode is shown.' },
    8: { name: 'UPDATING', description: 'Firmware is being updated' },
    9: { name: 'POWERING_OFF', description: 'Robot arm is powering off' },
    10: { name: 'ARM_BOOTING', description: 'Robot arm is booting' },
    11: { name: 'ARM_UPDATING', description: 'Robot arm is being firmware updated' },
};

const JOINT_MODE: Readonly<Record<number, RtdeConstant>> = {
    235: { name: 'RESET' },
    236: { name: 'SHUTTING_DOWN' },
    238: { name: 'BACKDRIVE' },
    239: { name: 'POWER_OFF' },
    240: { name: 'READY_FOR_POWER_OFF' },
    245: { name: 'NOT_RESPONDING' },
    246: { name: 'MOTOR_INITIALISATION' },
    247: { name: 'BOOTING' },
    249: { name: 'BOOTLOADER' },
    251: { name: 'VIOLATION' },
    252: { name: 'FAULT' },
    253: { name: 'RUNNING' },
    255: { name: 'IDLE' },
};

/** Tool Modes from the client-interface manual. The RTDE field says "one of tool mode constants" and does not repeat this table. */
const TOOL_MODE: Readonly<Record<number, RtdeConstant>> = {
    235: { name: 'RESET' },
    236: { name: 'SHUTTING_DOWN' },
    239: { name: 'POWER_OFF' },
    245: { name: 'NOT_RESPONDING' },
    247: { name: 'BOOTING' },
    249: { name: 'BOOTLOADER' },
    252: { name: 'FAULT' },
    253: { name: 'RUNNING' },
    255: { name: 'IDLE' },
};

const PROGRAM_STATE: Readonly<Record<number, RtdeConstant>> = {
    0: { name: 'STOPPING' },
    1: { name: 'STOPPED' },
    2: { name: 'RUNNING' },
    3: { name: 'PAUSING' },
    4: { name: 'PAUSED' },
    5: { name: 'RESUMING' },
    6: { name: 'RETRACTING' },
};

/** Output names whose numeric value is one of the RTDE Guide constant tables. `safety_mode` uses the Safety Status table. */
export const RTDE_CONSTANTS: Readonly<Record<string, Readonly<Record<number, RtdeConstant>>>> = {
    time_scale_source: TIME_SCALE_SOURCE,
    safety_status: SAFETY_STATUS,
    safety_mode: SAFETY_STATUS,
    robot_mode: ROBOT_MODE,
    joint_mode: JOINT_MODE,
    tool_mode: TOOL_MODE,
    runtime_state: PROGRAM_STATE,
};

export function constantMeaning(entry: RtdeConstant): string {
    if (entry.name && entry.description) {
        return `${entry.name}: ${entry.description}`;
    }
    return entry.description ?? entry.name ?? '';
}
