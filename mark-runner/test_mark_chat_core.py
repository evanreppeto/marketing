import json
import unittest

from mark_chat_core import row_to_message, is_chat_task, extract_record


class RowToMessage(unittest.TestCase):
    def test_maps_full_row(self):
        row = {
            "id": "task-1",
            "objective": "Find partner leads.",
            "created_at": "2026-06-15T16:00:00Z",
            "task_type": "mark_chat_message",
            "metadata": {
                "conversation_id": "conv-1",
                "mentions": [{"type": "campaign", "id": "c1"}],
                "requested_by": "evan@example.com",
                "command": "find-leads",
                "attachments": [{"url": "https://x/y.png"}],
                "model_route": "fast",
                "mode": "ask",
            },
        }
        msg = row_to_message(row)
        self.assertEqual(msg["agentTaskId"], "task-1")
        self.assertEqual(msg["conversationId"], "conv-1")
        self.assertEqual(msg["message"], "Find partner leads.")
        self.assertEqual(msg["operator"], "evan@example.com")
        self.assertEqual(msg["mentions"], [{"type": "campaign", "id": "c1"}])
        self.assertEqual(msg["command"], "find-leads")
        self.assertEqual(msg["attachments"], [{"url": "https://x/y.png"}])
        self.assertEqual(msg["route"], "fast")
        self.assertEqual(msg["mode"], "ask")
        self.assertEqual(msg["createdAt"], "2026-06-15T16:00:00Z")

    def test_defaults_when_metadata_missing(self):
        msg = row_to_message({"id": "t", "objective": "hi", "metadata": None})
        self.assertEqual(msg["conversationId"], "")
        self.assertEqual(msg["operator"], "Operator")
        self.assertEqual(msg["mentions"], [])
        self.assertEqual(msg["attachments"], [])
        self.assertEqual(msg["route"], "fast")
        self.assertEqual(msg["mode"], "act")
        self.assertIsNone(msg["command"])

    def test_message_falls_back_to_human_instruction(self):
        msg = row_to_message({"id": "t", "objective": None,
                              "metadata": {"human_instruction": "from meta"}})
        self.assertEqual(msg["message"], "from meta")


class IsChatTask(unittest.TestCase):
    def test_true_for_chat_task(self):
        self.assertTrue(is_chat_task({"task_type": "mark_chat_message"}))

    def test_false_for_other(self):
        self.assertFalse(is_chat_task({"task_type": "campaign_strategy"}))
        self.assertFalse(is_chat_task({}))


class ExtractRecord(unittest.TestCase):
    def test_record_key(self):
        self.assertEqual(extract_record({"record": {"id": "a"}}), {"id": "a"})

    def test_nested_data_record(self):
        self.assertEqual(extract_record({"data": {"record": {"id": "b"}}}), {"id": "b"})

    def test_new_key(self):
        self.assertEqual(extract_record({"new": {"id": "c"}}), {"id": "c"})

    def test_empty_when_unrecognized(self):
        self.assertEqual(extract_record({"nope": 1}), {})
        self.assertEqual(extract_record("not-a-dict"), {})


from mark_chat_core import build_claim_request, claim_won


class BuildClaimRequest(unittest.TestCase):
    def test_targets_only_queued_row(self):
        url, body, headers = build_claim_request(
            "task-9", "https://ref.supabase.co/", "svc-key", "2026-06-15T16:00:00+00:00"
        )
        self.assertEqual(
            url,
            "https://ref.supabase.co/rest/v1/agent_tasks?id=eq.task-9&status=eq.queued",
        )
        parsed = json.loads(body.decode("utf-8"))
        self.assertEqual(parsed["status"], "running")
        self.assertEqual(parsed["started_at"], "2026-06-15T16:00:00+00:00")
        self.assertEqual(headers["apikey"], "svc-key")
        self.assertEqual(headers["authorization"], "Bearer svc-key")
        self.assertEqual(headers["prefer"], "return=representation")


class ClaimWon(unittest.TestCase):
    def test_won_when_a_row_returned(self):
        self.assertTrue(claim_won([{"id": "task-9"}]))

    def test_lost_when_empty(self):
        self.assertFalse(claim_won([]))
        self.assertFalse(claim_won(None))
        self.assertFalse(claim_won({"unexpected": "shape"}))


if __name__ == "__main__":
    unittest.main()
