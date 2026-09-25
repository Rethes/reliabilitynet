import json
import sys
import urllib.request


API_URL = "http://localhost:5001"

print("--- Testing ReliabilityNet Reliability Server ---")

article = {
    "uuid": "test-reliability-1",
    "title": "Federal Reserve announces a measured change to interest rates",
    "description": "The central bank published its latest monetary policy decision.",
}

request_data = json.dumps({"articles": [article]}).encode("utf-8")
request = urllib.request.Request(
    f"{API_URL}/predict/reliability",
    data=request_data,
    headers={"Content-Type": "application/json"},
)

try:
    with urllib.request.urlopen(request, timeout=45) as response:
        result = json.loads(response.read().decode("utf-8"))

    predictions = result.get("predictions", [])
    if result.get("success") is not True or len(predictions) != 1:
        raise AssertionError(f"Unexpected prediction response: {result}")

    prediction = predictions[0]
    reliability = prediction.get("reliability")
    score = reliability.get("reliabilityScore") if reliability else None

    if prediction.get("article_id") != article["uuid"]:
        raise AssertionError(f"Unexpected article id: {prediction.get('article_id')}")
    if not isinstance(score, int) or not 0 <= score <= 100:
        raise AssertionError(f"Unexpected reliability score: {score}")

    print("Reliability prediction received:")
    print(json.dumps(prediction, indent=2))
    print("Reliability server smoke test passed.")
except Exception as error:
    print(f"Reliability server smoke test failed: {error}")
    sys.exit(1)