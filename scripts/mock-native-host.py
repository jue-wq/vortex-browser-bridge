#!/usr/bin/env python3
"""Development-only Native Messaging host for the VortexDM browser bridge."""
import json
import struct
import sys


def read_message():
    raw_length = sys.stdin.buffer.read(4)
    if not raw_length:
        return None
    if len(raw_length) != 4:
        raise EOFError("Incomplete Native Messaging length header")
    (length,) = struct.unpack("<I", raw_length)
    if length > 1024 * 1024:
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


def main():
    while True:
        message = read_message()
        if message is None:
            return
        kind = message.get("type")
        if kind == "handshake":
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
        elif message.get("request_id"):
            write_message({
                "type": "ack",
                "request_id": message["request_id"],
                "accepted": True
            })


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"mock-native-host: {exc}", file=sys.stderr)
        raise
