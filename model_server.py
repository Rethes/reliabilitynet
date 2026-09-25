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

SENTIMENT_MODEL_PATH = os.environ.get("SENTIMENT_MODEL_PATH", "./roberta_sentiment_model")
FAKE_NEWS_MODEL_PATH = os.environ.get("FAKE_NEWS_MODEL_PATH", "./roberta_large_fake_news_model")
CLICKBAIT_MODEL_PATH = os.environ.get("CLICKBAIT_MODEL_PATH", "./roberta_large_clickbait_model")
META_MODEL_PATH = os.environ.get("META_MODEL_PATH", "./meta_logistic_regression_model")
PORT = int(os.environ.get("PORT", 5001))

print(f"Loading RoBERTa Sentiment model from: {SENTIMENT_MODEL_PATH} ...")
try:
    sentiment_tokenizer = AutoTokenizer.from_pretrained(SENTIMENT_MODEL_PATH)
    sentiment_model = AutoModelForSequenceClassification.from_pretrained(SENTIMENT_MODEL_PATH)
    sentiment_model.eval()
    print("✓ Sentiment model and tokenizer loaded successfully!")
except Exception as e:
    print(f"❌ Error loading sentiment model from {SENTIMENT_MODEL_PATH}: {e}")
    sys.exit(1)

print(f"Loading RoBERTa Large Fake News model from: {FAKE_NEWS_MODEL_PATH} ...")
try:
    fake_news_tokenizer = AutoTokenizer.from_pretrained(FAKE_NEWS_MODEL_PATH)
    fake_news_model = AutoModelForSequenceClassification.from_pretrained(FAKE_NEWS_MODEL_PATH)
    fake_news_model.eval()
    print("✓ Fake News model and tokenizer loaded successfully!")
except Exception as e:
    print(f"⚠️ Warning: Could not load Fake News model from {FAKE_NEWS_MODEL_PATH}: {e}")
    fake_news_tokenizer = None
    fake_news_model = None

print(f"Loading RoBERTa Large Clickbait model from: {CLICKBAIT_MODEL_PATH} ...")
try:
    clickbait_tokenizer = AutoTokenizer.from_pretrained(CLICKBAIT_MODEL_PATH)
    clickbait_model = AutoModelForSequenceClassification.from_pretrained(CLICKBAIT_MODEL_PATH)
    clickbait_model.eval()
    print("✓ Clickbait model and tokenizer loaded successfully!")
except Exception as e:
    print(f"⚠️ Warning: Could not load Clickbait model from {CLICKBAIT_MODEL_PATH}: {e}")
    clickbait_tokenizer = None
    clickbait_model = None

print(f"Loading Logistic Regression Meta-Classifier model from: {META_MODEL_PATH} ...")
try:
    meta_model = joblib.load(os.path.join(META_MODEL_PATH, "logistic_regression_metaclassifier.joblib"))
    meta_scaler = joblib.load(os.path.join(META_MODEL_PATH, "meta_feature_scaler.joblib"))
    meta_tfidf = joblib.load(os.path.join(META_MODEL_PATH, "tfidf_vectorizer.joblib"))
    meta_label_encoder = joblib.load(os.path.join(META_MODEL_PATH, "label_encoder.joblib"))
    print("✓ Logistic Regression Meta-Classifier loaded successfully!")
except Exception as e:
    print(f"⚠️ Warning: Could not load Meta-Classifier from {META_MODEL_PATH}: {e}")
    meta_model = None
    meta_scaler = None
    meta_tfidf = None
    meta_label_encoder = None

# Label mapping for Sentiment (0: negative, 1: neutral, 2: positive)
SENTIMENT_LABEL_MAP = {
    0: "negative",
    1: "neutral",
    2: "positive",
    "LABEL_0": "negative",
    "LABEL_1": "neutral",
    "LABEL_2": "positive"
}

# Label mapping for Fake News.
# Some checkpoints are trained with the opposite class ordering, so we support both
# a normal mapping and a fallback rule that treats low-confidence predictions as Real News.
FAKE_NEWS_LABEL_MAP = {
    0: "Real News",
    1: "Fake News",
    "LABEL_0": "Real News",
    "LABEL_1": "Fake News"
}

FAKE_NEWS_CONFIDENCE_THRESHOLD = 0.8


def normalize_fake_news_prediction(pred_idx, probs):
    """Guard against over-predicting Fake News on neutral headlines."""
    conf = float(probs[pred_idx]) if isinstance(probs, (list, tuple)) else float(probs)
    if conf < FAKE_NEWS_CONFIDENCE_THRESHOLD:
        return 0, "Real News", conf

    # If the model is biased toward class 1, interpret it as a strong fake-news signal only.
    return pred_idx, get_fake_news_label(pred_idx), conf

# Label mapping for Clickbait (0: Not Clickbait, 1: Clickbait)
CLICKBAIT_LABEL_MAP = {
    0: "Not Clickbait",
    1: "Clickbait",
    "LABEL_0": "Not Clickbait",
    "LABEL_1": "Clickbait"
}

id2label_sentiment = getattr(sentiment_model.config, 'id2label', {})

def get_sentiment_label(idx):
    raw_label = id2label_sentiment.get(idx, id2label_sentiment.get(str(idx), idx))
    return SENTIMENT_LABEL_MAP.get(raw_label, SENTIMENT_LABEL_MAP.get(idx, str(raw_label).lower()))

def get_fake_news_label(idx):
    return FAKE_NEWS_LABEL_MAP.get(idx, "Fake News" if idx == 1 else "Real News")

def get_clickbait_label(idx):
    return CLICKBAIT_LABEL_MAP.get(idx, "Clickbait" if idx == 1 else "Not Clickbait")

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

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        "status": "healthy",
        "service": "ReliabilityNet API",
        "endpoints": {
            "GET /": "Service info",
            "GET /health": "Health status and model capabilities",
            "POST /predict/sentiment": "Predict sentiment status specifically for article titles",
            "POST /predict/fake-news": "Predict fake news status specifically for article titles",
            "POST /predict/clickbait": "Predict clickbait status specifically for article titles",
            "POST /predict/reliability": "Predict reliability score for article titles"
        },
        "models": {
            "sentiment": SENTIMENT_MODEL_PATH,
            "fake_news": FAKE_NEWS_MODEL_PATH if fake_news_model is not None else None,
            "clickbait": CLICKBAIT_MODEL_PATH if clickbait_model is not None else None,
            "meta_classifier": META_MODEL_PATH if meta_model is not None else None
        },
        "fake_news_loaded": fake_news_model is not None,
        "clickbait_loaded": clickbait_model is not None,
        "sentiment_loaded": sentiment_model is not None,
        "meta_classifier_loaded": meta_model is not None,

        "sentiment_labels": {idx: get_sentiment_label(idx) for idx in range(len(id2label_sentiment) or 3)},
        "fake_news_labels": {0: "Real News", 1: "Fake News"},
        "clickbait_labels": {0: "Not Clickbait", 1: "Clickbait"},
        "meta_classifier_labels": {cls: cls for cls in getattr(meta_label_encoder, 'classes_', ['pants-fire', 'false', 'barely-true', 'half-true', 'mostly-true', 'true'])}

    })

TRUTHFULNESS_WEIGHTS = {
    'pants-fire': 0.0,
    'false': 0.15,
    'barely-true': 0.35,
    'half-true': 0.65,
    'mostly-true': 0.85,
    'true': 1.0
}


def predict_reliability_meta(texts, base_probs_list):
    """
    Passes base model probabilities (fake news, clickbait, sentiment) and article text
    into the Logistic Regression Meta-Classifier to calculate a 0-100 Reliability Score.
    """
    if meta_model is None or meta_scaler is None or meta_tfidf is None or meta_label_encoder is None:
        return None

    try:
        n = len(texts)
        X_num_raw = np.array(base_probs_list, dtype=np.float32)
        X_num_scaled = meta_scaler.transform(X_num_raw)

        X_tfidf = meta_tfidf.transform(texts)

        target_dim = getattr(meta_model, 'n_features_in_', 15512)
        current_dim = X_tfidf.shape[1] + X_num_scaled.shape[1]
        remainder_dim = max(0, target_dim - current_dim)

        if remainder_dim > 0:
            X_rem = csr_matrix((n, remainder_dim))
            X_full = hstack([X_tfidf, X_num_scaled, X_rem]).tocsr()
        else:
            X_full = hstack([X_tfidf, X_num_scaled]).tocsr()

        preds_proba = meta_model.predict_proba(X_full)
        classes = meta_label_encoder.classes_

        results = []
        for i in range(n):
            probs_i = preds_proba[i]
            prob_dict = {str(classes[j]): round(float(probs_i[j]), 4) for j in range(len(classes))}
            weighted_score = sum(prob_dict.get(cls, 0.0) * w for cls, w in TRUTHFULNESS_WEIGHTS.items()) * 100.0
            score = max(0, min(100, int(round(weighted_score))))
            top_class = str(classes[int(np.argmax(probs_i))])
            results.append({
                "reliabilityScore": score,
                "truthfulnessLabel": top_class,
                "metaProbabilities": prob_dict
            })

        return results
    except Exception as e:
        print(f"Meta-classifier prediction error: {e}")
        return None


@app.route('/predict/sentiment', methods=['GET'])
def predict_get():
    return jsonify({
        "message": "Send a POST request with JSON payload to analyze articles for sentiment only.",
        "example_payload": {
            "articles": [
                {"title": "10 SHOCKING facts you won't believe!", "text": "Example content"},
                {"title": "Federal Reserve updates interest rate guidance", "text": "Official economic news"}
            ]
        }
    })


@app.route('/predict/sentiment', methods=['POST'])
def predict_sentiment():
    data = request.get_json(silent=True) or {}
    texts = data.get('texts', [])
    articles = data.get('articles', [])

    if not texts and articles:
        texts = [
            f"{a.get('title', '')}. {a.get('description', '') or a.get('text', '') or ''}".strip()
            for a in articles
        ]

    if not texts:
        return jsonify({"error": "No texts or articles provided for prediction"}), 400

    try:
        inputs = sentiment_tokenizer(
            texts,
            padding=True,
            truncation=True,
            max_length=512,
            return_tensors="pt"
        )
        with torch.no_grad():
            outputs = sentiment_model(**inputs)
            sentiment_logits = outputs.logits
            sentiment_probs = F.softmax(sentiment_logits, dim=-1)

        results = []
        for i, text in enumerate(texts):
            s_probs = sentiment_probs[i].tolist()
            s_pred_idx = int(torch.argmax(sentiment_logits[i]).item())
            sentiment = get_sentiment_label(s_pred_idx)
            s_conf = round(s_probs[s_pred_idx], 4)
            s_prob_dict = {
                get_sentiment_label(idx): round(s_probs[idx], 4)
                for idx in range(len(s_probs))
            }

            result = {
                "title": articles[i].get("title", text) if articles and i < len(articles) else text,
                "sentiment": sentiment,
                "confidence": s_conf,
                "probabilities": s_prob_dict,
                "index": s_pred_idx
            }

            if articles and i < len(articles):
                result["article_id"] = articles[i].get("uuid") or articles[i].get("url") or i

            results.append(result)

        return jsonify({
            "success": True,
            "predictions": results
        })

    except Exception as e:
        print(f"Sentiment prediction error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/predict/reliability', methods=['POST'])
def predict_reliability():
    data = request.get_json(silent=True) or {}
    texts = data.get('texts', [])
    articles = data.get('articles', [])
    descriptions = [
        a.get('description', '') or a.get('text', '') or ''
        for a in articles
    ] if articles else []

    if not texts and articles:
        texts = [
            f"{a.get('title', '')}. {descriptions[i]}".strip()
            for i, a in enumerate(articles)
        ]

    titles = [articles[i].get('title', text) for i, text in enumerate(texts)] if articles else texts

    if not texts:
        return jsonify({"error": "No texts or articles provided for prediction"}), 400

    try:
        # 1. Sentiment Inference
        inputs = sentiment_tokenizer(
            texts,
            padding=True,
            truncation=True,
            max_length=512,
            return_tensors="pt"
        )
        with torch.no_grad():
            outputs = sentiment_model(**inputs)
            sentiment_logits = outputs.logits
            sentiment_probs = F.softmax(sentiment_logits, dim=-1)

        # 2. Fake News Inference
        fn_probs_list = []
        if fake_news_model and fake_news_tokenizer:
            try:
                fn_inputs = fake_news_tokenizer(
                    titles,
                    padding=True,
                    truncation=True,
                    max_length=512,
                    return_tensors="pt"
                )
                with torch.no_grad():
                    fn_outputs = fake_news_model(**fn_inputs)
                    fn_logits = fn_outputs.logits
                    fn_probs_list = F.softmax(fn_logits, dim=-1).tolist()
            except Exception as e:
                print(f"Fake news batch prediction error: {e}")

        # 3. Clickbait Inference
        cb_probs_list = []
        if clickbait_model and clickbait_tokenizer:
            try:
                cb_inputs = clickbait_tokenizer(
                    titles,
                    padding=True,
                    truncation=True,
                    max_length=512,
                    return_tensors="pt"
                )
                with torch.no_grad():
                    cb_outputs = clickbait_model(**cb_inputs)
                    cb_logits = cb_outputs.logits
                    cb_probs_list = F.softmax(cb_logits, dim=-1).tolist()
            except Exception as e:
                print(f"Clickbait batch prediction error: {e}")

        # 4. Construct Base Probabilities Matrix for Meta-Classifier
        # [fn_prob_fake, cb_prob_cb, sent_prob_neg, sent_prob_neu, sent_prob_pos]
        base_probs_for_meta = []
        for i in range(len(texts)):
            s_probs = sentiment_probs[i].tolist()
            sent_neg = s_probs[0] if len(s_probs) > 0 else 0.33
            sent_neu = s_probs[1] if len(s_probs) > 1 else 0.33
            sent_pos = s_probs[2] if len(s_probs) > 2 else 0.33

            fn_fake_prob = fn_probs_list[i][1] if i < len(fn_probs_list) and len(fn_probs_list[i]) > 1 else 0.5
            cb_cb_prob = cb_probs_list[i][1] if i < len(cb_probs_list) and len(cb_probs_list[i]) > 1 else 0.5

            base_probs_for_meta.append([fn_fake_prob, cb_cb_prob, sent_neg, sent_neu, sent_pos])

        # 5. Meta-Classifier Reliability Prediction
        meta_results = predict_reliability_meta(texts, base_probs_for_meta)

        results = []
        for i, text in enumerate(texts):
            s_probs = sentiment_probs[i].tolist()
            s_pred_idx = int(torch.argmax(sentiment_logits[i]).item())
            sentiment = get_sentiment_label(s_pred_idx)
            s_conf = round(s_probs[s_pred_idx], 4)
            s_prob_dict = {
                get_sentiment_label(idx): round(s_probs[idx], 4)
                for idx in range(len(s_probs))
            }

            sentiment_result = {
                "label": sentiment,
                "confidence": s_conf,
                "index": s_pred_idx,
                "probabilities": s_prob_dict
            }

            fake_news_result = None
            if i < len(fn_probs_list):
                fn_p = fn_probs_list[i]
                fn_pred_idx = int(np.argmax(fn_p))
                adj_idx, fn_label, fn_conf = normalize_fake_news_prediction(fn_pred_idx, fn_p)
                fake_news_result = {
                    "label": fn_label,
                    "confidence": round(fn_conf, 4),
                    "index": fn_pred_idx,
                    "probabilities": {
                        "Real News": round(fn_p[0], 4),
                        "Fake News": round(fn_p[1], 4)
                    }
                }

            clickbait_result = None
            if i < len(cb_probs_list):
                cb_p = cb_probs_list[i]
                cb_pred_idx = int(np.argmax(cb_p))
                cb_label = get_clickbait_label(cb_pred_idx)
                clickbait_result = {
                    "label": cb_label,
                    "confidence": round(cb_p[cb_pred_idx], 4),
                    "index": cb_pred_idx,
                    "probabilities": {
                        "Not Clickbait": round(cb_p[0], 4),
                        "Clickbait": round(cb_p[1], 4)
                    }
                }

            meta_result = None
            if meta_results and i < len(meta_results):
                meta_result = {
                    "reliabilityScore": meta_results[i]["reliabilityScore"],
                    "truthfulnessLabel": meta_results[i]["truthfulnessLabel"],
                    "probabilities": meta_results[i]["metaProbabilities"]
                }

            res = {
                "title": articles[i].get("title", text) if articles and i < len(articles) else text,
                "text": text,
                "description": descriptions[i] if i < len(descriptions) else "",
                "sentiment": sentiment_result,
                "fakeNews": fake_news_result,
                "clickbait": clickbait_result,
                "reliability": meta_result
            }

            if articles and i < len(articles):
                res["article_id"] = articles[i].get("uuid") or articles[i].get("url") or i

            results.append(res)

        return jsonify({
            "success": True,
            "predictions": results
        })

    except Exception as e:
        print(f"Reliability prediction error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/predict/fake-news', methods=['POST'])
def predict_fake_news():
    if not fake_news_model or not fake_news_tokenizer:
        return jsonify({"error": "Fake news model not loaded"}), 503

    data = request.get_json(silent=True) or {}
    titles = data.get('titles', [])
    articles = data.get('articles', [])

    if not titles and articles:
        titles = [a.get('title', '') for a in articles]

    if not titles:
        return jsonify({"error": "No titles or articles provided"}), 400

    try:
        fn_inputs = fake_news_tokenizer(
            titles,
            padding=True,
            truncation=True,
            max_length=512,
            return_tensors="pt"
        )
        with torch.no_grad():
            fn_outputs = fake_news_model(**fn_inputs)
            fn_logits = fn_outputs.logits
            fn_probs = F.softmax(fn_logits, dim=-1)

        results = []
        for i in range(len(titles)):
            probs_i = fn_probs[i].tolist()
            pred_idx = int(torch.argmax(fn_logits[i]).item())
            adjusted_idx, label, conf = normalize_fake_news_prediction(pred_idx, probs_i)
            prob_dict = {
                "Real News": round(probs_i[0], 4),
                "Fake News": round(probs_i[1], 4)
            }
            if adjusted_idx != pred_idx:
                label = get_fake_news_label(adjusted_idx)
                conf = round(probs_i[adjusted_idx], 4)
                prob_dict = {
                    "Real News": round(probs_i[0], 4),
                    "Fake News": round(probs_i[1], 4)
                }
            results.append({
                "fakeNews": label,
                "confidence": conf,
                "probabilities": prob_dict,
                "title": titles[i]
            })

        return jsonify({
            "success": True,
            "predictions": results
        })
    except Exception as e:
        print(f"Fake news prediction error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/predict/clickbait', methods=['POST'])
def predict_clickbait():
    if not clickbait_model or not clickbait_tokenizer:
        return jsonify({"error": "Clickbait model not loaded"}), 503

    data = request.get_json(silent=True) or {}
    titles = data.get('titles', [])
    articles = data.get('articles', [])

    if not titles and articles:
        titles = [a.get('title', '') for a in articles]

    if not titles:
        return jsonify({"error": "No titles or articles provided"}), 400

    try:
        cb_inputs = clickbait_tokenizer(
            titles,
            padding=True,
            truncation=True,
            max_length=512,
            return_tensors="pt"
        )
        with torch.no_grad():
            cb_outputs = clickbait_model(**cb_inputs)
            cb_logits = cb_outputs.logits
            cb_probs = F.softmax(cb_logits, dim=-1)

        results = []
        for i in range(len(titles)):
            probs_i = cb_probs[i].tolist()
            pred_idx = int(torch.argmax(cb_logits[i]).item())
            label = get_clickbait_label(pred_idx)
            conf = round(probs_i[pred_idx], 4)
            prob_dict = {
                "Not Clickbait": round(probs_i[0], 4),
                "Clickbait": round(probs_i[1], 4)
            }
            results.append({
                "clickbait": label,
                "confidence": conf,
                "probabilities": prob_dict,
                "title": titles[i]
            })

        return jsonify({
            "success": True,
            "predictions": results
        })
    except Exception as e:
        print(f"Clickbait prediction error: {e}")
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    print(f"\n🚀 RoBERTa Intelligence Server (Sentiment, Fake News & Clickbait) starting on http://localhost:{PORT}\n")
    app.run(host='127.0.0.1', port=PORT, debug=False)