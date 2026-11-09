import importlib.util
import os
import sys
import unittest
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


if __name__ == "__main__":
    unittest.main()
