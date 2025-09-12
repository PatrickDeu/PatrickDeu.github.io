document.addEventListener("DOMContentLoaded", function() {
    // --- GLOBAL VARIABLES ---
    let chart; // Will hold the chart instance
    let allData = []; // Will hold all parsed CSV data
    const maxSeries = 5; // Set max number of series
    
    // Cache DOM elements
    const seriesSelectorsContainer = document.getElementById('series-selectors');
    const addSeriesBtn = document.getElementById('add-series-btn');
    const plotBtn = document.getElementById('plot-btn');
    const rowTemplate = document.getElementById('series-row-template');

    // --- INITIALIZATION ---
    async function init() {
        // 1. Fetch and parse the CSV data
        try {
            const response = await fetch('data.csv');
            const csvText = await response.text();
            allData = Papa.parse(csvText, { header: true, dynamicTyping: true, skipEmptyLines: true }).data;
            console.log("Data loaded and parsed:", allData);

            // 2. Add the first selector row automatically
            addSeriesRow();

            // 3. Set up event listeners
            addSeriesBtn.addEventListener('click', addSeriesRow);
            plotBtn.addEventListener('click', plotChart);

        } catch (error) {
            console.error("Failed to load or parse data:", error);
            alert("Error: Could not load data.csv. Please check the console for details.");
        }
    }

    // --- CORE FUNCTIONS ---

    // Function to add a new row of dropdowns
    function addSeriesRow() {
        const currentRows = seriesSelectorsContainer.getElementsByClassName('series-row').length;
        if (currentRows >= maxSeries) {
            alert(`You can select a maximum of ${maxSeries} series.`);
            return;
        }

        // Clone the template
        const newRow = rowTemplate.cloneNode(true);
        newRow.removeAttribute('id');
        newRow.style.display = 'grid';

        // Populate its dropdowns
        populateDropdowns(newRow);

        // Add event listener for the new remove button
        newRow.querySelector('.remove-btn').addEventListener('click', () => {
            newRow.remove();
            updateAddButtonState();
        });

        seriesSelectorsContainer.appendChild(newRow);
        updateAddButtonState();
    }
    
    // Function to populate the select options based on unique values in the data
    function populateDropdowns(rowElement) {
        const unique = {
            location: [...new Set(allData.map(item => item.location))],
            name: [...new Set(allData.map(item => item.name))],
            weighting: [...new Set(allData.map(item => item.weighting))]
        };
        
        const locationSelect = rowElement.querySelector('.location-select');
        const nameSelect = rowElement.querySelector('.name-select');
        const weightingSelect = rowElement.querySelector('.weighting-select');
        
        unique.location.forEach(val => locationSelect.add(new Option(val, val)));
        unique.name.forEach(val => nameSelect.add(new Option(val, val)));
        unique.weighting.forEach(val => weightingSelect.add(new Option(val, val)));
    }
    
    // Disable or enable the "Add" button based on the count
    function updateAddButtonState() {
        const currentRows = seriesSelectorsContainer.getElementsByClassName('series-row').length;
        addSeriesBtn.disabled = currentRows >= maxSeries;
    }

    // Main function to filter data and draw the chart
    function plotChart() {
        const selectedSeriesRows = seriesSelectorsContainer.querySelectorAll('.series-row');
        if (selectedSeriesRows.length === 0) {
            alert("Please add at least one time series to plot.");
            return;
        }

        const chartDatasets = [];
        let allLabels = new Set(); // Use a Set to collect all unique dates

        selectedSeriesRows.forEach(row => {
            // Get user selections from the dropdowns in this row
            const selLocation = row.querySelector('.location-select').value;
            const selName = row.querySelector('.name-select').value;
            const selWeighting = row.querySelector('.weighting-select').value;

            // Filter the master data to find the matching time series
            let seriesData = allData
                .filter(d => d.location === selLocation && d.name === selName && d.weighting === selWeighting)
                .sort((a, b) => new Date(a.date) - new Date(b.date)); // Ensure data is sorted by date

            if (seriesData.length > 0) {
                // Calculate cumulative returns (growth of $1)
                let cumulativeReturn = 1;
                const cumulativeData = seriesData.map(d => {
                    cumulativeReturn *= (1 + d.ret);
                    return cumulativeReturn;
                });
                
                const dates = seriesData.map(d => d.date);
                dates.forEach(date => allLabels.add(date)); // Add dates to the master set

                // Prepare the dataset for Chart.js
                const seriesLabel = `${selLocation} - ${selName} (${selWeighting})`;
                chartDatasets.push({
                    label: seriesLabel,
                    data: cumulativeData,
                    borderColor: getRandomColor(),
                    fill: false,
                    tension: 0.1,
                    pointRadius: 0 // Hide points for a cleaner line
                });
            }
        });
        
        // Destroy previous chart instance if it exists
        if (chart) {
            chart.destroy();
        }

        // Create the new chart
        const ctx = document.getElementById('myChart').getContext('2d');
        chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: Array.from(allLabels).sort((a, b) => new Date(a) - new Date(b)), // Sort all dates chronologically
                datasets: chartDatasets
            },
            options: {
                responsive: true,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                scales: {
                    y: {
                        type: 'logarithmic', // Log scale is best for long-term growth charts
                        title: { display: true, text: 'Growth of $1 (Log Scale)' }
                    },
                    x: {
                        title: { display: true, text: 'Date' }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    label += context.parsed.y.toFixed(2);
                                }
                                return label;
                            }
                        }
                    }
                }
            }
        });
    }
    
    // Helper function to generate random colors for the lines
    function getRandomColor() {
        const letters = '0123456789ABCDEF';
        let color = '#';
        for (let i = 0; i < 6; i++) {
            color += letters[Math.floor(Math.random() * 16)];
        }
        return color;
    }

    // Start the application
    init();
});
