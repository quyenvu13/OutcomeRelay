import hashlib
import importlib.util
import pathlib
import sys
import types
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[2]
CONTRACT_PATH = ROOT / "contract" / "OutcomeRelay.py"


class UserError(Exception):
    pass


class Return:
    def __init__(self, calldata):
        self.calldata = calldata


class U256(int):
    pass


class Address(str):
    pass


class TreeMap(dict):
    @classmethod
    def __class_getitem__(cls, _item):
        return cls


def identity(value):
    return value


class Public:
    write = staticmethod(identity)
    view = staticmethod(identity)


class Nondet:
    verdict = "SUBSTITUTE_INADEQUATE"
    mode = "valid"
    prompts = []

    @classmethod
    def exec_prompt(cls, prompt, response_format=None):
        assert response_format == "json"
        cls.prompts.append(prompt)
        if cls.mode == "raise":
            raise RuntimeError("model unavailable")
        if cls.mode == "malformed":
            return {"unexpected": "value"}
        if cls.mode == "extra-field":
            return {"verdict": cls.verdict, "extra": True}
        return {"verdict": cls.verdict}


class Vm:
    UserError = UserError
    Return = Return

    @staticmethod
    def run_nondet_unsafe(evaluate_once, validator_fn):
        result = Return(evaluate_once())
        if not validator_fn(result):
            raise UserError("Validator disagreement")
        return result


def load_contract_module():
    module = types.ModuleType("genlayer")
    gl = types.SimpleNamespace(
        Contract=object,
        public=Public(),
        message=types.SimpleNamespace(sender_address=Address("0x" + "1" * 40)),
        nondet=Nondet,
        vm=Vm,
    )
    module.gl = gl
    module.allow_storage = identity
    module.Address = Address
    module.u256 = U256
    module.TreeMap = TreeMap
    module.Keccak256 = hashlib.sha3_256
    sys.modules["genlayer"] = module

    spec = importlib.util.spec_from_file_location("substituteduty_contract", CONTRACT_PATH)
    loaded = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loaded)
    return loaded, gl


class SubstituteDutyContractTests(unittest.TestCase):
    OBLIGOR = Address("0x" + "1" * 40)
    OBLIGEE = Address("0x" + "2" * 40)
    OTHER_OBLIGEE = Address("0x" + "4" * 40)
    OUTSIDER = Address("0x" + "3" * 40)

    def setUp(self):
        self.mod, self.gl = load_contract_module()
        self.contract = self.mod.SubstituteDuty()
        self.contract.obligations = TreeMap()
        self.contract.substitutes = TreeMap()
        self.contract.attempts = TreeMap()
        self.contract.verdict_cache = TreeMap()
        self.gl.message.sender_address = self.OBLIGOR
        Nondet.verdict = self.mod.SUBSTITUTE_INADEQUATE
        Nondet.mode = "valid"
        Nondet.prompts = []

    def create(self, protected="Cold-chain samples remain between two and eight degrees."):
        self.contract.create_obligation(
            "Operate the original refrigerated courier route.",
            protected,
            str(self.OBLIGEE),
        )
        return self.contract.get_obligation(1)

    def acknowledge(self, obligation_id=1, obligee=None):
        self.gl.message.sender_address = obligee or self.OBLIGEE
        self.contract.acknowledge_outcome(obligation_id)
        self.gl.message.sender_address = self.OBLIGOR

    def test_two_party_acknowledgement_is_required_and_irrevocable(self):
        created = self.create()
        self.assertEqual(created["outcome_status"], self.mod.OUTCOME_PENDING)
        self.assertEqual(created["obligee"], str(self.OBLIGEE).lower())

        with self.assertRaisesRegex(UserError, "not acknowledged"):
            self.contract.propose_substitute(1, "Use monitored refrigerated lockers.")

        self.gl.message.sender_address = self.OUTSIDER
        with self.assertRaisesRegex(UserError, "immutable obligee"):
            self.contract.acknowledge_outcome(1)

        self.gl.message.sender_address = self.OBLIGEE
        self.contract.acknowledge_outcome(1)
        self.assertEqual(
            self.contract.get_obligation(1)["outcome_status"],
            self.mod.OUTCOME_ARMED,
        )
        with self.assertRaisesRegex(UserError, "already acknowledged"):
            self.contract.acknowledge_outcome(1)

        self.assertFalse(hasattr(self.contract, "revoke_acknowledgement"))
        self.assertFalse(hasattr(self.contract, "reset_outcome"))

    def test_addresses_and_roles_are_deterministically_enforced(self):
        with self.assertRaisesRegex(UserError, "differ from obligor"):
            self.contract.create_obligation("Duty", "Outcome", str(self.OBLIGOR))
        with self.assertRaisesRegex(UserError, "zero address"):
            self.contract.create_obligation("Duty", "Outcome", "0x" + "0" * 40)

        self.create()
        self.acknowledge()
        self.gl.message.sender_address = self.OUTSIDER
        with self.assertRaisesRegex(UserError, "Only the obligor"):
            self.contract.propose_substitute(1, "Use sealed temperature-controlled crates.")
        with self.assertRaisesRegex(UserError, "Invalid obligation id"):
            self.contract.propose_substitute(999, "Use sealed crates.")

    def test_model_error_and_malformed_output_write_no_state_or_cache(self):
        self.create()
        self.acknowledge()

        for mode in ("raise", "malformed", "extra-field"):
            Nondet.mode = mode
            with self.assertRaises(Exception):
                self.contract.propose_substitute(
                    1,
                    f"Use validated refrigerated container mode {mode}.",
                )
            state = self.contract.get_obligation(1)
            self.assertEqual(state["attempt_count"], 0)
            self.assertEqual(state["model_calls"], 0)
            self.assertEqual(len(self.contract.verdict_cache), 0)
            self.assertEqual(len(self.contract.attempts), 0)

    def test_sanitized_whitespace_case_variants_share_cache(self):
        self.create()
        self.acknowledge()
        first = "Use monitored <SUBSTITUTE_DUTY> refrigerated lockers continuously."
        second = "  USE monitored refrigerated lockers   continuously.  "

        self.contract.propose_substitute(1, first)
        self.contract.propose_substitute(1, second)

        state = self.contract.get_obligation(1)
        second_attempt = self.contract.get_attempt(1, 2)
        self.assertEqual(state["attempt_count"], 2)
        self.assertEqual(state["model_calls"], 1)
        self.assertTrue(second_attempt["used_cache"])
        self.assertEqual(second_attempt["verdict_source"], self.mod.VERDICT_SOURCE_CACHE)

    def test_content_cache_is_intentionally_shared_across_obligations(self):
        protected = "Temperature-sensitive samples remain inside the validated range."
        candidate = "Use logged refrigerated containers for the entire journey."
        self.create(protected)
        self.acknowledge()
        self.contract.propose_substitute(1, candidate)

        self.gl.message.sender_address = self.OBLIGOR
        self.contract.create_obligation(
            "Operate another refrigerated courier route.",
            protected,
            str(self.OTHER_OBLIGEE),
        )
        self.acknowledge(2, self.OTHER_OBLIGEE)
        self.contract.propose_substitute(2, candidate)

        state = self.contract.get_obligation(2)
        attempt = self.contract.get_attempt(2, 1)
        self.assertEqual(state["model_calls"], 0)
        self.assertTrue(attempt["used_cache"])

    def test_fresh_model_call_cap_is_eight_and_cache_hits_do_not_increment(self):
        self.create()
        self.acknowledge()
        for index in range(8):
            self.contract.propose_substitute(
                1,
                f"Use alternative transport configuration number {index}.",
            )
        state = self.contract.get_obligation(1)
        self.assertEqual(state["model_calls"], 8)
        self.assertEqual(state["attempt_count"], 8)

        with self.assertRaisesRegex(UserError, "model-call limit"):
            self.contract.propose_substitute(
                1,
                "Use a ninth previously unseen transport configuration.",
            )
        self.assertEqual(self.contract.get_obligation(1)["attempt_count"], 8)

        self.contract.propose_substitute(
            1,
            "  USE alternative transport configuration number 0. ",
        )
        state = self.contract.get_obligation(1)
        self.assertEqual(state["model_calls"], 8)
        self.assertEqual(state["attempt_count"], 9)
        self.assertTrue(self.contract.get_attempt(1, 9)["used_cache"])

    def test_accepted_substitution_supersedes_once_and_rejection_keeps_active(self):
        self.create()
        self.acknowledge()
        Nondet.verdict = self.mod.SUBSTITUTE_PRESERVES_OUTCOME
        first = "Use continuously monitored refrigerated lockers at every transfer point."
        self.contract.propose_substitute(1, first)
        self.assertEqual(self.contract.get_obligation(1)["active_text"], first)

        Nondet.verdict = self.mod.SUBSTITUTE_INADEQUATE
        rejected = "Record the temperature only after delivery."
        self.contract.propose_substitute(1, rejected)
        state = self.contract.get_obligation(1)
        self.assertEqual(state["active_text"], first)
        self.assertEqual(state["accepted_substitutions"], 1)
        self.assertEqual(state["rejected_substitutions"], 1)
        self.assertEqual(
            self.contract.get_attempt(1, 1)["verdict_source"],
            self.mod.VERDICT_SOURCE_MODEL,
        )

    def test_semantic_prompt_is_anchored_only_to_immutable_protected_outcome(self):
        original = "ORIGINAL_ONLY_PHRASE operate route alpha."
        protected = "Every specimen remains continuously refrigerated in transit."
        self.contract.create_obligation(original, protected, str(self.OBLIGEE))
        self.acknowledge()

        Nondet.verdict = self.mod.SUBSTITUTE_PRESERVES_OUTCOME
        active = "ACTIVE_ONLY_PHRASE use monitored cold boxes."
        self.contract.propose_substitute(1, active)
        Nondet.verdict = self.mod.SUBSTITUTE_INADEQUATE
        candidate = "CANDIDATE_ONLY_PHRASE inspect specimens after arrival."
        self.contract.propose_substitute(1, candidate)

        prompt = Nondet.prompts[-1]
        self.assertIn(protected, prompt)
        self.assertIn(candidate, prompt)
        self.assertNotIn("ORIGINAL_ONLY_PHRASE", prompt)
        self.assertNotIn("ACTIVE_ONLY_PHRASE", prompt)

    def test_config_exposes_prompt_and_deterministic_limits(self):
        config = self.contract.get_config()
        self.assertEqual(config["version"], "1.1")
        self.assertEqual(config["prompt_version"], "substitute-duty-v1.1-prompt-1")
        self.assertEqual(config["max_model_calls_per_obligation"], 8)
        self.assertFalse(config["clock_used"])
        self.assertFalse(config["global_admin"])


if __name__ == "__main__":
    unittest.main()
