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
    const audioPlayer = new Audio();
    let currentlyPlayingButton = null;
    
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
                if (!factorTimeSeriesData.has(row.name)) { factorTimeSeriesData.set(row.name, []); }
                factorTimeSeriesData.get(row.name).push({ date: new Date(row.date), ret: row.ret });
            }
            factorTimeSeriesData.forEach(series => series.sort((a, b) => a.date - b.date));
            
            setupAudioPlayerListeners();
            addSeriesRow();
            addSeriesBtn.addEventListener('click', addSeriesRow);
            plotBtn.addEventListener('click', handlePlotting);
            tableBody.addEventListener('click', handleAudioPlay);

        } catch (error) {
            console.error("Initialization failed:", error);
            alert("Error loading or processing data. Please check console for details.");
        }
    }

    function setupAudioPlayerListeners() {
        audioPlayer.addEventListener('ended', () => {
            if (currentlyPlayingButton) {
                currentlyPlayingButton.textContent = 'Play';
                currentlyPlayingButton.classList.remove('playing');
                currentlyPlayingButton = null;
            }
        });
        audioPlayer.addEventListener('error', () => {
            alert(`Error: Could not find or play the requested audio file.`);
            if (currentlyPlayingButton) {
                currentlyPlayingButton.textContent = 'Play';
                currentlyPlayingButton.classList.remove('playing');
                currentlyPlayingButton = null;
            }
        });
    }

    function handleAudioPlay(event) {
        const clickedButton = event.target;
        if (!clickedButton.classList.contains('play-btn')) return;
        const audioSrc = clickedButton.dataset.audioSrc;
        if (clickedButton === currentlyPlayingButton) {
            audioPlayer.pause();
            clickedButton.textContent = 'Play';
            clickedButton.classList.remove('playing');
            currentlyPlayingButton = null;
        } else {
            if (currentlyPlayingButton) {
                currentlyPlayingButton.textContent = 'Play';
                currentlyPlayingButton.classList.remove('playing');
            }
            audioPlayer.src = audioSrc;
            audioPlayer.play();
            clickedButton.textContent = 'Stop';
            clickedButton.classList.add('playing');
            currentlyPlayingButton = clickedButton;
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

    function handlePlotting() {
        const selectedFactors = getSelectedFactors();
        if (selectedFactors.length === 0) { alert("Please select at least one factor."); return; }
        plotChart(selectedFactors);
        updatePerformanceTable(selectedFactors);
    }
    
    // --- THIS FUNCTION CONTAINS ALL THE AESTHETIC UPDATES ---
    function plotChart(selectedFactors) {
        const allDates = new Set();
        selectedFactors.forEach(name => {
            const series = factorTimeSeriesData.get(name);
            if (series) {
                series.forEach(d => allDates.add(d.date.getTime()));
            }
        });
        const masterDateArray = Array.from(allDates).sort((a, b) => a - b);

        const datasets = selectedFactors.map(name => {
            const series = factorTimeSeriesData.get(name);
            if (!series || series.length === 0) return null;
            const returnMap = new Map(series.map(d => [d.date.getTime(), d.ret]));
            let cumulativeValue = null;
            const dataPoints = masterDateArray.map(dateMs => {
                if (returnMap.has(dateMs)) {
                    if (cumulativeValue === null) { cumulativeValue = 1; }
                    cumulativeValue *= (1 + returnMap.get(dateMs));
                }
                return { x: dateMs, y: cumulativeValue };
            });
            return {
                label: nameMap.get(name) || name, data: dataPoints,
                borderColor: getRandomColor(), fill: false, tension: 0.1, pointRadius: 0,
                spanGaps: false
            };
        }).filter(Boolean);
        
        if (chart) chart.destroy();
        const ctx = document.getElementById('factorChart').getContext('2d');
        
        chart = new Chart(ctx, {
            type: 'line', 
            data: { datasets },
            options: {
                // FIX 1: RESPONSIVENESS - Allow chart to grow and shrink
                responsive: true,
                maintainAspectRatio: false, // This is the key to making it grow back

                interaction: { mode: 'index', intersect: false },
                
                scales: {
                    x: { 
                        type: 'time', 
                        time: { 
                            unit: 'year',
                            // FIX 2: X-AXIS TICKS - Show a label roughly every 10 years
                            stepSize: 10,
                            // This formats the axis labels themselves (e.g., '2000', '2010')
                            displayFormats: {
                                year: 'yyyy'
                            }
                        },
                        title: { display: true, text: 'Date' },
                        // FIX 3: REMOVE VERTICAL GRID LINES
                        grid: {
                            display: false 
                        }
                    },
                    y: { 
                        // FIX 4: Y-AXIS SCALE - No longer logarithmic
                        type: 'linear', 
                        title: { 
                            display: true, 
                            // FIX 5: Y-AXIS LABEL
                            text: 'Cumulative Wealth' 
                        }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            // FIX 6: TOOLTIP FORMAT - Show only Year, Month, Day
                            title: function(tooltipItems) {
                                const date = new Date(tooltipItems[0].parsed.x);
                                // Using Intl.DateTimeFormat for clean, localized date formatting
                                return new Intl.DateTimeFormat('en-GB', {
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric'
                                }).format(date);
                            }
                        }
                    }
                }
            }
        });
    }

    function updatePerformanceTable(selectedFactors) {
        tableBody.innerHTML = '';
        selectedFactors.forEach(name => {
            const stats = allFactorStats.stats[name];
            if (!stats) { console.warn(`No stats for '${name}'.`); return; }
            const row = tableBody.insertRow();
            const total = allFactorStats.total;
            const formatCell = (value, rank, isPercent = false) => {
                const displayValue = isPercent ? value.toFixed(2) + '%' : value.toFixed(2);
                const rankText = rank ? `<span class="rank">(${rank}/${total})</span>` : '';
                return `${displayValue} ${rankText}`;
            };
            row.innerHTML = `
                <td>${nameMap.get(name) || name}</td>
                <td>${formatCell(stats['Average Return (Ann. %)'], stats['Average Return (Ann. %)_rank'])}</td>
                <td>${formatCell(stats['Volatility (Ann. %)'], stats['Volatility (Ann. %)_rank'])}</td>
                <td>${formatCell(stats['Sharpe Ratio'], stats['Sharpe Ratio_rank'])}</td>
                <td>${formatCell(stats['AnnoyanceScore'], stats['AnnoyanceScore_rank'])}</td>
                <td>${formatCell(stats['CAPM Alpha (Ann. %)'], stats['CAPM Alpha (Ann. %)_rank'])}</td>
                <td>${formatCell(stats['FF4 Alpha (Ann. %)'], stats['FF4 Alpha (Ann. %)_rank'])}</td>
                <td><button class="play-btn" data-audio-src="audio_portfolios/portfolio_${name}.wav">Play</button></td>
            `;
        });
    }

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
        const r = Math.floor(Math.random() * 200), g = Math.floor(Math.random() * 200), b = Math.floor(Math.random() * 200);
        return `rgb(${r},${g},${b})`;
    }

    // --- START THE APP ---
    init();
});
