document.addEventListener("DOMContentLoaded", function() {
    // --- CONFIGURATION ---
    const MAX_SERIES = 5;
    const FIXED_LOCATION = 'developed';
    const FIXED_WEIGHTING = 'vw_cap';

    // --- GLOBAL VARIABLES ---
    let chart;
    let factorTimeSeriesData = new Map();
    let nameMap = new Map();
    let allFactorStats = [];
    const audioPlayer = new Audio();
    let currentlyPlayingButton = null;
    let currentSortKey = 'Sharpe Ratio';
    let currentSortDirection = 'desc';

    // --- DOM ELEMENTS ---
    const mainContainer = document.querySelector('main.container');
    const navLinks = document.querySelectorAll('.nav-link');
    const pageSections = document.querySelectorAll('.page-section');
    const seriesSelectorsContainer = document.getElementById('series-selectors');
    const addSeriesBtn = document.getElementById('add-series-btn');
    const plotBtn = document.getElementById('plot-btn');
    const rowTemplate = document.getElementById('series-row-template');
    const analysisTableBody = document.querySelector("#performance-table tbody");
    const topFactorsTable = document.getElementById('top-factors-table');
    const topFactorsTableBody = topFactorsTable.querySelector('tbody');

    // --- INITIALIZATION ---
    async function init() {
        try {
            const [rawDataResponse, namesResponse, statsResponse] = await Promise.all([
                fetch('data.csv'), fetch('factor_names.csv'), fetch('factor_stats.csv')
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
            
            addSeriesRow();
            renderTopFactorsTable();
            setupEventListeners();

        } catch (error) {
            console.error("Initialization failed:", error);
            alert("Error loading or processing data. Please check console for details.");
        }
    }

    function setupEventListeners() {
        navLinks.forEach(link => link.addEventListener('click', handleNavClick));
        addSeriesBtn.addEventListener('click', addSeriesRow);
        plotBtn.addEventListener('click', handlePlotting);
        topFactorsTable.querySelector('thead').addEventListener('click', handleSortClick);
        mainContainer.addEventListener('click', handleAudioPlay);
        audioPlayer.addEventListener('ended', resetAudioButton);
        audioPlayer.addEventListener('error', () => {
            alert(`Error: Could not find or play the requested audio file.`);
            resetAudioButton();
        });
    }

    function handleNavClick(event) {
        event.preventDefault();
        const targetId = event.target.dataset.target;
        pageSections.forEach(section => section.style.display = section.id === targetId ? 'block' : 'none');
        navLinks.forEach(link => link.classList.toggle('active', link.dataset.target === targetId));
    }

    function handleSortClick(event) {
        const header = event.target.closest('th');
        if (!header || !header.classList.contains('sortable-header')) return;
        const newSortKey = header.dataset.sortKey;
        if (newSortKey === currentSortKey) {
            currentSortDirection = currentSortDirection === 'desc' ? 'asc' : 'desc';
        } else {
            currentSortKey = newSortKey;
            currentSortDirection = 'desc';
        }
        renderTopFactorsTable();
    }

    function renderTopFactorsTable() {
        const sortedStats = [...allFactorStats].sort((a, b) => {
            let valA = a[currentSortKey]; let valB = b[currentSortKey];
            const direction = ['Volatility (Ann. %)', 'AnnoyanceScore'].includes(currentSortKey) ? -1 : 1;
            if (currentSortDirection === 'asc') { return (valA - valB) * direction; } 
            else { return (valB - valA) * direction; }
        });
        const top5 = sortedStats.slice(0, 5);
        const total = allFactorStats.length;
        const formatCell = (value, rank, isPercent = false) => {
            const displayValue = isPercent ? value.toFixed(2) + '%' : value.toFixed(2);
            const rankText = rank ? `<br><span class="rank">(${rank}/${total})</span>` : '';
            return `${displayValue}${rankText}`;
        };
        topFactorsTableBody.innerHTML = top5.map(stats => {
            const factorName = stats.Factor;
            const audioPath = `audio_portfolios/portfolio_${factorName}.wav`;
            return `
                <tr>
                    <td>${nameMap.get(factorName) || factorName}</td>
                    <td>${formatCell(stats['Average Return (Ann. %)'], stats['Average Return (Ann. %)_rank'])}</td>
                    <td>${formatCell(stats['Volatility (Ann. %)'], stats['Volatility (Ann. %)_rank'])}</td>
                    <td>${formatCell(stats['Sharpe Ratio'], stats['Sharpe Ratio_rank'])}</td>
                    <td>${formatCell(stats.AnnoyanceScore, stats.AnnoyanceScore_rank)}</td>
                    <td>${formatCell(stats['FF4 Alpha (Ann. %)'], stats['FF4 Alpha (Ann. %)_rank'])}</td>
                    <td><button class="play-btn" data-audio-src="${audioPath}">Play</button></td>
                </tr>
            `;
        }).join('');
        document.querySelectorAll('#top-factors-table .sortable-header').forEach(th => {
            th.classList.remove('asc', 'desc');
            if (th.dataset.sortKey === currentSortKey) { th.classList.add(currentSortDirection); }
        });
    }

    function handleAudioPlay(event) {
        const clickedButton = event.target.closest('.play-btn');
        if (!clickedButton) return;
        const audioSrc = clickedButton.dataset.audioSrc;
        if (clickedButton === currentlyPlayingButton) {
            audioPlayer.pause();
            resetAudioButton();
        } else {
            if (currentlyPlayingButton) resetAudioButton();
            audioPlayer.src = audioSrc;
            audioPlayer.play();
            clickedButton.textContent = 'Stop';
            clickedButton.classList.add('playing');
            currentlyPlayingButton = clickedButton;
        }
    }
    function resetAudioButton() {
        if (currentlyPlayingButton) {
            currentlyPlayingButton.textContent = 'Play';
            currentlyPlayingButton.classList.remove('playing');
            currentlyPlayingButton = null;
        }
    }
    function loadPrecomputedStats(csvText) {
        const parsed = Papa.parse(csvText, { header: true, dynamicTyping: true }).data;
        allFactorStats = parsed.filter(row => row.Factor); 
    }
    function handlePlotting() {
        const selectedFactors = getSelectedFactors();
        if (selectedFactors.length === 0) { alert("Please select at least one factor."); return; }
        plotChart(selectedFactors);
        updateAnalysisTable(selectedFactors);
    }
    
    // --- THIS FUNCTION CONTAINS THE PLOT FIX ---
    function plotChart(selectedFactors) {
        const allDates = new Set();
        selectedFactors.forEach(name => {
            const series = factorTimeSeriesData.get(name);
            if (series) series.forEach(d => allDates.add(d.date.getTime()));
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
            type: 'line', data: { datasets },
            options: {
                responsive: true,
                // FIX 3: MAINTAIN ASPECT RATIO
                // This forces the chart to maintain its shape as it scales.
                // A value of 1.7 is a good starting point (wider than tall).
                // It also fixes the bug of the chart not growing back.
                aspectRatio: 1.7, 
                
                interaction: { mode: 'index', intersect: false },
                scales: {
                    x: { type: 'time', time: { unit: 'year', displayFormats: { year: 'yyyy' } }, title: { display: true, text: 'Date' }, grid: { display: false }, ticks: { maxTicksLimit: 7 } },
                    y: { type: 'linear', title: { display: true, text: 'Cumulative Wealth' } }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            title: function(tooltipItems) {
                                const date = new Date(tooltipItems[0].parsed.x);
                                return new Intl.DateTimeFormat('en-GB', { year: 'numeric', month: 'long', day: 'numeric' }).format(date);
                            }
                        }
                    }
                }
            }
        });
    }

    function updateAnalysisTable(selectedFactors) {
        analysisTableBody.innerHTML = '';
        const statsMap = new Map(allFactorStats.map(s => [s.Factor, s]));
        selectedFactors.forEach(name => {
            const stats = statsMap.get(name);
            if (!stats) { console.warn(`No stats for '${name}'.`); return; }
            const row = analysisTableBody.insertRow();
            const total = allFactorStats.length;
            const formatCell = (value, rank, isPercent = false) => {
                const displayValue = isPercent ? value.toFixed(2) + '%' : value.toFixed(2);
                const rankText = rank ? `<br><span class="rank">(${rank}/${total})</span>` : '';
                return `${displayValue}${rankText}`;
            };
            row.innerHTML = `
                <td>${nameMap.get(name) || name}</td>
                <td>${formatCell(stats['Average Return (Ann. %)'], stats['Average Return (Ann. %)_rank'])}</td>
                <td>${formatCell(stats['Volatility (Ann. %)'], stats['Volatility (Ann. %)_rank'])}</td>
                <td>${formatCell(stats['Sharpe Ratio'], stats['Sharpe Ratio_rank'])}</td>
                <td>${formatCell(stats.AnnoyanceScore, stats.AnnoyanceScore_rank)}</td>
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
