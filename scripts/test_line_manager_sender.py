from datetime import datetime, timedelta, timezone
from pathlib import Path
import json
import os
import shutil
import unittest
from unittest.mock import patch

from line_manager_sender import HistoryMessage, LINELibAdapter, ReconciliationCandidate, SendCandidate, SendEvidence, process_reconciliation_once, process_send_once, reconcile_history, safe_error, text_v2_payload

T0 = datetime(2026, 9, 23, tzinfo=timezone.utc)
SEND = SendCandidate(1, "approved", "chat_1700000000000_1234567", "bot", "chat", "claim", "CLAIMED")
RECON = ReconciliationCandidate(1, "approved", SEND.send_id, "bot", "chat", "reconcile", T0 + timedelta(seconds=1))
class FakeApi:
    def __init__(self, send=SEND, recon=None, fence=True, pre=True, confirm=True): self.send,self.recon,self.fence_result,self.pre_result,self.confirm_result,self.calls=send,recon,fence,pre,confirm,[]
    def claim_send(self): self.calls.append("claim"); value,self.send=self.send,None; return value
    def pre_send_failed(self, item, error): self.calls.append(("pre",error)); return self.pre_result
    def fence(self, item): self.calls.append("fence"); return self.fence_result
    def claim_reconciliation(self): self.calls.append("reclaim"); value,self.recon=self.recon,None; return value
    def confirm(self, item, message): self.calls.append(("confirm",message.id)); return self.confirm_result
class FakeAdapter:
    def __init__(self, history=(), history_error=None, post_error=None): self.history,self.history_error,self.post_error,self.posts=list(history),history_error,post_error,[]
    def get_raw_history(self, bot, chat):
        if self.history_error: raise self.history_error
        return self.history
    def post_text_v2(self, bot, chat, payload, *, allow_send):
        self.posts.append((bot,chat,payload)); self.post_error and (_ for _ in ()).throw(self.post_error)
def msg(message_id, *, text="approved", send_id=None, timestamp=T0, chat="chat"): return HistoryMessage(message_id,chat,text,timestamp,True,send_id)

class SenderTests(unittest.TestCase):
    def setUp(self):
        self.root=Path(__file__).parent / "_line_manager_sender_test"
        shutil.rmtree(self.root, ignore_errors=True); self.root.mkdir()
    def tearDown(self): shutil.rmtree(self.root, ignore_errors=True)
    def send(self, api, adapter): return process_send_once(api,adapter,allow_send=True,now=T0,evidence_root=self.root)
    def recon(self, api, adapter): return process_reconciliation_once(api,adapter,evidence_root=self.root)
    def test_payload_preserves_db_send_id(self): self.assertEqual(text_v2_payload(SEND.text,SEND.send_id)["sendId"],SEND.send_id)
    def test_dry_run_never_claims_fences_or_posts(self):
        api,adapter=FakeApi(),FakeAdapter(); self.assertIn("no claim",process_send_once(api,adapter,allow_send=False,evidence_root=self.root)); self.assertEqual(api.calls,[]); self.assertEqual(adapter.posts,[])
    def test_pre_send_acknowledgement_failure_is_reported(self): self.assertEqual(self.send(FakeApi(pre=False),FakeAdapter(history_error=RuntimeError("down"))),"pre-send failure acknowledgement rejected")
    def test_no_post_without_fence(self):
        api,adapter=FakeApi(fence=False),FakeAdapter(); self.send(api,adapter); self.assertEqual(adapter.posts,[])
    def test_fence_error_does_not_post(self):
        class FenceErrorApi(FakeApi):
            def fence(self, item): self.calls.append("fence"); raise RuntimeError("409 stale")
        api,adapter=FenceErrorApi(),FakeAdapter(); self.assertEqual(self.send(api,adapter),"fence failed; no Manager POST"); self.assertEqual(adapter.posts,[])
    def test_after_fence_failure_does_not_reclaim_or_resend(self):
        api,adapter=FakeApi(),FakeAdapter(post_error=RuntimeError("unknown")); self.assertEqual(self.send(api,adapter),"post outcome unknown; reconciliation required"); self.assertEqual(api.calls,["claim","fence"]); self.assertEqual(len(adapter.posts),1)
    def test_post_marker_persistence_failure_after_fence_does_not_post(self):
        api,adapter=FakeApi(),FakeAdapter()
        with patch("line_manager_sender.persist_evidence",side_effect=[None,OSError("disk unavailable")]) as persist:
            self.assertEqual(self.send(api,adapter),"post-invocation marker persistence failed; no Manager POST")
        self.assertEqual(persist.call_count,2); self.assertEqual(api.calls,["claim","fence"]); self.assertEqual(adapter.posts,[])
    def test_reconciliation_uses_restart_evidence_never_posts_and_deletes_only_after_confirmation(self):
        self.send(FakeApi(),FakeAdapter(history=[msg("before",timestamp=T0)]))
        api,adapter=FakeApi(send=None,recon=RECON),FakeAdapter(history=[msg("before",timestamp=T0),msg("actual",timestamp=T0+timedelta(seconds=2))])
        self.assertEqual(self.recon(api,adapter),"confirmed"); self.assertEqual(adapter.posts,[]); self.assertEqual(api.calls,["reclaim",("confirm","actual")]); self.assertFalse((self.root/"outbox-1.json").exists())
    def test_missing_and_mismatched_evidence_fail_closed(self):
        self.assertIn("missing or mismatched",self.recon(FakeApi(send=None,recon=RECON),FakeAdapter()))
        self.send(FakeApi(),FakeAdapter()); path=self.root/"outbox-1.json"; path.write_text(path.read_text(encoding="utf-8").replace(SEND.send_id,"other"),encoding="utf-8")
        self.assertIn("missing or mismatched",self.recon(FakeApi(send=None,recon=RECON),FakeAdapter()))
    def test_post_throw_keeps_pre_fence_evidence_reconcilable_without_resend(self):
        send_api,send_adapter=FakeApi(),FakeAdapter(post_error=RuntimeError("unknown"))
        self.assertEqual(self.send(send_api,send_adapter),"post outcome unknown; reconciliation required")
        recon_api,recon_adapter=FakeApi(send=None,recon=RECON),FakeAdapter(history=[msg("actual",timestamp=T0+timedelta(seconds=2))])
        self.assertEqual(self.recon(recon_api,recon_adapter),"confirmed"); self.assertEqual(len(send_adapter.posts),1); self.assertEqual(recon_adapter.posts,[])
    def test_fallback_excludes_watermark_and_ambiguity(self):
        self.send(FakeApi(),FakeAdapter(history=[msg("before",timestamp=T0)]))
        result=self.recon(FakeApi(send=None,recon=RECON),FakeAdapter(history=[msg("before",timestamp=T0),msg("one",timestamp=T0+timedelta(seconds=2)),msg("two",timestamp=T0+timedelta(seconds=3))]))
        self.assertIn("absent or ambiguous",result)
    def test_typed_history_requires_exact_send_id_and_fails_closed_on_ambiguity(self):
        evidence=SendEvidence(SEND.id,SEND.send_id,SEND.manager_bot_id,SEND.manager_chat_id,T0,None,T0,T0)
        matching=msg("actual",send_id=SEND.send_id,timestamp=T0+timedelta(seconds=2))
        self.assertEqual(reconcile_history([matching],RECON,evidence),matching)
        self.assertIsNone(reconcile_history([msg("wrong",send_id="other",timestamp=T0+timedelta(seconds=2))],RECON,evidence))
        self.assertIsNone(reconcile_history([matching,msg("also",send_id=SEND.send_id,timestamp=T0+timedelta(seconds=3))],RECON,evidence))
    def test_no_prior_outbound_fallback_never_matches_at_or_before_capture(self):
        no_prior=SendEvidence(SEND.id,SEND.send_id,SEND.manager_bot_id,SEND.manager_chat_id,datetime.min.replace(tzinfo=timezone.utc),None,T0,T0)
        old=msg("old",timestamp=T0-timedelta(seconds=1))
        at_capture=msg("capture",timestamp=T0)
        actual=msg("actual",timestamp=T0+timedelta(seconds=2))
        self.assertIsNone(reconcile_history([old,at_capture],RECON,no_prior))
        self.assertEqual(reconcile_history([old,at_capture,actual],RECON,no_prior),actual)
        self.assertIsNone(reconcile_history([old,actual,msg("another",timestamp=T0+timedelta(seconds=3))],RECON,no_prior))
    def test_post_invocation_marker_one_second_after_server_fence_loads_and_reconciles(self):
        self.send(FakeApi(),FakeAdapter())
        path=self.root/"outbox-1.json"; raw=json.loads(path.read_text(encoding="utf-8"))
        raw["post_invocation_started_at"]=(T0+timedelta(seconds=1)).isoformat(); path.write_text(json.dumps(raw),encoding="utf-8")
        at_fence=ReconciliationCandidate(1,SEND.text,SEND.send_id,"bot","chat","reconcile",T0)
        self.assertEqual(self.recon(FakeApi(send=None,recon=at_fence),FakeAdapter(history=[msg("actual",timestamp=T0+timedelta(seconds=2))])),"confirmed")
    def test_capture_one_second_ahead_of_server_fence_loads_and_reconciles(self):
        self.send(FakeApi(),FakeAdapter())
        path=self.root/"outbox-1.json"; raw=json.loads(path.read_text(encoding="utf-8"))
        client_ahead=T0+timedelta(seconds=1)
        raw["captured_at"]=client_ahead.isoformat(); raw["post_invocation_started_at"]=client_ahead.isoformat(); path.write_text(json.dumps(raw),encoding="utf-8")
        at_fence=ReconciliationCandidate(1,SEND.text,SEND.send_id,"bot","chat","reconcile",T0)
        self.assertEqual(self.recon(FakeApi(send=None,recon=at_fence),FakeAdapter(history=[msg("actual",timestamp=T0+timedelta(seconds=2))])),"confirmed")
    def test_capture_more_than_two_minutes_ahead_of_server_fence_fails_closed(self):
        self.send(FakeApi(),FakeAdapter())
        path=self.root/"outbox-1.json"; raw=json.loads(path.read_text(encoding="utf-8"))
        client_ahead=T0+timedelta(minutes=2,seconds=1)
        raw["captured_at"]=client_ahead.isoformat(); raw["post_invocation_started_at"]=client_ahead.isoformat(); path.write_text(json.dumps(raw),encoding="utf-8")
        at_fence=ReconciliationCandidate(1,SEND.text,SEND.send_id,"bot","chat","reconcile",T0)
        self.assertIn("missing or mismatched",self.recon(FakeApi(send=None,recon=at_fence),FakeAdapter()))
    def test_implausibly_distant_post_invocation_marker_fails_closed(self):
        self.send(FakeApi(),FakeAdapter())
        path=self.root/"outbox-1.json"; raw=json.loads(path.read_text(encoding="utf-8"))
        raw["post_invocation_started_at"]=(T0+timedelta(minutes=3,seconds=1)).isoformat(); path.write_text(json.dumps(raw),encoding="utf-8")
        self.assertIn("missing or mismatched",self.recon(FakeApi(send=None,recon=RECON),FakeAdapter()))
    def test_missing_post_invocation_marker_fails_closed(self):
        self.send(FakeApi(),FakeAdapter())
        path=self.root/"outbox-1.json"; raw=json.loads(path.read_text(encoding="utf-8"))
        raw.pop("post_invocation_started_at"); path.write_text(json.dumps(raw),encoding="utf-8")
        self.assertIn("missing or mismatched",self.recon(FakeApi(send=None,recon=RECON),FakeAdapter()))
    def test_timezone_naive_post_invocation_marker_fails_closed(self):
        self.send(FakeApi(),FakeAdapter())
        path=self.root/"outbox-1.json"; raw=json.loads(path.read_text(encoding="utf-8"))
        raw["post_invocation_started_at"]="2026-09-23T00:00:01"; path.write_text(json.dumps(raw),encoding="utf-8")
        self.assertIn("missing or mismatched",self.recon(FakeApi(send=None,recon=RECON),FakeAdapter()))
    def test_empty_secret_does_not_corrupt_error(self):
        old=os.environ.pop("N8N_INTERNAL_TOKEN",None)
        try: self.assertEqual(safe_error("abc"),"abc")
        finally:
            if old is not None: os.environ["N8N_INTERNAL_TOKEN"]=old
    def test_low_level_adapter_preserves_payload_and_auth_internals(self):
        class Service:
            def __init__(self): self.call=None
            def send_message(self,*args,**kwargs): self.call=(args,kwargs); return {}
        class Client:
            def __init__(self): self._chat_service,self._session,self._xsrf_token=Service(),object(),"xsrf"
            def get_chat_messages(self,*args,**kwargs): return {}
        client=Client(); payload=text_v2_payload("approved",SEND.send_id); adapter=LINELibAdapter(client)
        with self.assertRaises(Exception): adapter.post_text_v2("bot","chat",payload,allow_send=False)
        self.assertIsNone(client._chat_service.call); adapter.post_text_v2("bot","chat",payload,allow_send=True)
        self.assertEqual(client._chat_service.call[0][:3],("bot","chat",payload))

if __name__ == "__main__": unittest.main()
