
let currentPage = 1;

let charts = {};

let crimeMap = null;

let mapMarkers = [];

const colors = {
    red: "#e34d53",
    redLight: "#f17b80",
    muted: "#9299a4",
    grid: "#292e36"
};


// -----------------------------------------
// API HELPER
// -----------------------------------------

async function api(url) {

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error("Unable to load data");
    }

    return response.json();
}


function filters() {

    const city = document.getElementById("cityFilter").value;
    const crime = document.getElementById("crimeFilter").value;
    const year = document.getElementById("yearFilter").value;

    return new URLSearchParams({
        city,
        crime,
        year
    }).toString();
}


// -----------------------------------------
// LOAD FILTER OPTIONS
// -----------------------------------------

async function loadOptions() {

    const data = await api("/api/options");

    function fill(id, values) {

        const select = document.getElementById(id);

        select.innerHTML = "";

        values.forEach(value => {

            const option = document.createElement("option");

            option.value = value;
            option.textContent = value;

            select.appendChild(option);

        });

    }

    fill("cityFilter", data.cities);
    fill("crimeFilter", data.crimes);
    fill("yearFilter", data.years);

}


// -----------------------------------------
// CHART DEFAULTS
// -----------------------------------------

Chart.defaults.color = colors.muted;

Chart.defaults.font.family = "Manrope";

Chart.defaults.font.size = 11;


function createChart(id, type, labels, values, horizontal = false) {

    const canvas = document.getElementById(id);

    if (!canvas) return;

    if (charts[id]) {
        charts[id].destroy();
    }

    charts[id] = new Chart(canvas, {

        type: type,

        data: {

            labels: labels,

            datasets: [{

                data: values,

                backgroundColor: type === "line"
                    ? "rgba(227,77,83,0.12)"
                    : colors.red,

                borderColor: colors.red,

                borderWidth: 2,

                fill: type === "line",

                tension: 0.35,

                pointRadius: 3,

                pointBackgroundColor: colors.red,

                borderRadius: 4

            }]

        },

        options: {

            responsive: true,

            maintainAspectRatio: false,

            indexAxis: horizontal ? "y" : "x",

            plugins: {

                legend: {
                    display: false
                }

            },

            scales: {

                x: {

                    grid: {
                        color: colors.grid
                    },

                    ticks: {
                        maxRotation: 45
                    }

                },

                y: {

                    grid: {
                        color: colors.grid
                    },

                    beginAtZero: true

                }

            }

        }

    });

}


// -----------------------------------------
// DASHBOARD
// -----------------------------------------

async function loadDashboard() {

    try {

        const data = await api(
            "/api/dashboard?" + filters()
        );

        const s = data.summary;

        document.getElementById("statTotal").textContent =
            s.total.toLocaleString("en-IN");

        document.getElementById("statCities").textContent =
            s.cities;

        document.getElementById("statCategories").textContent =
            s.categories;

        document.getElementById("statClosed").textContent =
            s.closed_rate + "%";

        document.getElementById("closedSub").textContent =
            s.closed.toLocaleString("en-IN") + " records marked closed";

        // Crime category chart

        createChart(
            "crimeChart",
            "bar",
            data.crime_types.map(x => x.label),
            data.crime_types.map(x => x.value),
            true
        );

        // City chart

        createChart(
            "cityChart",
            "bar",
            data.cities_top.map(x => x.label),
            data.cities_top.map(x => x.value),
            true
        );

        // Year chart

        createChart(
            "yearChart",
            "line",
            data.yearly.map(x => x.label),
            data.yearly.map(x => x.value)
        );

        // Hour chart

        createChart(
            "hourChart",
            "bar",
            data.hourly.map(x => x.label),
            data.hourly.map(x => x.value)
        );

        // Month chart

        createChart(
            "monthChart",
            "bar",
            data.monthly.map(x => x.label),
            data.monthly.map(x => x.value)
        );

        // City map

        updateMap(data.map);

        // City ranking

        updateRanking(data.cities_top);

        // Findings

        updateInsights(data.insights);

        // Refresh records

        currentPage = 1;

        loadRecords();

    }

    catch (error) {

        console.error(error);

        alert("Dashboard could not load. Check the Flask server.");

    }

}


// -----------------------------------------
// CITY RANKING
// -----------------------------------------

function updateRanking(data) {

    const container = document.getElementById("cityRanking");

    container.innerHTML = "";

    const max = Math.max(...data.map(x => x.value), 1);

    data.forEach(item => {

        const percentage = item.value / max * 100;

        const div = document.createElement("div");

        div.className = "ranking-item";

        const heading = document.createElement("div");

        const name = document.createElement("span");
        name.textContent = item.label;

        const value = document.createElement("small");
        value.textContent = item.value.toLocaleString("en-IN");

        heading.append(name, value);

        const bar = document.createElement("div");
        bar.className = "rank-bar";

        const fill = document.createElement("div");
        fill.style.width = percentage + "%";

        bar.appendChild(fill);

        div.append(heading, bar);

        container.appendChild(div);

    });

}


// -----------------------------------------
// MAP
// -----------------------------------------


function initialiseMap() {

    if (crimeMap) return;

    crimeMap = L.map("crimeMap", {
        center: [22.5, 79.5],
        zoom: 4,
        zoomControl: true
    });

    // Correct OpenStreetMap tile URL
    const osmLayer = L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
            maxZoom: 19,
            attribution:
                '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }
    );

    osmLayer.on("tileerror", function(event) {
        console.error("MAP TILE ERROR:", event);
    });

    osmLayer.on("tileload", function() {
        console.log("MAP TILE LOADED");
    });

    osmLayer.addTo(crimeMap);

    console.log("CRIME PATTERN HUNTER MAP INITIALISED");
}



function updateMap(data) {

    initialiseMap();

    mapMarkers.forEach(marker => {
        crimeMap.removeLayer(marker);
    });

    mapMarkers = [];

    data.forEach(item => {

        const radius = Math.min(
            25,
            7 + item.count / 1000
        );

        const marker = L.circleMarker(
            [item.lat, item.lng],
            {
                radius: radius,
                color: colors.red,
                fillColor: colors.red,
                fillOpacity: 0.55,
                weight: 2
            }
        );

        marker.bindPopup(
            `<b>${escapeHTML(item.city)}</b><br>
             Records: ${item.count.toLocaleString("en-IN")}`
        );

        marker.addTo(crimeMap);

        mapMarkers.push(marker);

    });

}


// -----------------------------------------
// ESCAPE HTML IN USER/DATA VALUES
// -----------------------------------------

function escapeHTML(value) {

    return String(value ?? "").replace(
        /[&<>"']/g,
        char => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[char]
    );

}


// -----------------------------------------
// CRIME RECORD EXPLORER
// -----------------------------------------

async function loadRecords() {

    const search = document.getElementById(
        "recordSearch"
    ).value;

    const params = new URLSearchParams(
        filters()
    );

    params.set("q", search);
    params.set("page", currentPage);

    try {

        const data = await api(
            "/api/records?" + params.toString()
        );

        const body = document.getElementById(
            "recordsBody"
        );

        body.innerHTML = "";

        if (!data.rows.length) {

            body.innerHTML =
                '<tr><td colspan="8">No records found.</td></tr>';

        }

        data.rows.forEach(row => {

            const tr = document.createElement("tr");

            const values = [

                row["Report Number"],
                row["Date of Occurrence"],
                row["City"],
                row["Crime Description"],
                row["Crime Domain"],
                row["Victim Age"],
                row["Weapon Used"],
                row["Case Closed"]

            ];

            values.forEach((value, index) => {

                const td = document.createElement("td");

                td.textContent = value ?? "—";

                if (index === 7) {

                    td.style.color =
                        String(value).toLowerCase() === "yes"
                        ? "#69c995"
                        : "#f17b80";

                }

                tr.appendChild(td);

            });

            body.appendChild(tr);

        });

        document.getElementById("recordCount").textContent =
            data.total.toLocaleString("en-IN") + " records found";

        document.getElementById("pageLabel").textContent =
            data.page + " / " + data.pages;

        document.getElementById("prevPage").disabled =
            data.page <= 1;

        document.getElementById("nextPage").disabled =
            data.page >= data.pages;

    }

    catch (error) {

        console.error(error);

    }

}


// -----------------------------------------
// FINDINGS
// -----------------------------------------

function updateInsights(insights) {

    const container = document.getElementById(
        "insightsList"
    );

    container.innerHTML = "";

    insights.forEach((insight, index) => {

        const div = document.createElement("div");

        div.className = "insight-item";

        const label = document.createElement("strong");

        label.style.color = colors.red;

        label.textContent =
            "OBSERVATION " + String(index + 1).padStart(2, "0");

        const text = document.createElement("p");

        text.textContent = insight;

        div.append(label, text);

        container.appendChild(div);

    });

}


// -----------------------------------------
// MACHINE LEARNING
// -----------------------------------------

async function runPatterns() {

    const button = document.getElementById(
        "runPatterns"
    );

    const container = document.getElementById(
        "patternResults"
    );

    button.disabled = true;

    button.textContent = "Analysing...";

    container.innerHTML =
        '<div class="empty-state"><h3>Running machine learning...</h3><p>Analysing the selected records.</p></div>';

    try {

        const data = await api(
            "/api/patterns?" + filters()
        );

        if (data.error) {
            throw new Error(data.error);
        }

        container.innerHTML = "";

        const grid = document.createElement("div");

        grid.className = "pattern-grid";

        data.clusters.forEach(cluster => {

            const card = document.createElement("div");

            card.className = "pattern-card";

            card.innerHTML = `
                <h3>${escapeHTML(cluster.label)}</h3>

                <p>
                    Records: <b>${cluster.count.toLocaleString("en-IN")}</b><br>

                    Average occurrence hour: <b>${cluster.avg_hour}</b><br>

                    Average victim age: <b>${cluster.avg_age}</b><br>

                    Average police deployed: <b>${cluster.avg_police}</b><br>

                    Common crime: <b>${escapeHTML(cluster.top_crime)}</b>
                </p>
            `;

            grid.appendChild(card);

        });

        container.appendChild(grid);

        const anomaly = document.createElement("div");

        anomaly.className = "method-note";

        anomaly.innerHTML = `
            <h3>Isolation Forest Results</h3>

            <p>
                Unusual records identified:
                <b>${data.anomaly_count.toLocaleString("en-IN")}</b>
                (${data.anomaly_percentage}%)
            </p>

            <p>${escapeHTML(data.explanation)}</p>

            <p>${escapeHTML(data.anomaly_explanation)}</p>
        `;

        container.appendChild(anomaly);

    }

    catch (error) {

        container.innerHTML = "";

        const message = document.createElement("p");

        message.className = "method-note";

        message.textContent = error.message;

        container.appendChild(message);

    }

    finally {

        button.disabled = false;

        button.textContent = "Run Analysis ↗";

    }

}


// -----------------------------------------
// EVENT LISTENERS
// -----------------------------------------

["cityFilter", "crimeFilter", "yearFilter"].forEach(id => {

    document.getElementById(id).addEventListener(
        "change",
        loadDashboard
    );

});


document.getElementById("resetFilters").addEventListener(
    "click",
    () => {

        document.getElementById("cityFilter").value = "All";

        document.getElementById("crimeFilter").value = "All";

        document.getElementById("yearFilter").value = "All";

        loadDashboard();

    }
);


document.getElementById("recordSearch").addEventListener(
    "input",
    () => {

        currentPage = 1;

        loadRecords();

    }
);


document.getElementById("prevPage").addEventListener(
    "click",
    () => {

        if (currentPage > 1) {

            currentPage--;

            loadRecords();

        }

    }
);


document.getElementById("nextPage").addEventListener(
    "click",
    () => {

        currentPage++;

        loadRecords();

    }
);


document.getElementById("runPatterns").addEventListener(
    "click",
    runPatterns
);


// -----------------------------------------
// INITIALISE WEBSITE
// -----------------------------------------

async function initialise() {

    try {

        await loadOptions();

        await loadDashboard();

    }

    catch (error) {

        console.error(error);

        alert(
            "Could not connect to the backend. Start the Flask server and refresh."
        );

    }

}

initialise();


// Correct map sizing after scrolling to its section.

document.querySelectorAll('a[href="#geography"]').forEach(link => {

    link.addEventListener("click", () => {

        setTimeout(() => {

            if (crimeMap) {
                crimeMap.invalidateSize();
            }

        }, 400);

    });

});
