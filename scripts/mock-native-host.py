#!/usr/bin/env python3
"""Development-only Native Messaging host for the VortexDM browser bridge."""
import json
import struct
import sys

MAX_FRAME_BYTES = 1024 * 1024
SUPPORTED_REQUESTS = {"add_download", "add_batch", "extract_media", "task_control"}


def read_message():
    raw_length = sys.stdin.buffer.read(4)
    if not raw_length:
        return None
    if len(raw_length) != 4:
        raise EOFError("Incomplete Native Messaging length header")
    (length,) = struct.unpack("<I", raw_length)
    if length > MAX_FRAME_BYTES:
        raise ValueError("Incoming frame exceeds 1 MiB")
    payload = sys.stdin.buffer.read(length)
    if len(payload) != length:
        raise EOFError("Incomplete Native Messaging payload")
    return json.loads(payload.decode("utf-8"))


def write_message(message):
    payload = json.dumps(message, separators=(",", ":")).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(payload)))
    sys.stdout.buffer.write(payload)
    sys.stdout.buffer.flush()


def write_ack(request_id, accepted, error=None):
    response = {"type": "ack", "request_id": request_id, "accepted": accepted}
    if error:
        response["error"] = error
    write_message(response)


def main():
    handshaken = False
    while True:
        message = read_message()
        if message is None:
            return
        if not isinstance(message, dict):
            continue

        kind = message.get("type")
        if kind == "handshake":
            if message.get("protocol_version") != 1:
                raise ValueError("Unsupported protocol version")
            handshaken = True
            write_message({
                "type": "status_update",
                "active_downloads": [],
                "total_speed": 0,
                "theme": "modern-dark"
            })
            write_message({
                "type": "queues_sync",
                "queues": [{"id": "default", "name": "Default"}]
            })
            continue

        request_id = message.get("request_id")
        if not isinstance(request_id, str) or not request_id:
            continue
        if not handshaken:
            write_ack(request_id, False, "Handshake required")
        elif kind not in SUPPORTED_REQUESTS:
            write_ack(request_id, False, "Unsupported message type")
        else:
            # This mock acknowledges protocol flow only; it does not enqueue work.
            write_ack(request_id, True)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"mock-native-host: {exc}", file=sys.stderr)
        raise
