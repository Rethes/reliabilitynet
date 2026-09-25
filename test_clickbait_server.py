import sys
import json
import urllib.request
import urllib.error

API_URL = "http://localhost:5001"

print("--- Testing RoBERTa ML Intelligence Server ---")

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
        "uuid": "test-1",
        "title": "SHOCKING VIDEO: You won't believe what this celebrity did!",
        "description": "Viral clip shows incredible turn of events."
    },
    {
        "uuid": "test-2",
        "title": "Federal Reserve increases benchmark interest rate by 0.25%",
        "description": "Central bank announces latest monetary policy decision."
    }
]

req_data = json.dumps({"articles": test_articles}).encode('utf-8')
req = urllib.request.Request(
    f"{API_URL}/predict",
    data=req_data,
    headers={"Content-Type": "application/json"}
)

try:
    with urllib.request.urlopen(req, timeout=45) as resp:
        result = json.loads(resp.read().decode('utf-8'))
        print("\n✓ Prediction Response Received:")
        print(json.dumps(result, indent=2))
        
        preds = result.get("predictions", [])
        if len(preds) == 2:
            print("\nArticle 1 Clickbait:", preds[0].get("clickbait"), f"({preds[0].get('clickbaitConfidence')})")
            print("Article 2 Clickbait:", preds[1].get("clickbait"), f"({preds[1].get('clickbaitConfidence')})")
        else:
            print("❌ Unexpected prediction count")
except Exception as e:
    print(f"❌ Prediction Failed: {e}")
    sys.exit(1)

# 3. Dedicated clickbait prediction check (POST /predict/clickbait)
req_data_cb = json.dumps({"titles": ["SHOCKING VIDEO: You won't believe what this celebrity did!", "Federal Reserve increases interest rate"]}).encode('utf-8')
req_cb = urllib.request.Request(
    f"{API_URL}/predict/clickbait",
    data=req_data_cb,
    headers={"Content-Type": "application/json"}
)

try:
    with urllib.request.urlopen(req_cb, timeout=45) as resp:
        result = json.loads(resp.read().decode('utf-8'))
        print("\n✓ Dedicated Clickbait Endpoint Response Received:")
        print(json.dumps(result, indent=2))
        print("\n✓ ML Server verification successful!")
except Exception as e:
    print(f"❌ Clickbait Endpoint Prediction Failed: {e}")
    sys.exit(1)
