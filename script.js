document.addEventListener("DOMContentLoaded", function() {
    // --- CONFIGURATION ---
    const MAX_SERIES = 5;
    const FIXED_LOCATION = 'developed';
    const FIXED_WEIGHTING = 'vw_cap';

    // --- GLOBAL VARIABLES ---
    let chart;
    let factorTimeSeriesData = new Map(); // For plotting raw returns
    let nameMap = new Map(); // Maps abbreviation to full name
    let allFactorStats = {}; // Stores pre-calculated stats from your Python script
    
    // --- DOM ELEMENTS ---
    const seriesSelectorsContainer = document.getElementById('series-selectors');
    const addSeriesBtn = document.getElementById('add-series-btn');
    const plotBtn = document.getElementById('plot-btn');
    const rowTemplate = document.getElementById('series-row-template');
    const tableBody = document.querySelector("#performance-table tbody");

    // --- INITIALIZATION ---
    async function init() {
        try {
            // Load all necessary files concurrently for speed
            const [rawDataResponse, namesResponse, statsResponse] = await Promise.all([
                fetch('data.csv'),
                fetch('factor_names.csv'),
                fetch('factor_stats.csv') // <-- NEW: Loading your Python output
            ]);
            
            // 1. Load the pre-calculated stats (from Python)
            const statsText = await statsResponse.text();
            loadPrecomputedStats(statsText);

            // 2. Load the factor name map
            const namesText = await namesResponse.text();
            const namesData = Papa.parse(namesText, { header: true, delimiter: ';', skipEmptyLines: true }).data;
            namesData.forEach(row => nameMap.set(row.abr_jkp, row.name_new));

            // 3. Load the raw time-series data for plotting
            const rawCsvText = await rawDataResponse.text();
            const allRawData = Papa.parse(rawCsvText, { header: true, dynamicTyping: true, skipEmptyLines: true }).data;
            const filteredRawData = allRawData.filter(d => d.location === FIXED_LOCATION && d.weighting === FIXED_WEIGHTING);

            for (const row of filteredRawData) {
                if (!factorTimeSeriesData.has(row.name)) {
                    factorTimeSeriesData.set(row.name, []);
                }
                factorTimeSeriesData.get(row.name).push({ date: new Date(row.date), ret: row.ret });
            }
            factorTimeSeriesData.forEach(series => series.sort((a, b) => a.date - b.date));
            
            // 4. Set up the UI
            addSeriesRow();
            addSeriesBtn.addEventListener('click', addSeriesRow);
            plotBtn.addEventListener('click', handlePlotting);

        } catch (error) {
            console.error("Initialization failed:", error);
            alert("Error loading or processing data. Please check console for details.");
        }
    }

    // --- DATA LOADING & PREPARATION ---
    function loadPrecomputedStats(csvText) {
        const parsed = Papa.parse(csvText, { header: true, dynamicTyping: true }).data;
        const stats = {};
        let totalFactors = 0;
        
        parsed.forEach(row => {
            if (row.Factor) {
                stats[row.Factor] = row; // Store the entire row of stats, keyed by factor name
                totalFactors = row.total_factors || parsed.length;
            }
        });
        
        allFactorStats = { stats, total: totalFactors };
        console.log("Successfully loaded pre-computed stats for all factors:", allFactorStats);
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
            const series = factorTimeSeriesData.get(name);
            let cumulativeReturn = 1;
            const dataPoints = series.map(d => {
                cumulativeReturn *= (1 + d.ret);
                return { x: d.date.getTime(), y: cumulativeReturn };
            });

            return {
                label: nameMap.get(name) || name,
                data: dataPoints,
                borderColor: getRandomColor(),
                fill: false, tension: 0.1, pointRadius: 0
            };
        });
        
        if (chart) chart.destroy();
        const ctx = document.getElementById('factorChart').getContext('2d');
        chart = new Chart(ctx, {
            type: 'line', data: { datasets },
            options: {
                responsive: true, interaction: { mode: 'index', intersect: false },
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
            const total = allFactorStats.total;

            const formatCell = (value, rank, isPercent = false) => {
                const displayValue = isPercent ? value.toFixed(2) + '%' : value.toFixed(2);
                return `${displayValue} <span class="rank">(${rank}/${total})</span>`;
            };
            
            // Use the exact column names from your Python script's output CSV
            row.innerHTML = `
                <td>${nameMap.get(name) || name}</td>
                <td>${formatCell(stats['Average Return (Ann. %)'], stats['Average Return (Ann. %)_rank'])}</td>
                <td>${formatCell(stats['Volatility (Ann. %)'], stats['Volatility (Ann. %)_rank'])}</td>
                <td>${formatCell(stats['Sharpe Ratio'], stats['Sharpe Ratio_rank'])}</td>
                <td>${formatCell(stats['CAPM Beta'], stats['CAPM Beta_rank'])}</td>
                <td>${formatCell(stats['CAPM Alpha (Ann. %)'], stats['CAPM Alpha (Ann. %)_rank'])}</td>
                <td>${formatCell(stats['FF4 Alpha (Ann. %)'], stats['FF4 Alpha (Ann. %)_rank'])}</td>
            `;
        });
    }

    // --- HELPER & UI SETUP FUNCTIONS ---
    function getSelectedFactors() {
        return Array.from(seriesSelectorsContainer.querySelectorAll('.factor-select')).map(sel => sel.value);
    }
    
    function addSeriesRow() {
        if (seriesSelectorsContainer.children.length >= MAX_SERIES) return;
        const newRow = rowTemplate.cloneNode(true);
        newRow.removeAttribute('id');
        newRow.style.display = 'grid';

        const select = newRow.querySelector('.factor-select');
        Array.from(nameMap.entries())
             .sort((a,b) => a[1].localeCompare(b[1])) // Sort by full name
             .forEach(([abr, fullName]) => {
                select.add(new Option(fullName, abr));
             });

        newRow.querySelector('.remove-btn').addEventListener('click', () => newRow.remove());
        seriesSelectorsContainer.appendChild(newRow);
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
