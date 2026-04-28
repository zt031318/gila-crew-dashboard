let masterGeoJSON = null; // This is global to this file

// 1. STYLE CONFIGURATIONS
const styleConfigs = {
    org_type: { 'Government': '#ff4444', 'Non-profit': '#44ff44', 'For-Profit': '#4444ff', 'Other': '#888' },
    crew_type: { 'Professional': '#e67e22', 'Volunteer': '#f1c40f', 'Corps': '#9b59b6', 'Other': '#95a5a6' },
    work_type: { 'Trail': '#2ecc71', 'Wildlife': '#e74c3c', 'Habitat': '#3498db', 'Other': '#7f8c8d' },
    status: { 'Planned': '#3498db', 'Complete': '#2ecc71', 'Canceled': '#e74c3c', 'Postponed': '#f1c40f', 'Other': '#95a5a6'}
};

const bounds = [
  [-109.11, 32.32], // Southwest coordinates (lng, lat)
  [-107.28, 34.59]  // Northeast coordinates (lng, lat)
];

// 2. INITIALIZE MAP
const map = new maplibregl.Map({
    container: 'map',
    style: {
        "version": 8,
        "sources": {
            "topo": {
                "type": "raster",
                "tiles": ["https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}"],
                "tileSize": 256
            }
        },
        "layers": [{"id": "topo-layer", "type": "raster", "source": "topo"}]
    },
    center: [-108.27, 32.77],
    zoom: 10,
    maxBounds: bounds // Constrains the map to these coordinates
});

map.on('load', () => {
    // 1. Setup the empty source first
    map.addSource('crew-data-source', {
        'type': 'geojson',
        'data': { "type": "FeatureCollection", "features": [] }, // Start empty
        'cluster': true,
        'clusterMaxZoom': 14,
        'clusterRadius': 50
    });


    // 1. The Cluster Circles
    map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'crew-data-source',
        filter: ['all',['has', 'point_count']],
        paint: {
            'circle-color': '#1abc9c',
            'circle-radius': ['step', ['get', 'point_count'], 20, 10, 30, 30, 40],
            'circle-opacity': 0.6,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#1abc9c'
        }
    });

    // 2. The Cluster Count Text
    map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'crew-data-source',
        filter: ['all',['has', 'point_count']],
        layout: {
            'text-field': '{point_count}',
            'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
            'text-size': 12
        },
        paint: { "text-color": "#ffffff" }
    });

    // 3. The Individual Points (Unclustered)
    map.addLayer({
        'id': 'unclustered-point',
        'type': 'circle',
        'source': 'crew-data-source',
        'filter': ['all',['!', ['has', 'point_count']]],
        paint: {
            'circle-radius': 8,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff'
        }
    });

    // Initial styling setup
    updateMapStyle('org_type');

    console.log("Unclustered Filter: ", map.getFilter('unclustered-point'))
    console.log("Clustered Filter: ", map.getFilter('clusters'))

    fetch('./crew_data.geojson')
        .then(res => res.json())
        .then(data => {
            masterGeoJSON = data; // Save the "Master" copy for later filtering
            
            // Push the initial data to the map
            map.getSource('crew-data-source').setData(masterGeoJSON);
            
            // Now that data exists, generate your UI
            generateWorkTypeCheckboxes();
        })
        .catch(err => console.error("Error loading GeoJSON:", err));


});

// 3. LEGEND & STYLING LOGIC
function updateMapStyle(property) {
    const config = styleConfigs[property];
    if (!config) return;

    // Update Map
    map.setPaintProperty('unclustered-point', 'circle-color', [
        'match', ['get', property],
        ...Object.entries(config).flat(),
        '#cccccc'
    ]);

    // Update Legend
    const container = document.getElementById('legend-container');
    container.innerHTML = Object.entries(config).map(([label, color]) => `
        <div class="legend-item">
            <div class="legend-color" style="background:${color}"></div>
            <span>${label}</span>
        </div>
    `).join('');
}

// 4. FILTER ENGINE
function applyFilters() {
    if (!masterGeoJSON) return;

    const today = new Date().toISOString().split('T')[0];
    const inFieldChecked = document.getElementById('in-field-check').checked;
    const activeWorkTypes = Array.from(document.querySelectorAll('.work-type-cb:checked'))
                                 .map(cb => cb.value);

    // Create a filtered copy of the features
    const filteredFeatures = masterGeoJSON.features.filter(f => {
        const props = f.properties;

        // 1. Check Work Type
        const matchesWorkType = activeWorkTypes.includes(props.work_type);

        // 2. Check Date (if box is checked)
        let matchesDate = true;
        if (inFieldChecked) {
            matchesDate = (props.start_date <= today && props.end_date >= today);
        }

        return matchesWorkType && matchesDate;
    });

    // 3. PUSH TO MAP
    // This forces MapLibre to re-cluster from ONLY these points
    map.getSource('crew-data-source').setData({
        type: 'FeatureCollection',
        features: filteredFeatures
    });
}

// 5. UI HELPERS
function generateWorkTypeCheckboxes() {
    const container = document.getElementById('work-type-checkboxes');
    const types = ['Trail', 'Wildlife', 'Habitat', 'Other'];
    container.innerHTML = types.map(t => `
        <div class="quick-filter">
            <input type="checkbox" class="work-type-cb" value="${t}" checked onchange="applyFilters()">
            <label>${t}</label>
        </div>
    `).join('');
}

function toggleAllWorkTypes(checked) {
    document.querySelectorAll('.work-type-cb').forEach(cb => cb.checked = checked);
    applyFilters();
}

function addFilterRow() {
    const container = document.getElementById('builder-container');
    const row = document.createElement('div');
    row.className = 'filter-row';
    row.innerHTML = `
        <select><option>AND</option><option>OR</option></select>
        <select><option value="crew_size">Crew Size</option></select>
        <input type="text" placeholder="Val" oninput="applyFilters()">
        <button onclick="this.parentElement.remove(); applyFilters();">×</button>
    `;
    container.appendChild(row);
}

//Popup Logic
// Initialize a single popup instance
const popup = new maplibregl.Popup({
    closeButton: false,
    closeOnClick: false
});

// Listen for mouse movement over the unclustered points
map.on('mousemove', 'unclustered-point', (e) => {
    map.getCanvas().style.cursor = 'pointer';

    const coordinates = e.features[0].geometry.coordinates.slice();
    const props = e.features[0].properties;

    // Check if a logo exists, otherwise use a transparent spacer or a generic icon
    const logoHtml = props.crew_logo 
        ? `<img src="./images/crew_logos/${props.crew_logo}" class="popup-logo" alt="logo">` 
        : '';

    // Build the HTML content using your GeoJSON field names
    const content = `
        <div class="hover-popup">
            <div class="popup-header">
                ${logoHtml}
                <strong style="color:#1abc9c">${props.org_name || 'Project'}</strong>
            </div>
            <hr class="popup-divider">
            <b>Crew:</b> ${props.crew_name || 'N/A'}<br>
            <b>Work:</b> ${props.work_type}<br>
            <b>Status:</b> ${props.status}<br>
            <b>Work Dates:</b> ${props.start_date} thru ${props.end_date}<br>
            <b>Work Description:</b> ${props.work_description}
        </div>
    `;
    // Handle map wrap-around
    while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
        coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
    }

    popup.setLngLat(coordinates).setHTML(content).addTo(map);
});

// Remove popup when mouse leaves
map.on('mouseleave', 'unclustered-point', () => {
    map.getCanvas().style.cursor = '';
    popup.remove();
});

// OPTIONAL: Zoom in when clicking a cluster
map.on('click', 'clusters', (e) => {
    const features = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
    const clusterId = features[0].properties.cluster_id;
    map.getSource('crew-data-source').getClusterExpansionZoom(clusterId, (err, zoom) => {
        if (err) return;
        map.easeTo({
            center: features[0].geometry.coordinates,
            zoom: zoom
        });
    });
});