import os
import sys
import torch
import torch.nn.functional as F
import joblib
import numpy as np
from scipy.sparse import hstack, csr_matrix
from flask import Flask, request, jsonify
from flask_cors import CORS
from transformers import AutoTokenizer, AutoModelForSequenceClassification

PORT = int(os.environ.get("PORT", 5001))

app = Flask(__name__)
CORS(app)

@app.route('/', methods=['GET'])
def index():
    return jsonify({
        "status": "online",
        "service": "RoBERTa ReliabilityNet Intelligence API (Sentiment, Fake News & Clickbait)",
        "endpoints": {
            "GET /": "Service info",
            "GET /health": "Health status and model capabilities",
            "POST /predict/sentiment": "Predict sentiment status specifically for article titles",
            "POST /predict/fake-news": "Predict fake news status specifically for article titles",
            "POST /predict/clickbait": "Predict clickbait status specifically for article titles",
            "POST /predict/reliability": "Predict reliability score for article titles"

        }
    })

if __name__ == '__main__':
    print(f"\n🚀 RoBERTa Intelligence Server (Sentiment, Fake News & Clickbait) starting on http://localhost:{PORT}\n")
    app.run(host='127.0.0.1', port=PORT, debug=False)




