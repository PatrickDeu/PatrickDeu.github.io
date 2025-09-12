document.addEventListener("DOMContentLoaded", function() {
    // --- CONFIGURATION ---
    const MAX_SERIES = 5;
    const FIXED_LOCATION = 'developed'; // CORRECTED to match your data.csv
    const FIXED_WEIGHTING = 'vw_cap';  // CORRECTED to match your data.csv
    const PERIODS_PER_YEAR = 12; // Monthly data

    // --- GLOBAL VARIABLES ---
    let chart;
    let factorData = new Map(); // Stores time series data, keyed by factor abbreviation
    let nameMap = new Map(); // Maps abbreviation to full name
    let allFactorStats = {}; // Stores pre-calculated stats for all factors
    
    // --- DOM ELEMENTS ---
    const seriesSelectorsContainer = document.getElementById('series-selectors');
    const addSeriesBtn = document.getElementById('add-series-btn');
    const plotBtn = document.getElementById('plot-btn');
    const rowTemplate = document.getElementById('series-row-template');
    const tableBody = document.querySelector("#performance-table tbody");

    // --- INITIALIZATION ---
    async function init() {
        try {
            // Load both files concurrently
            const [dataResponse, namesResponse] = await Promise.all([
                fetch('data.csv'),
                fetch('factor_names.csv')
            ]);
            
            const csvText = await dataResponse.text();
            const namesText = await namesResponse.text();
            
            // 1. Create the name map
            const namesData = Papa.parse(namesText, { header: true, delimiter: ';', skipEmptyLines: true }).data;
            namesData.forEach(row => nameMap.set(row.abr_jkp, row.name_new));

            // 2. Process and structure the main data
            const allData = Papa.parse(csvText, { header: true, dynamicTyping: true, skipEmptyLines: true }).data;
            
            // The corrected and more robust filter
            const filteredData = allData.filter(d => 
                d.location && d.weighting &&
                d.location.trim() === FIXED_LOCATION && 
                d.weighting.trim() === FIXED_WEIGHTING
            );
            
            if (filteredData.length === 0) {
                alert(`Error: No data found for the fixed settings (Location: ${FIXED_LOCATION}, Weighting: ${FIXED_WEIGHTING}). Please check your data.csv file.`);
                return;
            }

            // Group data by factor name (abr_jkp)
            for (const row of filteredData) {
                if (!factorData.has(row.name)) {
                    factorData.set(row.name, []);
                }
                factorData.get(row.name).push({ date: new Date(row.date), ret: row.ret });
            }
            // Sort each factor's time series by date
            factorData.forEach(series => series.sort((a, b) => a.date - b.date));
            
            // 3. Pre-calculate stats and ranks for ALL factors
            precomputeAllStats();

            // 4. Set up the UI
            addSeriesRow();
            addSeriesBtn.addEventListener('click', addSeriesRow);
            plotBtn.addEventListener('click', handlePlotting);

        } catch (error) {
            console.error("Initialization failed:", error);
            alert("Error loading or processing data. Please check console for details.");
        }
    }

    // --- DATA & STATS COMPUTATION ---
    function precomputeAllStats() {
        const stats = {};
        const totalFactors = factorData.size;

        // Step A: Calculate raw stats for every factor
        factorData.forEach((series, name) => {
            const returns = series.map(d => d.ret);
            stats[name] = calculateMetrics(returns);
        });

        // Step B: Calculate ranks for each metric
        const metricsToRank = ['avgReturn', 'volatility', 'sharpeRatio'];
        metricsToRank.forEach(metric => {
            // For volatility, lower is better, so we sort ascending
            const sortOrder = metric === 'volatility' ? 1 : -1;
            const sorted = Object.entries(stats).sort((a, b) => (a[1][metric] - b[1][metric]) * sortOrder);
            
            sorted.forEach(([name], i) => {
                stats[name][`${metric}Rank`] = i + 1;
            });
        });
        
        allFactorStats = { stats, total: totalFactors };
        console.log("Pre-computed stats for all factors:", allFactorStats);
    }

    function calculateMetrics(returnsArray) {
        const n = returnsArray.length;
        if (n === 0) return { avgReturn: 0, volatility: 0, sharpeRatio: 0 };

        const mean = returnsArray.reduce((a, b) => a + b) / n;
        const stdDev = Math.sqrt(returnsArray.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / n);

        const annReturn = mean * PERIODS_PER_YEAR;
        const annVol = stdDev * Math.sqrt(PERIODS_PER_YEAR);
        const sharpe = annVol > 0 ? annReturn / annVol : 0;

        return {
            avgReturn: annReturn,
            volatility: annVol,
            sharpeRatio: sharpe,
        };
    }

    // --- UI & PLOTTING ---
    function handlePlotting() {
        const selectedFactors = getSelectedFactors();
        if (selectedFactors.length === 0) {
            alert("Please select at least one factor.");
            return;
        }
        plotChart(selectedFactors);
        updatePerformanceTable(selectedFactors);
    }
    
    function plotChart(selectedFactors) {
        const datasets = selectedFactors.map(name => {
            const series = factorData.get(name);
            let cumulativeReturn = 1;
            const dataPoints = series.map(d => {
                cumulativeReturn *= (1 + d.ret);
                return { x: d.date.getTime(), y: cumulativeReturn };
            });

            return {
                label: nameMap.get(name) || name,
                data: dataPoints,
                borderColor: getRandomColor(),
                fill: false,
                tension: 0.1,
                pointRadius: 0
            };
        });
        
        if (chart) chart.destroy();
        const ctx = document.getElementById('factorChart').getContext('2d');
        chart = new Chart(ctx, {
            type: 'line',
            data: { datasets },
            options: {
                responsive: true,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    x: { type: 'time', time: { unit: 'year' }, title: { display: true, text: 'Date' } },
                    y: { type: 'logarithmic', title: { display: true, text: 'Growth of $1 (Log Scale)' } }
                }
            }
        });
    }

    function updatePerformanceTable(selectedFactors) {
        tableBody.innerHTML = ''; // Clear previous results

        selectedFactors.forEach(name => {
            const stats = allFactorStats.stats[name];
            if (!stats) return;

            const row = tableBody.insertRow();
            row.innerHTML = `
                <td>${nameMap.get(name) || name}</td>
                <td>${(stats.avgReturn * 100).toFixed(2)}% <span class="rank">(${stats.avgReturnRank}/${allFactorStats.total})</span></td>
                <td>${(stats.volatility * 100).toFixed(2)}% <span class="rank">(${stats.volatilityRank}/${allFactorStats.total})</span></td>
                <td>${stats.sharpeRatio.toFixed(2)} <span class="rank">(${stats.sharpeRatioRank}/${allFactorStats.total})</span></td>
                <td>N/A</td> <!-- Placeholder for Alpha -->
                <td>N/A</td> <!-- Placeholder for Beta -->
                <td>N/A</td> <!-- Placeholder for Treynor Ratio -->
            `;
        });
    }

    // --- HELPER & UI SETUP FUNCTIONS ---
    function getSelectedFactors() {
        return Array.from(seriesSelectorsContainer.querySelectorAll('.factor-select')).map(sel => sel.value);
    }
    
    function addSeriesRow() {
        if (seriesSelectorsContainer.children.length >= MAX_SERIES) {
            alert(`Maximum of ${MAX_SERIES} series reached.`);
            return;
        }
        const newRow = rowTemplate.cloneNode(true);
        newRow.removeAttribute('id');
        newRow.style.display = 'grid';

        const select = newRow.querySelector('.factor-select');
        // Populate dropdown with full names, but value is the abbreviation
        Array.from(nameMap.entries()).sort((a,b) => a[1].localeCompare(b[1])).forEach(([abr, fullName]) => {
            select.add(new Option(fullName, abr));
        });

        newRow.querySelector('.remove-btn').addEventListener('click', () => {
            newRow.remove();
            updateAddButtonState();
        });
        seriesSelectorsContainer.appendChild(newRow);
        updateAddButtonState();
    }
    
    function updateAddButtonState() {
        addSeriesBtn.disabled = seriesSelectorsContainer.children.length >= MAX_SERIES;
    }
    
    function getRandomColor() {
        const r = Math.floor(Math.random() * 200);
        const g = Math.floor(Math.random() * 200);
        const b = Math.floor(Math.random() * 200);
        return `rgb(${r},${g},${b})`;
    }

    // --- START THE APP ---
    init();
});
