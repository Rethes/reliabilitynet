"""
This file runs the ML API for ReliabilityNet.

Purpose:
- load the saved sentiment, clickbait, and reliability models from disk
- receive article text from the frontend or proxy
- run inference on that text
- return structured prediction results as JSON

The server is a small Flask service. It only loads pre-trained models and responds to HTTP
requests. That makes it easy to call from the React frontend or any other
service that needs article scores.
"""

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

# -----------------------------------------------------------------------------
# 1) Basic service configuration
# -----------------------------------------------------------------------------
# These environment variables let us point the service at different model folders
# or change the port when running in different environments.
SENTIMENT_MODEL_PATH = os.environ.get("SENTIMENT_MODEL_PATH", "./roberta_sentiment_model")
CLICKBAIT_MODEL_PATH = os.environ.get("CLICKBAIT_MODEL_PATH", "./roberta_large_clickbait_model")
META_MODEL_PATH = os.environ.get("META_MODEL_PATH", "./meta_logistic_regression_model")
PORT = int(os.environ.get("PORT", 5001))

# -----------------------------------------------------------------------------
# 2) Model loading at startup
# -----------------------------------------------------------------------------
# The server loads all required models once when the script starts. This is more
# efficient than loading models on every request.
print(f"Loading RoBERTa Sentiment model from: {SENTIMENT_MODEL_PATH} ...")
try:
    # Tokenizer converts raw article text into the exact format the model expects.
    sentiment_tokenizer = AutoTokenizer.from_pretrained(SENTIMENT_MODEL_PATH)
    # The actual transformer model produces class logits for sentiment predictions.
    sentiment_model = AutoModelForSequenceClassification.from_pretrained(SENTIMENT_MODEL_PATH)
    sentiment_model.eval()
    print("✓ Sentiment model and tokenizer loaded successfully!")
except Exception as e:
    print(f"❌ Error loading sentiment model from {SENTIMENT_MODEL_PATH}: {e}")
    sys.exit(1)

print(f"Loading RoBERTa Large Clickbait model from: {CLICKBAIT_MODEL_PATH} ...")
try:
    clickbait_tokenizer = AutoTokenizer.from_pretrained(CLICKBAIT_MODEL_PATH)
    clickbait_model = AutoModelForSequenceClassification.from_pretrained(CLICKBAIT_MODEL_PATH)
    clickbait_model.eval()
    print("✓ Clickbait model and tokenizer loaded successfully!")
except Exception as e:
    print(f"⚠️ Warning: Could not load Clickbait model from {CLICKBAIT_MODEL_PATH}: {e}")
    # The rest of the app can still run if the clickbait model is unavailable, but
    # clickbait predictions will be missing instead of causing startup failure.
    clickbait_tokenizer = None
    clickbait_model = None

print(f"Loading Logistic Regression Meta-Classifier model from: {META_MODEL_PATH} ...")
try:
    # The meta-classifier is a saved scikit-learn pipeline: it combines text features
    # and model probabilities to estimate a final reliability score.
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

# -----------------------------------------------------------------------------
# 3) Label mappings used to convert model indexes into readable names
# -----------------------------------------------------------------------------
# Transformer classification models internally store class ids like 0, 1, 2.
# We map those to human-friendly strings so the frontend receives readable values
# such as "positive" or "Clickbait" rather than raw numeric labels.
SENTIMENT_LABEL_MAP = {
    0: "negative",
    1: "neutral",
    2: "positive",
    "LABEL_0": "negative",
    "LABEL_1": "neutral",
    "LABEL_2": "positive"
}

CLICKBAIT_LABEL_MAP = {
    0: "Not Clickbait",
    1: "Clickbait",
    "LABEL_0": "Not Clickbait",
    "LABEL_1": "Clickbait"
}

# This reads the label dictionary that comes with the sentiment model config and
# uses it when the model provides labels in a format like "LABEL_0".
id2label_sentiment = getattr(sentiment_model.config, 'id2label', {})


def build_article_text(article):
    """
    Build the text sent to a model from one article object.

    Article APIs usually provide a title and body separately, so the title is
    prepended to the body. Some callers instead provide text that already starts
    with the title; in that case, return it as-is to avoid counting the title twice.
    """
    title = article.get('title', '').strip()
    body = (article.get('description', '') or article.get('text', '') or '').strip()

    if title and body[:len(title)].casefold() == title.casefold():
        remainder = body[len(title):]
        if not remainder or remainder[0].isspace() or remainder[0] in '.:!?;-':
            return body

    return f"{title}. {body}".strip()


def get_sentiment_label(idx):
    """
    Convert a sentiment class index into a readable label.

    Inputs:
        idx: integer class index such as 0, 1, or 2.

    Output:
        A human-readable label like "negative", "neutral", or "positive".
    """
    raw_label = id2label_sentiment.get(idx, id2label_sentiment.get(str(idx), idx))
    return SENTIMENT_LABEL_MAP.get(raw_label, SENTIMENT_LABEL_MAP.get(idx, str(raw_label).lower()))


def get_clickbait_label(idx):
    """
    Return a readable clickbait label from a class index.

    Inputs:
        idx: integer index from the clickbait model output.

    Output:
        "Not Clickbait" or "Clickbait".
    """
    return CLICKBAIT_LABEL_MAP.get(idx, "Clickbait" if idx == 1 else "Not Clickbait")

# -----------------------------------------------------------------------------
# 4) Flask application setup
# -----------------------------------------------------------------------------
# Flask is the HTTP layer. It exposes routes that the frontend hits to ask for
# predictions. CORS is enabled so the browser can call this local API.
app = Flask(__name__)
CORS(app)


@app.route('/', methods=['GET'])
def index():
    """
    Root endpoint that shows the available API routes.

    Input: no request body.
    Output: a JSON object describing the service and supported endpoints.
    """
    return jsonify({
        "status": "online",
        "service": "RoBERTa ReliabilityNet Intelligence API (Sentiment & Clickbait)",
        "endpoints": {
            "GET /": "Service info",
            "GET /health": "Health status and model capabilities",
            "POST /predict/sentiment": "Predict sentiment status specifically for article titles",
            "POST /predict/clickbait": "Predict clickbait status specifically for article titles",
            "POST /predict/reliability": "Predict reliability score for article titles"

        }
    })


@app.route('/health', methods=['GET'])
def health():
    """
    Health check used by the app and deployment scripts to confirm the API is alive.

    Input: none.
    Output: JSON containing service status and whether each model was loaded.
    """
    return jsonify({
        "status": "healthy",
        "service": "ReliabilityNet API",
        "endpoints": {
            "GET /": "Service info",
            "GET /health": "Health status and model capabilities",
            "POST /predict/sentiment": "Predict sentiment status specifically for article titles",
            "POST /predict/clickbait": "Predict clickbait status specifically for article titles",
            "POST /predict/reliability": "Predict reliability score for article titles"
        },
        "models": {
            "sentiment": SENTIMENT_MODEL_PATH,
            "clickbait": CLICKBAIT_MODEL_PATH if clickbait_model is not None else None,
            "meta_classifier": META_MODEL_PATH if meta_model is not None else None
        },
        "clickbait_loaded": clickbait_model is not None,
        "sentiment_loaded": sentiment_model is not None,
        "meta_classifier_loaded": meta_model is not None,

        "sentiment_labels": {idx: get_sentiment_label(idx) for idx in range(len(id2label_sentiment) or 3)},
        "clickbait_labels": {0: "Not Clickbait", 1: "Clickbait"},
        "meta_classifier_labels": {cls: cls for cls in getattr(meta_label_encoder, 'classes_', ['pants-fire', 'false', 'barely-true', 'half-true', 'mostly-true', 'true'])}

    })

# -----------------------------------------------------------------------------
# 5) Mapping for the final truthfulness score used in the meta-classifier
# -----------------------------------------------------------------------------
# The meta-classifier predicts among labels like "pants-fire", "false", etc.
# Each label is mapped to a numeric weight from 0 to 1, and then converted into a
# 0-to-100 reliability score for the UI.
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
    Combine text features and base model probabilities into a final reliability score.

    Inputs:
        texts: list of article strings used for TF-IDF feature extraction.
        base_probs_list: matrix of per-article base features, typically including
            sentiment probabilities and clickbait probability values.

    Output:
        A list of result dictionaries with:
            - reliabilityScore: overall 0-100 score
            - truthfulnessLabel: top predicted truthfulness class
            - metaProbabilities: per-class probability breakdown
            - available: whether the model output is valid

    Important logic:
        - The saved logistic regression model expects a combined feature vector.
        - We create text features with the saved TF-IDF vectorizer.
        - We create numeric features from sentiment + clickbait probabilities.
        - We pad feature dimensions if needed to match the model's training shape.
        - We compute class probabilities and turn them into a weighted score.
    """
    if meta_model is None or meta_scaler is None or meta_tfidf is None or meta_label_encoder is None:
        return None

    try:
        n = len(texts)

        # The saved scaler expects a 2D array of numeric features.
        X_num_raw = np.array(base_probs_list, dtype=np.float32)
        X_num_scaled = meta_scaler.transform(X_num_raw)

        # TF-IDF text features capture the article language itself and are used by
        # the saved meta-classifier alongside the probability features.
        X_tfidf = meta_tfidf.transform(texts)

        # The model was trained with a fixed number of expected input features.
        # Depending on how the pipeline was saved, the current feature count may be
        # slightly different from the model's expected count. We add zero columns if
        # needed so the saved model receives the shape it expects.
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

            # Convert each truthfulness label into a score between 0 and 1, then scale
            # it to 0-100 so the UI can display a simple reliability number.
            weighted_score = sum(prob_dict.get(cls, 0.0) * w for cls, w in TRUTHFULNESS_WEIGHTS.items()) * 100.0
            score = max(0, min(100, int(round(weighted_score))))
            top_class = str(classes[int(np.argmax(probs_i))])

            results.append({
                "reliabilityScore": score,
                "truthfulnessLabel": top_class,
                "metaProbabilities": prob_dict,
                "available": True
            })

        return results
    except Exception as e:
        print(f"Meta-classifier prediction error: {e}")
        return None


@app.route('/predict/sentiment', methods=['GET'])
def predict_get():
    """
    Show a simple usage example for the sentiment endpoint.

    Input: GET request with no payload.
    Output: instructions and example JSON structure for clients.
    """
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
    """
    Predict sentiment for one or more article texts.

    Input JSON can contain either:
        - texts: list of raw text strings
        - articles: list of article objects with title/description/text fields

    Output JSON includes the model label, confidence score, probability breakdown,
    and the article title or article id for each item.
    """
    data = request.get_json(silent=True) or {}
    texts = data.get('texts', [])
    articles = data.get('articles', [])

    # If the client sends article objects instead of plain text, we join the title
    # and body so the model sees a complete text sample.
    if not texts and articles:
        texts = [build_article_text(article) for article in articles]

    if not texts:
        return jsonify({"error": "No texts or articles provided for prediction"}), 400

    try:
        # Tokenize the article text so the transformer can understand it.
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
    """
    Generate the full reliability assessment for each article.

    This endpoint runs all three model steps in sequence for every article:
    1) sentiment classification
    2) clickbait classification
    3) meta-classifier reliability scoring

    Inputs:
        JSON with either `texts` or `articles`.

    Output:
        A list of per-article objects containing sentiment, clickbait, and reliability
        results together with confidence and probability details.
    """
    data = request.get_json(silent=True) or {}
    texts = data.get('texts', [])
    articles = data.get('articles', [])

    if not texts and articles:
        texts = [build_article_text(article) for article in articles]

    titles = [articles[i].get('title', text) for i, text in enumerate(texts)] if articles else texts

    if not texts:
        return jsonify({"error": "No texts or articles provided for prediction"}), 400

    try:
        # ---------------------------------------------------------------------
        # Step 1: sentiment inference
        # ---------------------------------------------------------------------
        # We classify the article text to understand whether it sounds negative,
        # neutral, or positive. This becomes one of the features used in the final
        # reliability estimate.
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

        # ---------------------------------------------------------------------
        # Step 2: clickbait inference
        # ---------------------------------------------------------------------
        # The clickbait model is run on article titles, because titles are usually the
        # strongest signal for sensational or misleading headline style.
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

        # ---------------------------------------------------------------------
        # Step 3: build the feature vector expected by the saved meta-classifier
        # ---------------------------------------------------------------------
        # The saved logistic regression model was trained using a fixed set of
        # numeric features. We create a vector with:
        #   - a placeholder auxiliary probability
        #   - clickbait probability for the title being clickbait
        #   - sentiment probabilities for negative, neutral, and positive
        #
        # This allows the meta-model to combine signal from multiple sources and
        # estimate overall trustworthiness.
        base_probs_for_meta = []
        for i in range(len(texts)):
            s_probs = sentiment_probs[i].tolist()
            sent_neg = s_probs[0] if len(s_probs) > 0 else 0.33
            sent_neu = s_probs[1] if len(s_probs) > 1 else 0.33
            sent_pos = s_probs[2] if len(s_probs) > 2 else 0.33

            auxiliary_prob = 0.5
            cb_cb_prob = cb_probs_list[i][1] if i < len(cb_probs_list) and len(cb_probs_list[i]) > 1 else 0.5

            base_probs_for_meta.append([auxiliary_prob, cb_cb_prob, sent_neg, sent_neu, sent_pos])

        # ---------------------------------------------------------------------
        # Step 4: final reliability prediction via meta-classifier
        # ---------------------------------------------------------------------
        # This is the final layer that turns the base model predictions into a single
        # reliability number and a truthfulness label.
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

            # Clickbait result is stored separately so the frontend can display a
            # dedicated badge for that signal.
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

            # The meta-model may fail or be unavailable. We use a fallback object so the
            # app can still return the rest of the data without crashing.
            meta_prediction = (
                meta_results[i]
                if meta_results and i < len(meta_results)
                else {
                    "reliabilityScore": None,
                    "truthfulnessLabel": None,
                    "metaProbabilities": None,
                    "available": False
                }
            )
            meta_result = {
                "reliabilityScore": meta_prediction["reliabilityScore"],
                "truthfulnessLabel": meta_prediction["truthfulnessLabel"],
                "probabilities": meta_prediction["metaProbabilities"],
                "available": meta_prediction["available"]
            }

            res = {
                "uuid": articles[i].get("uuid") if articles and i < len(articles) else None,
                "title": articles[i].get("title", text) if articles and i < len(articles) else text,
                "text": text,
                "sentiment": sentiment_result,
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


@app.route('/predict/clickbait', methods=['POST'])
def predict_clickbait():
    """
    Predict clickbait status for article titles.

    Input JSON may contain either:
        - titles: list of headline strings
        - articles: list of article objects with a title field

    Output:
        A list of per-title predictions with label, confidence, and probability map.
    """
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
    # This block only runs when the file is started directly as a Python script.
    # It starts the local Flask server for the app to call.
    print(f"\n🚀 RoBERTa Intelligence Server (Sentiment & Clickbait) starting on http://localhost:{PORT}\n")
    app.run(host='127.0.0.1', port=PORT, debug=False)
