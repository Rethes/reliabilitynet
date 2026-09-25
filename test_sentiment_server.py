import sys
import torch
import torch.nn.functional as F
from transformers import AutoTokenizer, AutoModelForSequenceClassification

MODEL_PATH = './roberta_sentiment_model'

print("Loading tokenizer and model from:", MODEL_PATH)
try:
    tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH)
    model = AutoModelForSequenceClassification.from_pretrained(MODEL_PATH)
    model.eval()
    print("✓ Model successfully loaded!")
except Exception as e:
    print("❌ Failed to load model:", e)
    sys.exit(1)

test_sentences = [
    "Stocks hit record highs as company revenue surges with massive profit gains",
    "Devastating crash leaves major highway closed after tragic accident",
    "The official report was published by the ministry on Tuesday morning",
]

print("\n--- Diagnostic Inference Test ---")
for text in test_sentences:
    inputs = tokenizer(text, return_tensors="pt", truncation=True, max_length=512)
    with torch.no_grad():
        outputs = model(**inputs)
        logits = outputs.logits
        probs = F.softmax(logits, dim=-1)[0].tolist()
        
    print(f"\nText: \"{text}\"")
    print(f"Logits: {logits[0].tolist()}")
    print(f"Probs [0, 1, 2]: {[round(p, 4) for p in probs]}")
    pred_idx = torch.argmax(logits, dim=-1).item()
    print(f"Predicted Index: {pred_idx} (prob: {round(probs[pred_idx], 4)})")
