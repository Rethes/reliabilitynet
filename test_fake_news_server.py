import sys
import json
import urllib.request
import urllib.error

API_URL = "http://localhost:5001"

print("--- Testing RoBERTa Fake News Model Server ---")

# 1. Health check
try:
    with urllib.request.urlopen(f"{API_URL}/health", timeout=3) as resp:
        data = json.loads(resp.read().decode('utf-8'))
        print("✓ Health Check Passed:", data)
except Exception as e:
    print(f"❌ Health Check Failed: {e}")
    sys.exit(1)

# 2. Prediction check (POST /predict)
test_articles = [
    {
        "uuid": "test-fn-1",
        "title": "SHOCKING EXPOSED: Alien conspiracy secret truth revealed!",
        "description": "Unbelievable claims about hidden secrets."
    },
    {
        "uuid": "test-fn-2",
        "title": "President signs landmark infrastructure bill into law",
        "description": "Official legislation signed at the White House."
    }
]

req_data = json.dumps({"articles": test_articles}).encode('utf-8')
req = urllib.request.Request(
    f"{API_URL}/predict",
    data=req_data,
    headers={"Content-Type": "application/json"}
)

try:
    with urllib.request.urlopen(req, timeout=15) as resp:
        result = json.loads(resp.read().decode('utf-8'))
        print("\n✓ Prediction Response Received:")
        print(json.dumps(result, indent=2))
        
        preds = result.get("predictions", [])
        if len(preds) == 2:
            print("\nArticle 1 Fake News:", preds[0].get("fakeNews"), f"({preds[0].get('fakeNewsConfidence')})")
            print("Article 2 Fake News:", preds[1].get("fakeNews"), f"({preds[1].get('fakeNewsConfidence')})")
            print("\n✓ Fake News Model Server verification successful!")
        else:
            print("❌ Unexpected prediction count")
except Exception as e:
    print(f"❌ Prediction Failed: {e}")
    sys.exit(1)
