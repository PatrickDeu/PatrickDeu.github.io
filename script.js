document.addEventListener("DOMContentLoaded", function() {
    // --- CONFIGURATION ---
    const maxSeries = 5;
    const FIXED_LOCATION = 'Developed Markets';
    const FIXED_WEIGHTING = 'Capped Value Weighted';

    // --- GLOBAL VARIABLES ---
    let chart;
    let filteredData = []; // Will hold the pre-filtered data
    let uniqueFactorNames = []; // Will hold the list of factors for dropdowns
    
    // --- CACHE DOM ELEMENTS ---
    const seriesSelectorsContainer = document.getElementById('series-selectors');
    const addSeriesBtn = document.getElementById('add-series-btn');
    const plotBtn = document.getElementById('plot-btn');
    const rowTemplate = document.getElementById('series-row-template');

    // --- INITIALIZATION ---
    async function init() {
        try {
            const response = await fetch('data.csv');
            const csvText = await response.text();
            const allData = Papa.parse(csvText, { header: true, dynamicTyping: true, skipEmptyLines: true }).data;
            
            // ** CRITICAL STEP: Pre-filter the data **
            filteredData = allData.filter(d => d.location === FIXED_LOCATION && d.weighting === FIXED_WEIGHTING);
            
            if (filteredData.length === 0) {
                alert(`Error: No data found for the fixed settings (Location: ${FIXED_LOCATION}, Weighting: ${FIXED_WEIGHTING}). Please check your data.csv file.`);
                return;
            }

            // Get unique factor names from the pre-filtered data
            uniqueFactorNames = [...new Set(filteredData.map(item => item.name))].sort();
            
            console.log(`Loaded and pre-filtered data. Found ${uniqueFactorNames.length} unique factors.`);

            addSeriesRow(); // Add the first selector row
            
            // --- EVENT LISTENERS ---
            addSeriesBtn.addEventListener('click', addSeriesRow);
            plotBtn.addEventListener('click', plotChart);

        } catch (error) {
            console.error("Failed to load or parse data.csv:", error);
            alert("Error: Could not load data.csv. See console for details.");
        }
    }

    // --- UI FUNCTIONS ---
    function addSeriesRow() {
        const currentRows = seriesSelectorsContainer.getElementsByClassName('series-row').length;
        if (currentRows >= maxSeries) {
            alert(`You can select a maximum of ${maxSeries} series.`);
            return;
        }

        const newRow = rowTemplate.cloneNode(true);
        newRow.removeAttribute('id');
        newRow.style.display = 'grid';

        populateFactorDropdown(newRow.querySelector('.factor-select'));

        newRow.querySelector('.remove-btn').addEventListener('click', () => {
            newRow.remove();
            updateAddButtonState();
        });

        seriesSelectorsContainer.appendChild(newRow);
        updateAddButtonState();
    }
    
    function populateFactorDropdown(selectElement) {
        uniqueFactorNames.forEach(name => {
            selectElement.add(new Option(name, name));
        });
    }
    
    function updateAddButtonState() {
        const currentRows = seriesSelectorsContainer.getElementsByClassName('series-row').length;
        addSeriesBtn.disabled = currentRows >= maxSeries;
    }

    // --- CHARTING FUNCTION ---
    function plotChart() {
        const selectedSeriesRows = seriesSelectorsContainer.querySelectorAll('.series-row');
        if (selectedSeriesRows.length === 0) {
            alert("Please add at least one factor to plot.");
            return;
        }

        const chartDatasets = [];
        const allDates = new Set();

        selectedSeriesRows.forEach(row => {
            const selectedFactorName = row.querySelector('.factor-select').value;
            
            // Filter the already-filtered data for the chosen factor name
            const seriesData = filteredData
                .filter(d => d.name === selectedFactorName)
                .sort((a, b) => new Date(a.date) - new Date(b.date));

            if (seriesData.length > 0) {
                let cumulativeReturn = 1;
                const plotPoints = seriesData.map(d => {
                    allDates.add(d.date);
                    cumulativeReturn *= (1 + d.ret);
                    return { x: d.date, y: cumulativeReturn };
                });

                chartDatasets.push({
                    label: selectedFactorName,
                    data: plotPoints,
                    borderColor: getRandomColor(),
                    fill: false,
                    tension: 0.1,
                    pointRadius: 0
                });
            }
        });
        
        if (chart) chart.destroy();

        const ctx = document.getElementById('factorChart').getContext('2d');
        chart = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: chartDatasets
            },
            options: {
                responsive: true,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    x: {
                        type: 'time',
                        time: { unit: 'year' },
                        title: { display: true, text: 'Date' }
                    },
                    y: {
                        type: 'logarithmic',
                        title: { display: true, text: 'Growth of $1 (Log Scale)' }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)}`
                        }
                    }
                }
            }
        });
    }
    
    function getRandomColor() {
        const r = Math.floor(Math.random() * 200);
        const g = Math.floor(Math.random() * 200);
        const b = Math.floor(Math.random() * 200);
        return `rgb(${r}, ${g}, ${b})`;
    }

    // Start the application
    init();
});
