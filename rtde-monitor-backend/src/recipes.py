"""RTDE field lists from the Universal Robots RTDE guide.

Registers are subscribed as controller outputs so the operator screen can read
them. Input-only fields that the controller does not publish are omitted.
"""

SIZES = {
    "BOOL": 1,
    "UINT8": 1,
    "UINT32": 4,
    "UINT64": 8,
    "INT32": 4,
    "DOUBLE": 8,
    "VECTOR3D": 24,
    "VECTOR6D": 48,
    "VECTOR6INT32": 24,
}


def _indexed(prefix, start, stop, size):
    return [(f"{prefix}{index}", size) for index in range(start, stop)]


INPUT_BIT_PACKED = [
    ("input_bit_registers0_to_31", SIZES["UINT32"]),
    ("input_bit_registers32_to_63", SIZES["UINT32"]),
]
OUTPUT_BIT_PACKED = [
    ("output_bit_registers0_to_31", SIZES["UINT32"]),
    ("output_bit_registers32_to_63", SIZES["UINT32"]),
]
INPUT_BIT_BOOLS = _indexed("input_bit_register_", 64, 128, SIZES["BOOL"])
OUTPUT_BIT_BOOLS = _indexed("output_bit_register_", 64, 128, SIZES["BOOL"])
INPUT_INTS = _indexed("input_int_register_", 0, 48, SIZES["INT32"])
OUTPUT_INTS = _indexed("output_int_register_", 0, 48, SIZES["INT32"])
INPUT_DOUBLES = _indexed("input_double_register_", 0, 48, SIZES["DOUBLE"])
OUTPUT_DOUBLES = _indexed("output_double_register_", 0, 48, SIZES["DOUBLE"])

REGISTER_FIELDS = (
    INPUT_BIT_PACKED
    + INPUT_BIT_BOOLS
    + INPUT_INTS
    + INPUT_DOUBLES
    + OUTPUT_BIT_PACKED
    + OUTPUT_BIT_BOOLS
    + OUTPUT_INTS
    + OUTPUT_DOUBLES
)


FIELD_TYPES = {}


def _signals(*entries):
    fields = []
    for name, kind in entries:
        FIELD_TYPES[name] = kind
        fields.append((name, SIZES[kind]))
    return fields


JOINTS = _signals(
    ("target_q", "VECTOR6D"),
    ("target_qd", "VECTOR6D"),
    ("target_qdd", "VECTOR6D"),
    ("target_current", "VECTOR6D"),
    ("target_moment", "VECTOR6D"),
    ("actual_q", "VECTOR6D"),
    ("actual_qd", "VECTOR6D"),
    ("actual_current", "VECTOR6D"),
    ("actual_current_window", "VECTOR6D"),
    ("actual_current_as_torque", "VECTOR6D"),
    ("joint_control_output", "VECTOR6D"),
    ("joint_temperatures", "VECTOR6D"),
    ("actual_joint_voltage", "VECTOR6D"),
    ("joint_mode", "VECTOR6INT32"),
    ("joint_position_deviation_ratio", "DOUBLE"),
    ("joint_position_deviation_ratios", "VECTOR6D"),
    ("collision_detection_ratio", "DOUBLE"),
    ("collision_detection_ratios", "VECTOR6D"),
)

TCP = _signals(
    ("actual_TCP_pose", "VECTOR6D"),
    ("actual_TCP_speed", "VECTOR6D"),
    ("actual_TCP_force", "VECTOR6D"),
    ("target_TCP_pose", "VECTOR6D"),
    ("target_TCP_speed", "VECTOR6D"),
    ("tcp_offset", "VECTOR6D"),
    ("actual_TCP_acceleration", "VECTOR6D"),
    ("target_TCP_acceleration", "VECTOR6D"),
    ("actual_tool_accelerometer", "VECTOR3D"),
    ("elbow_position", "VECTOR3D"),
    ("elbow_velocity", "VECTOR3D"),
    ("tcp_force_scalar", "DOUBLE"),
    ("ft_raw_wrench", "VECTOR6D"),
    ("wrench_calc_from_currents", "VECTOR6D"),
)

IO = _signals(
    ("actual_digital_input_bits", "UINT64"),
    ("actual_configurable_digital_input_bits", "UINT64"),
    ("actual_digital_output_bits", "UINT64"),
    ("actual_configurable_digital_output_bits", "UINT64"),
    ("analog_io_types", "UINT32"),
    ("standard_analog_input0", "DOUBLE"),
    ("standard_analog_input1", "DOUBLE"),
    ("standard_analog_output0", "DOUBLE"),
    ("standard_analog_output1", "DOUBLE"),
    ("io_current", "DOUBLE"),
    ("encoder0_raw", "INT32"),
    ("encoder1_raw", "INT32"),
    ("euromap67_input_bits", "UINT32"),
    ("euromap67_output_bits", "UINT32"),
    ("euromap67_24V_voltage", "DOUBLE"),
    ("euromap67_24V_current", "DOUBLE"),
)

SAFETY = _signals(
    ("robot_mode", "INT32"),
    ("safety_mode", "INT32"),
    ("safety_status", "INT32"),
    ("robot_status_bits", "UINT32"),
    ("safety_status_bits", "UINT32"),
    ("runtime_state", "UINT32"),
    ("speed_scaling", "DOUBLE"),
    ("target_speed_fraction", "DOUBLE"),
    ("time_scale_source", "INT32"),
)

TOOL = _signals(
    ("tool_mode", "UINT32"),
    ("tool_analog_input_types", "UINT32"),
    ("tool_analog_input0", "DOUBLE"),
    ("tool_analog_input1", "DOUBLE"),
    ("tool_output_voltage", "INT32"),
    ("tool_output_voltage_2", "INT32"),
    ("tool_output_current", "DOUBLE"),
    ("tool_output_current_2", "DOUBLE"),
    ("tool_temperature", "DOUBLE"),
    ("tool_output_mode", "UINT8"),
    ("tool_digital_output0_mode", "UINT8"),
    ("tool_digital_output1_mode", "UINT8"),
)

PAYLOAD = _signals(
    ("payload", "DOUBLE"),
    ("payload_cog", "VECTOR3D"),
    ("payload_inertia", "VECTOR6D"),
    ("actual_momentum", "DOUBLE"),
    ("actual_robot_energy_consumed", "DOUBLE"),
    ("actual_robot_braking_energy_dissipated", "DOUBLE"),
)

CONTROLLER = _signals(
    ("timestamp", "DOUBLE"),
    ("actual_execution_time", "DOUBLE"),
    ("target_execution_time", "DOUBLE"),
    ("actual_main_voltage", "DOUBLE"),
    ("actual_robot_voltage", "DOUBLE"),
    ("actual_robot_current", "DOUBLE"),
    ("script_control_line", "UINT32"),
    ("target_gravity", "VECTOR3D"),
    ("target_base_acceleration", "VECTOR6D"),
    ("control_step", "UINT64"),
    ("target_base_wrench", "VECTOR6D"),
)

SIGNAL_SECTIONS = [
    ("joints", "Joints", JOINTS),
    ("tcp", "TCP", TCP),
    ("io", "I/O", IO),
    ("safety", "Safety and program", SAFETY),
    ("tool", "Tool", TOOL),
    ("payload", "Payload and energy", PAYLOAD),
    ("controller", "Controller", CONTROLLER),
]

SIGNAL_FIELDS = [field for _section_id, _title, fields in SIGNAL_SECTIONS for field in fields]

REGISTER_NAMES = {name for name, _size in REGISTER_FIELDS}
SIGNAL_NAMES = {name for name, _size in SIGNAL_FIELDS}


def chunk_fields(fields, budget):
    groups = []
    current = []
    size = 0
    for field in fields:
        _name, field_size = field
        if current and size + field_size > budget:
            groups.append(current)
            current = []
            size = 0
        current.append(field)
        size += field_size
    if current:
        groups.append(current)
    return groups


def _annotate(item, write, address):
    if write is None:
        return item
    item["writable"] = True
    item["kind"] = write
    item["address"] = address
    return item


def _bit_items(values, source, start, write=None):
    raw = values.get(source)
    number = None if raw is None else int(raw)
    items = []
    for index in range(32):
        address = start + index
        value = None if number is None else (1 if number & (1 << index) else 0)
        item = {"label": str(address), "name": f"bit {address}", "value": value}
        items.append(_annotate(item, write, address))
    return items


def _bool_items(values, fields, write=None):
    items = []
    for name, _size in fields:
        address = int(name.rsplit("_", 1)[-1])
        raw = values.get(name)
        value = None if raw is None else (1 if raw else 0)
        item = {"label": str(address), "name": name, "value": value}
        items.append(_annotate(item, write, address))
    return items


def _number_items(values, fields, type_name, write=None):
    items = []
    for name, _size in fields:
        address = int(name.rsplit("_", 1)[-1])
        item = {
            "label": str(address),
            "name": name,
            "value": present_value(name, values.get(name), type_name),
            "valueType": type_name,
        }
        items.append(_annotate(item, write, address))
    return items


def present_value(name, value, type_name):
    if value is None:
        return None
    if isinstance(value, (list, tuple)):
        return [round(float(item), 6) for item in value]
    if type_name == "BOOL" or isinstance(value, bool):
        return bool(value)
    if type_name in ("UINT64", "UINT32") and (name.endswith("_bits") or name.endswith("_types")):
        return format(int(value), "#x")
    if type_name == "UINT64":
        return str(int(value))
    if type_name == "DOUBLE" or isinstance(value, float):
        return round(float(value), 6)
    return int(value)


def register_groups(values):
    return [
        {
            "id": "input-bit-registers",
            "title": "input_bit_registers",
            "kind": "bits",
            "items": _bit_items(values, "input_bit_registers0_to_31", 0)
            + _bit_items(values, "input_bit_registers32_to_63", 32),
        },
        {
            "id": "input-bit-register-x",
            "title": "input_bit_register_X",
            "kind": "bits",
            "items": _bool_items(values, INPUT_BIT_BOOLS),
        },
        {
            "id": "input-int-register",
            "title": "input_int_register_X",
            "kind": "numbers",
            "items": _number_items(values, INPUT_INTS, "INT32"),
        },
        {
            "id": "input-double-register",
            "title": "input_double_register_X",
            "kind": "numbers",
            "items": _number_items(values, INPUT_DOUBLES, "DOUBLE"),
        },
        {
            "id": "output-bit-registers",
            "title": "output_bit_registers",
            "kind": "bits",
            "items": _bit_items(values, "output_bit_registers0_to_31", 0, write="bit")
            + _bit_items(values, "output_bit_registers32_to_63", 32, write="bit"),
        },
        {
            "id": "output-bit-register-x",
            "title": "output_bit_register_X",
            "kind": "bits",
            "items": _bool_items(values, OUTPUT_BIT_BOOLS, write="bit"),
        },
        {
            "id": "output-int-register",
            "title": "output_int_register_X",
            "kind": "numbers",
            "items": _number_items(values, OUTPUT_INTS, "INT32", write="int"),
        },
        {
            "id": "output-double-register",
            "title": "output_double_register_X",
            "kind": "numbers",
            "items": _number_items(values, OUTPUT_DOUBLES, "DOUBLE", write="double"),
        },
    ]


def signal_groups(values, types):
    groups = []
    for section_id, title, fields in SIGNAL_SECTIONS:
        items = []
        for name, _size in fields:
            items.append(
                {
                    "label": name,
                    "name": name,
                    "value": present_value(name, values.get(name), types.get(name, "")),
                    "valueType": FIELD_TYPES.get(name, ""),
                }
            )
        groups.append({"id": section_id, "title": title, "kind": "fields", "items": items})
    return groups
