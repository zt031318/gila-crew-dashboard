let masterGeoJSON = null; 
let currentFilteredData = [];
let viewDate = new Date(2026, 4, 1); // May 2026
let currentStyleProperty = 'org_type'; // Default starting style

const styleConfigs = {
    org_type: { 'Government': '#ff4444', 'Non-profit': '#44ff44', 'For-Profit': '#4444ff', 'Other': '#888' },
    crew_type: { 'Professional': '#e67e22', 'Volunteer': '#f1c40f', 'Corps': '#9b59b6', 'Other': '#95a5a6' },
    work_type: { 'Trail': '#2ecc71', 'Wildlife': '#e74c3c', 'Habitat': '#3498db', 'Other': '#7f8c8d' },
    status: { 'Planned': '#3498db', 'Complete': '#2ecc71', 'Canceled': '#e74c3c', 'Postponed': '#f1c40f', 'Other': '#95a5a6'}
};

const fieldTypes = {
    org_name: 'text',
    crew_name: 'text',
    work_type: 'text',
    status: 'text',
    crew_size: 'number',
    start_date: 'date',
    end_date: 'date'
};

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
    zoom: 10
});

map.on('load', () => {
    map.addSource('crew-data-source', {
        'type': 'geojson',
        'data': { "type": "FeatureCollection", "features": [] },
        'promoteId': 'fid',
        'cluster': true,
        'clusterMaxZoom': 14,
        'clusterRadius': 50
    });

    map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'crew-data-source',
        filter: ['has', 'point_count'],
        paint: {
            'circle-color': '#1abc9c',
            'circle-radius': ['step', ['get', 'point_count'], 20, 10, 30, 30, 40],
            'circle-opacity': 0.6,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#1abc9c'
        }
    });

    map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'crew-data-source',
        filter: ['has', 'point_count'],
        layout: { 'text-field': '{point_count}', 'text-size': 12 },
        paint: { "text-color": "#ffffff" }
    });

    map.addLayer({
        id: 'unclustered-point',
        type: 'circle',
        source: 'crew-data-source',
        filter: ['!', ['has', 'point_count']],
        paint: {
            'circle-radius': 8,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff'
        }
    });

    updateMapStyle('org_type');

    fetch('./crew_data.geojson')
        .then(res => res.json())
        .then(data => {
            masterGeoJSON = data;
            generateWorkTypeCheckboxes();
            applyFilters(); // This will also trigger the initial calendar render
        });
});

function applyFilters() {
    if (!masterGeoJSON) return;

    const mode = document.querySelector('input[name="filterMode"]:checked').value;
    let filteredFeatures = [];

    if (mode === 'quick') {
        const today = new Date().toISOString().split('T')[0];
        const inFieldChecked = document.getElementById('in-field-check').checked;
        const activeWorkTypes = Array.from(document.querySelectorAll('.work-type-cb:checked')).map(cb => cb.value);

        filteredFeatures = masterGeoJSON.features.filter(f => {
            const props = f.properties;
            const matchesWorkType = activeWorkTypes.includes(props.work_type);
            const matchesDate = inFieldChecked ? (props.start_date <= today && props.end_date >= today) : true;
            return matchesWorkType && matchesDate;
        });
    } else {
        const filterRows = Array.from(document.querySelectorAll('.filter-row'));
        filteredFeatures = masterGeoJSON.features.filter(f => {
            const props = f.properties;
            return filterRows.every(row => {
                const field = row.querySelector('.field-select').value;
                const op = row.querySelector('.operator-select').value;
                const val = row.querySelector('.filter-value').value;
                if (!val) return true;

                const recordVal = props[field];
                const type = fieldTypes[field];

                if (type === 'number') {
                    const nR = parseInt(recordVal), nI = parseInt(val);
                    if (op === '==') return nR === nI;
                    if (op === '>') return nR > nI;
                    if (op === '<') return nR < nI;
                } 
                if (type === 'date') {
                    if (op === '==') return recordVal === val;
                    const dR = new Date(recordVal), dI = new Date(val);
                    return op === '>' ? dR > dI : dR < dI;
                }
                if (type === 'text') {
                    const tR = String(recordVal || "").toLowerCase(), tI = val.toLowerCase();
                    return op === 'includes' ? tR.includes(tI) : tR === tI;
                }
                return true;
            });
        });
    }

    currentFilteredData = filteredFeatures;
    map.getSource('crew-data-source').setData({ type: 'FeatureCollection', features: filteredFeatures });
    renderCalendar();
}

function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    const display = document.getElementById('current-month-display');
    if (!grid || !display) return;
    
    grid.innerHTML = '';
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    display.innerText = viewDate.toLocaleString('default', { month: 'long', year: 'numeric' });

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let i = 1; i <= daysInMonth; i++) {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-day';
        dayDiv.innerHTML = `<span>${i}</span>`;
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        
        currentFilteredData.filter(f => dateStr >= f.properties.start_date && dateStr <= f.properties.end_date).forEach(f => {
            const event = document.createElement('div');
            event.className = 'crew-event';
            event.innerText = f.properties.crew_name || f.properties.org_name || "unknown Crew or Org";

            // 1. Add the data attribute so highlightOnMap can find it
            const featureId = f.properties.fid;
            event.setAttribute('data-fid', featureId);
            
            const propertyValue = f.properties[currentStyleProperty];
            const categoryConfig = styleConfigs[currentStyleProperty];
            event.style.backgroundColor = categoryConfig[propertyValue] || '#888';

            
            event.onmouseenter = () => highlightOnMap(featureId, true);
            event.onmouseleave = () => highlightOnMap('', false);
            dayDiv.appendChild(event);
        });
        grid.appendChild(dayDiv);
    }
}

function highlightOnMap(id, shouldHighlight) {
    // 1. Highlight the map point using the promoted 'fid'
    // We use ['id'] because promoteId: 'fid' was used in the source
    map.setPaintProperty('unclustered-point', 'circle-stroke-width', [
        'case',
        ['==', ['id'], id || -1], 6, 
        2
    ]);

    // 2. Highlight the calendar entries
    // We look for the data-fid attribute we will add in the render function
    document.querySelectorAll('.crew-event').forEach(el => {
        const eventId = parseInt(el.getAttribute('data-fid'));
        if (shouldHighlight && eventId === id) {
            el.classList.add('highlight');
        } else {
            el.classList.remove('highlight');
        }
    });
}

function setView(mode) {
    const area = document.getElementById('content-area');
    const calendar = document.getElementById('calendar-container');
    area.className = `view-${mode}`;
    calendar.style.display = (mode === 'map') ? 'none' : 'flex';
    setTimeout(() => map.resize(), 300);
}

function changeMonth(step) {
    viewDate.setMonth(viewDate.getMonth() + step);
    renderCalendar();
}

function toggleSidebar() {
    const container = document.getElementById('main-container');
    const btn = document.getElementById('toggle-btn');
    container.classList.toggle('collapsed');
    btn.innerHTML = container.classList.contains('collapsed') ? '▶' : '◀';
    setTimeout(() => map.resize(), 300); 
}

// Ensure popups still work
const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });

map.on('mousemove', 'unclustered-point', (e) => {
    map.getCanvas().style.cursor = 'pointer';
    const props = e.features[0].properties;
    const featureId = e.features[0].id;
    highlightOnMap(featureId, true);

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

    

    popup.setLngLat(e.features[0].geometry.coordinates)
        .setHTML(content)
        .addTo(map);
});

map.on('mouseleave', 'unclustered-point', () => {
    map.getCanvas().style.cursor = '';
    highlightOnMap('', false);
    popup.remove();
});

// Helper for UI generation
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

function updateMapStyle(prop) {
    currentStyleProperty = prop; // Update the global tracker
    const config = styleConfigs[prop];

    // Update Map
    map.setPaintProperty('unclustered-point', 'circle-color', [
        'match', 
        ['get', prop], 
        ...Object.entries(config).flat(), 
        '#ccc'
    ]);

    // Update Legend
    document.getElementById('legend-container').innerHTML = Object.entries(config).map(([label, color]) => `
        <div class="legend-item">
            <div class="legend-color" style="background:${color}"></div>
            <span>${label}</span>
        </div>
    `).join('');

    // Update Calendar (Redraw to apply new colors)
    renderCalendar();
}

function switchFilterMode(mode) {
    document.getElementById('quick-filter-ui').style.display = mode === 'quick' ? 'block' : 'none';
    document.getElementById('advanced-filter-ui').style.display = mode === 'advanced' ? 'block' : 'none';
    applyFilters();
}

function addFilterRow() {
    const container = document.getElementById('builder-container');
    const row = document.createElement('div');
    row.className = 'filter-row';
    row.innerHTML = `
        <select class="field-select" onchange="updateOperatorOptions(this)">
            ${Object.keys(fieldTypes).map(f => `<option value="${f}">${f.replace('_', ' ')}</option>`).join('')}
        </select>
        <span class="operator-container"></span>
        <input type="text" class="filter-value" placeholder="Value" oninput="applyFilters()">
        <button onclick="this.parentElement.remove(); applyFilters();">×</button>`;
    container.appendChild(row);
    updateOperatorOptions(row.querySelector('.field-select'));
}

function updateOperatorOptions(sel) {
    const type = fieldTypes[sel.value];
    const row = sel.parentElement;
    const ops = type === 'number' ? [['=', '=='], ['>', '>'], ['<', '<']] : 
                type === 'date' ? [['on', '=='], ['before', '<'], ['after', '>']] : 
                [['is', '=='], ['contains', 'includes']];
    
    row.querySelector('.operator-container').innerHTML = `
        <select class="operator-select" onchange="applyFilters()">
            ${ops.map(o => `<option value="${o[1]}">${o[0]}</option>`).join('')}
        </select>`;
    row.querySelector('.filter-value').type = type === 'date' ? 'date' : type === 'number' ? 'number' : 'text';
    applyFilters();
}