
from flask import Flask, render_template, jsonify, request
import pandas as pd
import numpy as np
from pathlib import Path
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans
from sklearn.ensemble import IsolationForest
import warnings

warnings.filterwarnings("ignore")

app = Flask(__name__)

DATA_PATH = Path(__file__).parent / "data" / "crime_dataset_india.csv"

# ------------------------------------------------
# LOAD AND PREPROCESS DATA
# ------------------------------------------------

df = pd.read_csv(DATA_PATH, low_memory=False)

def parse_dates(series):
    raw = series.astype("string").str.strip()

    # Try Indian-style day-first dates first
    first = pd.to_datetime(
        raw, format="mixed", dayfirst=True, errors="coerce"
    )

    # Use alternative parsing where necessary
    second = pd.to_datetime(
        raw, format="mixed", dayfirst=False, errors="coerce"
    )

    return first.fillna(second)


for col in [
    "Date Reported",
    "Date of Occurrence",
    "Time of Occurrence",
    "Date Case Closed"
]:
    if col in df.columns:
        df[col + "_parsed"] = parse_dates(df[col])

df["Occurrence Date"] = df["Date of Occurrence_parsed"]

df["Year"] = df["Occurrence Date"].dt.year
df["Month"] = df["Occurrence Date"].dt.month

df["Hour"] = df["Time of Occurrence_parsed"].dt.hour

df["Hour"] = df["Hour"].fillna(
    df["Occurrence Date"].dt.hour
).fillna(0).astype(int)

df["Victim Age"] = pd.to_numeric(
    df["Victim Age"], errors="coerce"
)

df["Police Deployed"] = pd.to_numeric(
    df["Police Deployed"], errors="coerce"
)

df["Crime Code"] = pd.to_numeric(
    df["Crime Code"], errors="coerce"
)

for col in [
    "City", "Crime Description", "Crime Domain",
    "Victim Gender", "Case Closed"
]:
    df[col] = df[col].fillna("Unknown").astype(str)

df["Weapon Used"] = df["Weapon Used"].fillna("Not Recorded")


# ------------------------------------------------
# CITY COORDINATES FOR MAP
# ------------------------------------------------

CITY_COORDS = {
    "Delhi": [28.6139, 77.2090],
    "Mumbai": [19.0760, 72.8777],
    "Bangalore": [12.9716, 77.5946],
    "Hyderabad": [17.3850, 78.4867],
    "Kolkata": [22.5726, 88.3639],
    "Chennai": [13.0827, 80.2707],
    "Pune": [18.5204, 73.8567],
    "Ahmedabad": [23.0225, 72.5714],
    "Jaipur": [26.9124, 75.7878],
    "Lucknow": [26.8467, 80.9462],
    "Kanpur": [26.4499, 80.3319],
    "Surat": [21.1702, 72.8311],
    "Agra": [27.1767, 78.0081],
    "Bhopal": [23.2599, 77.4126],
    "Faridabad": [28.4089, 77.3178],
    "Ghaziabad": [28.6692, 77.4538],
    "Indore": [22.7196, 75.8577],
    "Ludhiana": [30.9010, 75.8573],
    "Nagpur": [21.1458, 79.0882],
    "Nashik": [19.9975, 73.7898],
    "Patna": [25.5941, 85.1376],
    "Srinagar": [34.0837, 74.7973],
    "Thane": [19.2183, 72.9781],
    "Varanasi": [25.3176, 82.9739],
    "Visakhapatnam": [17.6868, 83.2185]
}


# ------------------------------------------------
# FILTER FUNCTION
# ------------------------------------------------

def filtered_data():

    data = df.copy()

    city = request.args.get("city", "All")
    crime = request.args.get("crime", "All")
    year = request.args.get("year", "All")

    if city != "All":
        data = data[data["City"] == city]

    if crime != "All":
        data = data[data["Crime Description"] == crime]

    if year != "All":
        data = data[data["Year"] == int(year)]

    return data


def make_counts(series, limit=None):

    values = series.value_counts()

    if limit:
        values = values.head(limit)

    return [
        {"label": str(k), "value": int(v)}
        for k, v in values.items()
    ]


# ------------------------------------------------
# WEBSITE
# ------------------------------------------------

@app.route("/")
def home():
    return render_template("index.html")


# ------------------------------------------------
# FILTER OPTIONS
# ------------------------------------------------

@app.route("/api/options")
def options():

    return jsonify({

        "cities": ["All"] + sorted(
            df["City"].unique().tolist()
        ),

        "crimes": ["All"] + sorted(
            df["Crime Description"].unique().tolist()
        ),

        "years": ["All"] + sorted(
            int(x) for x in df["Year"].dropna().unique()
        )

    })


# ------------------------------------------------
# DASHBOARD STATISTICS
# ------------------------------------------------

@app.route("/api/dashboard")
def dashboard():

    d = filtered_data()

    total = len(d)

    closed = int(
        (d["Case Closed"].str.lower() == "yes").sum()
    )

    top_crime = (
        d["Crime Description"].mode().iloc[0]
        if total else "Unknown"
    )

    top_city = (
        d["City"].mode().iloc[0]
        if total else "Unknown"
    )

    hourly = d.groupby("Hour").size().reindex(
        range(24), fill_value=0
    )

    monthly = d.groupby("Month").size().reindex(
        range(1, 13), fill_value=0
    )

    yearly = d.dropna(subset=["Year"]).groupby(
        "Year"
    ).size().sort_index()

    map_data = []

    for city, count in d["City"].value_counts().items():

        if city in CITY_COORDS:

            map_data.append({
                "city": city,
                "count": int(count),
                "lat": CITY_COORDS[city][0],
                "lng": CITY_COORDS[city][1]
            })

    insights = []

    if total:

        insights.append(
            f"{top_crime.title()} is the most frequently recorded "
            f"crime category, with "
            f"{int((d['Crime Description'] == top_crime).sum()):,} records."
        )

        insights.append(
            f"{top_city} has the highest number of records "
            f"in the current selection."
        )

        insights.append(
            f"The busiest recorded hour is {int(hourly.idxmax()):02d}:00."
        )

    return jsonify({

        "summary": {
            "total": total,
            "cities": int(d["City"].nunique()),
            "categories": int(d["Crime Description"].nunique()),
            "closed_rate": round(closed / total * 100, 1) if total else 0,
            "closed": closed,
            "open": total - closed,
            "top_crime": top_crime,
            "top_city": top_city
        },

        "crime_types": make_counts(
            d["Crime Description"], 10
        ),

        "cities_top": make_counts(
            d["City"], 10
        ),

        "domains": make_counts(
            d["Crime Domain"]
        ),

        "weapons": make_counts(
            d["Weapon Used"]
        ),

        "genders": make_counts(
            d["Victim Gender"]
        ),

        "yearly": [
            {"label": str(int(k)), "value": int(v)}
            for k, v in yearly.items()
        ],

        "hourly": [
            {"label": f"{int(k):02d}:00", "value": int(v)}
            for k, v in hourly.items()
        ],

        "monthly": [
            {
                "label": pd.Timestamp(2000, int(k), 1).strftime("%b"),
                "value": int(v)
            }
            for k, v in monthly.items()
        ],

        "map": map_data,

        "insights": insights

    })


# ------------------------------------------------
# CRIME RECORD EXPLORER
# ------------------------------------------------

@app.route("/api/records")
def records():

    d = filtered_data()

    search = request.args.get("q", "").strip().lower()

    if search:

        columns = [
            "City", "Crime Description",
            "Crime Domain", "Weapon Used"
        ]

        mask = pd.Series(False, index=d.index)

        for col in columns:

            mask |= d[col].astype(str).str.lower().str.contains(
                search, na=False
            )

        d = d[mask]

    page = max(1, int(request.args.get("page", 1)))

    per_page = 12

    total = len(d)

    start = (page - 1) * per_page

    view = d.iloc[start:start + per_page]

    fields = [
        "Report Number",
        "Date of Occurrence",
        "City",
        "Crime Description",
        "Crime Domain",
        "Victim Age",
        "Weapon Used",
        "Case Closed"
    ]

    rows = []

    for _, row in view[fields].iterrows():

        rows.append({
            k: None if pd.isna(v) else str(v)
            for k, v in row.items()
        })

    return jsonify({

        "rows": rows,
        "total": total,
        "page": page,
        "pages": max(1, (total + per_page - 1) // per_page)

    })


# ------------------------------------------------
# MACHINE LEARNING: K-MEANS + ISOLATION FOREST
# ------------------------------------------------

@app.route("/api/patterns")
def patterns():

    d = filtered_data().copy()

    if len(d) < 10:

        return jsonify({
            "error": "At least 10 records are required."
        }), 400

    features = d[
        ["Hour", "Victim Age", "Police Deployed", "Crime Code"]
    ].copy()

    features = features.fillna(
        features.median(numeric_only=True)
    )

    scaler = StandardScaler()

    x = scaler.fit_transform(features)

    # K-Means clustering
    kmeans = KMeans(
        n_clusters=3,
        random_state=42,
        n_init=10
    )

    d["Cluster"] = kmeans.fit_predict(x)

    clusters = []

    for cluster_id, group in d.groupby("Cluster"):

        clusters.append({

            "label": f"Pattern Group {cluster_id + 1}",

            "count": int(len(group)),

            "avg_hour": round(
                float(group["Hour"].mean()), 1
            ),

            "avg_age": round(
                float(group["Victim Age"].mean()), 1
            ),

            "avg_police": round(
                float(group["Police Deployed"].mean()), 1
            ),

            "top_crime": str(
                group["Crime Description"].mode().iloc[0]
            )

        })

    # Isolation Forest anomaly detection
    isolation = IsolationForest(
        contamination=0.03,
        random_state=42
    )

    anomaly_result = isolation.fit_predict(x)

    anomaly_count = int(
        (anomaly_result == -1).sum()
    )

    return jsonify({

        "clusters": clusters,

        "anomaly_count": anomaly_count,

        "anomaly_percentage": round(
            anomaly_count / len(d) * 100, 1
        ),

        "explanation":
        "K-Means groups records with similar numerical "
        "characteristics. These groups show statistical "
        "similarities, not criminal networks.",

        "anomaly_explanation":
        "Isolation Forest identifies records that differ "
        "from the majority. These are unusual data points, "
        "not proof of suspicious criminal activity."

    })


# ------------------------------------------------
# RUN SERVER
# ------------------------------------------------

if __name__ == "__main__":

    print("CRIME PATTERN HUNTER")
    print(f"Loaded {len(df):,} crime records.")

    app.run(debug=True, port=5000)
