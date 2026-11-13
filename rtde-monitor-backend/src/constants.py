"""Backend copies of the frequency limits declared in the frontend constant.ts."""

FREQUENCY_MIN_HZ = 5
FREQUENCY_MAX_HZ = 100
FREQUENCY_DEFAULT_HZ = 20


def normalize_frequency(value):
    if isinstance(value, bool):
        raise ValueError("frequency")
    if isinstance(value, int):
        frequency = value
    elif isinstance(value, float) and value.is_integer():
        frequency = int(value)
    else:
        raise ValueError("frequency")
    if frequency < FREQUENCY_MIN_HZ or frequency > FREQUENCY_MAX_HZ:
        raise ValueError("frequency")
    return frequency
