import importlib.util
import os
import sys
import unittest
from contextlib import nullcontext
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
from types import ModuleType, SimpleNamespace
from unittest.mock import patch

import flask

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

TEST_API_KEY = "model-server-test-key"
ALLOWED_ORIGIN = "http://localhost:5173"


class FakeModel:
    config = SimpleNamespace(id2label={})

    def eval(self):
        return self


class FakeLoader:
    @staticmethod
    def from_pretrained(_path):
        return FakeModel()


def fake_module(name, **attributes):
    module = ModuleType(name)
    for attribute, value in attributes.items():
        setattr(module, attribute, value)
    return module


torch_module = fake_module("torch")
torch_module.__path__ = []
torch_nn_module = fake_module("torch.nn")
torch_nn_module.__path__ = []
torch_functional_module = fake_module("torch.nn.functional")
torch_module.nn = torch_nn_module
torch_nn_module.functional = torch_functional_module

scipy_module = fake_module("scipy")
scipy_module.__path__ = []
scipy_sparse_module = fake_module(
    "scipy.sparse",
    hstack=lambda *args, **kwargs: None,
    csr_matrix=lambda *args, **kwargs: None,
)
scipy_module.sparse = scipy_sparse_module

fake_modules = {
    "joblib": fake_module("joblib", load=lambda _path: FakeModel()),
    "numpy": fake_module("numpy"),
    "scipy": scipy_module,
    "scipy.sparse": scipy_sparse_module,
    "torch": torch_module,
    "torch.nn": torch_nn_module,
    "torch.nn.functional": torch_functional_module,
    "transformers": fake_module(
        "transformers",
        AutoTokenizer=FakeLoader,
        AutoModelForSequenceClassification=FakeLoader,
    ),
}

model_server_spec = importlib.util.spec_from_file_location(
    "_model_server_security_test",
    Path(__file__).resolve().parents[1] / "model_server.py",
)
model_server = importlib.util.module_from_spec(model_server_spec)
with patch.dict(os.environ, {
    "ML_API_KEY": TEST_API_KEY,
    "ALLOWED_ORIGINS": ALLOWED_ORIGIN,
}), patch.dict(sys.modules, fake_modules):
    sys.modules[model_server_spec.name] = model_server
    model_server_spec.loader.exec_module(model_server)


class ModelServerSecurityTests(unittest.TestCase):
    def setUp(self):
        self.client = model_server.app.test_client()

    def test_api_key_is_required_and_compared_without_string_errors(self):
        self.assertEqual(self.client.get("/health").status_code, 401)
        self.assertEqual(
            self.client.get("/health", headers={"X-ML-Key": "wrong"}).status_code,
            401,
        )
        self.assertEqual(
            self.client.get("/health", headers={"X-ML-Key": "é"}).status_code,
            401,
        )
        self.assertEqual(
            self.client.get(
                "/health",
                headers={"X-ML-Key": TEST_API_KEY},
            ).status_code,
            200,
        )

    def test_cors_is_restricted_and_preflight_does_not_require_a_key(self):
        allowed = self.client.get(
            "/health",
            headers={
                "Origin": ALLOWED_ORIGIN,
                "X-ML-Key": TEST_API_KEY,
            },
        )
        self.assertEqual(
            allowed.headers.get("Access-Control-Allow-Origin"),
            ALLOWED_ORIGIN,
        )

        disallowed = self.client.get(
            "/health",
            headers={
                "Origin": "https://untrusted.example",
                "X-ML-Key": TEST_API_KEY,
            },
        )
        self.assertIsNone(disallowed.headers.get("Access-Control-Allow-Origin"))

        preflight = self.client.options(
            "/health",
            headers={
                "Origin": ALLOWED_ORIGIN,
                "Access-Control-Request-Method": "GET",
            },
        )
        self.assertEqual(preflight.status_code, 200)
        self.assertEqual(
            preflight.headers.get("Access-Control-Allow-Origin"),
            ALLOWED_ORIGIN,
        )

    def test_missing_key_preserves_local_access_and_warns_at_startup(self):
        module_spec = importlib.util.spec_from_file_location(
            "_model_server_without_key_test",
            Path(__file__).resolve().parents[1] / "model_server.py",
        )
        module = importlib.util.module_from_spec(module_spec)
        output = StringIO()

        with patch.dict(os.environ, {
            "ML_API_KEY": "",
            "ALLOWED_ORIGINS": ALLOWED_ORIGIN,
        }), patch.dict(sys.modules, fake_modules), redirect_stdout(output):
            sys.modules[module_spec.name] = module
            module_spec.loader.exec_module(module)

        response = module.app.test_client().get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertIn(
            "ML_API_KEY is not set; API key authentication is disabled",
            output.getvalue(),
        )

    def test_sentiment_routes_use_title_and_body_capped_at_500_characters(self):
        captured_texts = []

        class FakeTensor(list):
            def tolist(self):
                return list(self)

        class FakeLogits:
            def __getitem__(self, _index):
                return FakeTensor([0.1, 0.2, 0.7])

        class FakeProbabilities:
            def __getitem__(self, _index):
                return FakeTensor([0.1, 0.2, 0.7])

        def capture_tokenizer(texts, **_kwargs):
            captured_texts.extend(texts)
            return {}

        def fake_model(**_kwargs):
            return SimpleNamespace(logits=FakeLogits())

        headers = {"X-ML-Key": TEST_API_KEY}
        article = {"title": "Headline", "body": "b" * 501}
        expected = f"Headline\n{'b' * 500}"
        patches = (
            patch.object(model_server, "sentiment_tokenizer", side_effect=capture_tokenizer),
            patch.object(model_server, "sentiment_model", side_effect=fake_model),
            patch.object(model_server.torch, "no_grad", return_value=nullcontext(), create=True),
            patch.object(model_server.torch, "argmax", return_value=SimpleNamespace(item=lambda: 2), create=True),
            patch.object(model_server.F, "softmax", return_value=FakeProbabilities(), create=True),
            patch.object(model_server, "predict_reliability_meta", return_value=None),
            patch.object(model_server, "clickbait_model", None),
        )

        with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5], patches[6]:
            sentiment_response = self.client.post(
                "/predict/sentiment",
                json={"articles": [article]},
                headers=headers,
            )
            reliability_response = self.client.post(
                "/predict/reliability",
                json={"articles": [article]},
                headers=headers,
            )

        self.assertEqual(sentiment_response.status_code, 200)
        self.assertEqual(reliability_response.status_code, 200)
        self.assertEqual(captured_texts, [expected, expected])
        self.assertEqual(sentiment_response.get_json()["predictions"][0]["title"], "Headline")
        self.assertEqual(reliability_response.get_json()["predictions"][0]["text"], "b" * 501)

        with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5], patches[6]:
            rel_response_with_text = self.client.post(
                "/predict/reliability",
                json={"articles": [{"title": "Headline", "text": "custom body text"}]},
                headers=headers,
            )
        self.assertEqual(rel_response_with_text.status_code, 200)
        self.assertEqual(rel_response_with_text.get_json()["predictions"][0]["text"], "custom body text")

    def test_sentiment_raw_text_requests_remain_supported(self):
        captured_texts = []

        class FakeTensor(list):
            def tolist(self):
                return list(self)

        class FakeLogits:
            def __getitem__(self, _index):
                return FakeTensor([0.1, 0.2, 0.7])

        class FakeProbabilities:
            def __getitem__(self, _index):
                return FakeTensor([0.1, 0.2, 0.7])

        def capture_tokenizer(texts, **_kwargs):
            captured_texts.extend(texts)
            return {}

        with patch.object(model_server, "sentiment_tokenizer", side_effect=capture_tokenizer), \
             patch.object(model_server, "sentiment_model", return_value=SimpleNamespace(logits=FakeLogits())), \
             patch.object(model_server.torch, "no_grad", return_value=nullcontext(), create=True), \
             patch.object(model_server.torch, "argmax", return_value=SimpleNamespace(item=lambda: 2), create=True), \
             patch.object(model_server.F, "softmax", return_value=FakeProbabilities(), create=True):
            response = self.client.post(
                "/predict/sentiment",
                json={"texts": ["raw request text"]},
                headers={"X-ML-Key": TEST_API_KEY},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(captured_texts, ["raw request text"])


if __name__ == "__main__":
    unittest.main()
