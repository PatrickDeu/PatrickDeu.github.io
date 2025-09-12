document.addEventListener("DOMContentLoaded", function() {
    // --- CONFIGURATION ---
    const MAX_SERIES = 5;
    const FIXED_LOCATION = 'developed';
    const FIXED_WEIGHTING = 'vw_cap';

    // --- GLOBAL VARIABLES ---
    let chart;
    let factorTimeSeriesData = new Map();
    let nameMap = new Map();
    let allFactorStats = {};
    
    // --- DOM ELEMENTS ---
    const seriesSelectorsContainer = document.getElementById('series-selectors');
    const addSeriesBtn = document.getElementById('add-series-btn');
    const plotBtn = document.getElementById('plot-btn');
    const rowTemplate = document.getElementById('series-row-template');
    const tableBody = document.querySelector("#performance-table tbody");

    // --- INITIALIZATION ---
    async function init() {
        try {
            const [rawDataResponse, namesResponse, statsResponse] = await Promise.all([
                fetch('data.csv'),
                fetch('factor_names.csv'),
                fetch('factor_stats.csv')
            ]);
            
            const statsText = await statsResponse.text();
            loadPrecomputedStats(statsText);

            const namesText = await namesResponse.text();
            const namesData = Papa.parse(namesText, { header: true, delimiter: ';', skipEmptyLines: true }).data;
            namesData.forEach(row => nameMap.set(row.abr_jkp, row.name_new));

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
            
            addSeriesRow();
            addSeriesBtn.addEventListener('click', addSeriesRow);
            plotBtn.addEventListener('click', handlePlotting);

        } catch (error) {
            console.error("Initialization failed:", error);
            alert("Error loading or processing data. Please check console for details.");
        }
    }

    function loadPrecomputedStats(csvText) {
        const parsed = Papa.parse(csvText, { header: true, dynamicTyping: true }).data;
        const stats = {};
        let totalFactors = 0;
        
        parsed.forEach(row => {
            if (row.Factor) {
                stats[row.Factor] = row;
                totalFactors = row.total_factors || parsed.length;
            }
        });
        allFactorStats = { stats, total: totalFactors };
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
    
    // --- THIS FUNCTION IS THE FIX ---
    function plotChart(selectedFactors) {
        // Step 1: Create a master list of all unique dates from all selected series.
        const allDates = new Set();
        selectedFactors.forEach(name => {
            const series = factorTimeSeriesData.get(name);
            if (series) {
                series.forEach(d => allDates.add(d.date.getTime()));
            }
        });
        const masterDateArray = Array.from(allDates).sort((a, b) => a - b);

        // Step 2: For each factor, build a dataset that aligns with the master date list.
        const datasets = selectedFactors.map(name => {
            const series = factorTimeSeriesData.get(name);
            if (!series || series.length === 0) {
                return null; // Safety net for factors with no time-series data at all
            }

            // Create a Map for fast lookups: date(in milliseconds) -> return
            const returnMap = new Map(series.map(d => [d.date.getTime(), d.ret]));
            
            let cumulativeValue = null; // Start as null, becomes a number once data starts

            const dataPoints = masterDateArray.map(dateMs => {
                // Check if this factor has data for the current master date
                if (returnMap.has(dateMs)) {
                    // This is the first data point for this factor
                    if (cumulativeValue === null) {
                        cumulativeValue = 1; // Start the "growth of $1"
                    }
                    cumulativeValue *= (1 + returnMap.get(dateMs));
                }
                // The y-value is either the latest cumulative value or null if the series hasn't started
                return { x: dateMs, y: cumulativeValue };
            });

            return {
                label: nameMap.get(name) || name,
                data: dataPoints,
                borderColor: getRandomColor(),
                fill: false, tension: 0.1, pointRadius: 0,
                spanGaps: false // This tells Chart.js to create a break in the line for null values
            };
        }).filter(Boolean); // Removes any nulls from factors that had no data

        // Step 3: Render the chart
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

    // --- PERFORMANCE TABLE (No changes here, but included for completeness) ---
    function updatePerformanceTable(selectedFactors) {
        tableBody.innerHTML = '';
        selectedFactors.forEach(name => {
            const stats = allFactorStats.stats[name];
            if (!stats) {
                console.warn(`No performance stats found for factor '${name}'. It will be skipped in the table.`);
                return; 
            }
            const row = tableBody.insertRow();
            const total = allFactorStats.total;
            const formatCell = (value, rank, isPercent = false) => {
                const displayValue = isPercent ? value.toFixed(2) + '%' : value.toFixed(2);
                return `${displayValue} <span class="rank">(${rank}/${total})</span>`;
            };
            row.innerHTML = `
                <td>${nameMap.get(name) || name}</td>
                <td>${formatCell(stats['Average Return (Ann. %)'], stats['Average Return (Ann. %)_rank'])}</td>
                <td>${formatCell(stats['Volatility (Ann. %)'], stats['Volatility (Ann. %)_rank'])}</td>
                <td>${formatCell(stats['Sharpe Ratio'], stats['Sharpe Ratio_rank'])}</td>
                <td>${formatCell(stats['CAPM Alpha (Ann. %)'], stats['CAPM Alpha (Ann. %)_rank'])}</td>
                <td>${formatCell(stats['FF4 Alpha (Ann. %)'], stats['FF4 Alpha (Ann. %)_rank'])}</td>
            `;
        });
    }

    // --- HELPER & UI SETUP FUNCTIONS (No changes needed) ---
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
             .sort((a,b) => a[1].localeCompare(b[1]))
             .forEach(([abr, fullName]) => select.add(new Option(fullName, abr)));
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
