import json
import struct
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HOST = ROOT / "scripts" / "mock-native-host.py"


def write_frame(stream, message):
    payload = json.dumps(message, separators=(",", ":")).encode("utf-8")
    stream.write(struct.pack("<I", len(payload)))
    stream.write(payload)
    stream.flush()


def read_exact(stream, size):
    chunks = bytearray()
    while len(chunks) < size:
        part = stream.read(size - len(chunks))
        if not part:
            raise EOFError("mock host closed its output")
        chunks.extend(part)
    return bytes(chunks)


def read_frame(stream):
    (length,) = struct.unpack("<I", read_exact(stream, 4))
    return json.loads(read_exact(stream, length).decode("utf-8"))


class MockNativeHostTests(unittest.TestCase):
    def setUp(self):
        self.process = subprocess.Popen(
            [sys.executable, str(HOST)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        self.assertIsNotNone(self.process.stdin)
        self.assertIsNotNone(self.process.stdout)

    def tearDown(self):
        if self.process.poll() is None:
            self.process.stdin.close()
            self.process.terminate()
            self.process.wait(timeout=5)

    def handshake(self):
        write_frame(self.process.stdin, {
            "type": "handshake",
            "protocol_version": 1,
            "extension_version": "0.1.0",
            "capabilities": ["native_messaging"],
        })
        status = read_frame(self.process.stdout)
        queues = read_frame(self.process.stdout)
        self.assertEqual(status["type"], "status_update")
        self.assertEqual(queues["type"], "queues_sync")
        self.assertEqual(queues["queues"][0]["id"], "default")

    def test_handshake_returns_initial_status_and_queues(self):
        self.handshake()
        # The helper also verifies both initial handshake frames and queue shape.

    def test_request_before_handshake_is_rejected(self):
        write_frame(self.process.stdin, {
            "type": "add_download",
            "request_id": "early-request",
            "url": "https://example.com/file.bin",
        })
        ack = read_frame(self.process.stdout)
        self.assertEqual(ack["request_id"], "early-request")
        self.assertFalse(ack["accepted"])
        self.assertEqual(ack["error"], "Handshake required")

    def test_unknown_request_type_is_rejected_after_handshake(self):
        self.handshake()
        write_frame(self.process.stdin, {
            "type": "unexpected_command",
            "request_id": "unknown-request",
        })
        ack = read_frame(self.process.stdout)
        self.assertFalse(ack["accepted"])
        self.assertEqual(ack["error"], "Unsupported message type")

    def test_download_request_gets_positive_ack_after_handshake(self):
        self.handshake()
        write_frame(self.process.stdin, {
            "type": "add_download",
            "request_id": "test-request-1",
            "url": "https://example.com/file.bin",
        })
        ack = read_frame(self.process.stdout)
        self.assertEqual(ack, {
            "type": "ack",
            "request_id": "test-request-1",
            "accepted": True,
        })

    def test_batch_chunk_gets_ack_after_handshake(self):
        self.handshake()
        write_frame(self.process.stdin, {
            "type": "add_batch",
            "request_id": "batch-1",
            "chunk_index": 0,
            "chunk_total": 1,
            "links": [{"url": "https://example.com/a.bin"}],
        })
        ack = read_frame(self.process.stdout)
        self.assertTrue(ack["accepted"])
        self.assertEqual(ack["request_id"], "batch-1")


    def test_oversized_frame_is_rejected_before_payload_read(self):
        self.process.stdin.write(struct.pack("<I", 1024 * 1024 + 1))
        self.process.stdin.flush()
        return_code = self.process.wait(timeout=5)
        self.assertNotEqual(return_code, 0)
        self.assertIn(b"exceeds 1 MiB", self.process.stderr.read())

    def test_truncated_payload_is_rejected(self):
        self.process.stdin.write(struct.pack("<I", 10))
        self.process.stdin.write(b"{}")
        self.process.stdin.close()
        return_code = self.process.wait(timeout=5)
        self.assertNotEqual(return_code, 0)
        self.assertIn(b"Incomplete Native Messaging payload", self.process.stderr.read())


if __name__ == "__main__":
    unittest.main()
