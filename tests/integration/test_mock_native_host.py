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

    def test_handshake_returns_initial_status_and_queues(self):
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

    def test_download_request_gets_positive_ack(self):
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

    def test_batch_chunk_gets_ack(self):
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


if __name__ == "__main__":
    unittest.main()
