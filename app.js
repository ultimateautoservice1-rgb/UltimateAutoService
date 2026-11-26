// --- 1. CONFIGURATION ---
const CORRECT_USER = 'Olmanguerra0628';
const CORRECT_PASS = 'Olman132';
const INVOICE_COUNTER_KEY = 'lastInvoiceNumber';
const CLIENTS_STORAGE_KEY = 'clientsData';
const INITIAL_INVOICE_NUMBER = 1;
const TAX_RATE = 0.1025; // 10.25%

let itemCounter = 0;
let currentClient = null;
let editingInvoiceId = null;
let currentlyViewedInvoice = null;
let previousViewerScreen = 'client-history-screen';
let currentDocMode = 'invoice'; // 'invoice' o 'inspection'

let currentClientVehiclesMap = {};
let vehicleHistorySourceScreen = 'main-menu';

const defaultDescriptions = [
    "Select Labor Work Done...",
    "Brake system overhaul",
    "Engine diagnostic and repair",
    "Oil change labor",
    "Tire rotation and balance",
    "Wiper blades replacement labor",
    "Other (Specify below)"
];

// --- 2. DOM ELEMENTS CACHING ---
const appContainer = document.getElementById('app-container');
const loginOverlay = document.getElementById('login-overlay');
const invoiceViewer = document.getElementById('invoice-viewer');
const invoiceTemplateHtml = document.getElementById('invoice-template').outerHTML;
const screens = document.querySelectorAll('.screen');
const tableBody = document.querySelector('#itemsTable tbody');

const descriptionSelector = document.getElementById('descriptionSelector');
const customDescriptionInput = document.getElementById('customDescription');
const invoiceNumberDisplay = document.getElementById('invoiceNumberDisplay');
const totalCheckboxes = document.querySelectorAll('#invoice-content input[name="warranty"]');
const subtotalDisplay = document.getElementById('subtotal');
const taxDisplay = document.getElementById('tax');
const totalDisplay = document.getElementById('total');
const customerNameInput = document.getElementById('customer-name');
const customerPhoneInput = document.getElementById('customer-phone');
const customerLicenseInput = document.getElementById('customer-license');
const carPlateInput = document.getElementById('car-plate');
const carVinInput = document.getElementById('car-vin');

const carDetailsInputs = ['car-year', 'car-make', 'car-model', 'car-mileage', 'customer-phone', 'customer-license', 'car-plate', 'car-vin'].map(id => document.getElementById(id));
const warrantyWarranted = document.getElementById('warranty-warranted');
const warrantyNotWarranted = document.getElementById('warranty-not-warranted');

const clientListDiv = document.getElementById('client-list');
const invoiceClientListDiv = document.getElementById('invoice-client-list');
const historyListDiv = document.getElementById('history-list');
const historyClientNameHeader = document.getElementById('history-client-name');
const viewerContentArea = document.getElementById('viewer-content-area');

// --- 3. INDEXEDDB SETUP & LOCALSTORAGE MIGRATION ---
let db = null;

function initIndexedDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("UltimateAutoHauzDB", 2);

        request.onerror = function (event) {
            console.error("Error opening IndexedDB", event);
            reject(event);
        };

        request.onupgradeneeded = function (event) {
            const dbInstance = event.target.result;
            if (!dbInstance.objectStoreNames.contains("storeData")) {
                dbInstance.createObjectStore("storeData");
            }
        };

        request.onsuccess = function (event) {
            db = event.target.result;
            resolve(db);
        };
    });
}

async function loadClientsAsync() {
    if (!db) await initIndexedDB();
    return new Promise((resolve) => {
        const transaction = db.transaction(["storeData"], "readonly");
        const store = transaction.objectStore("storeData");
        const request = store.get(CLIENTS_STORAGE_KEY);

        request.onsuccess = function (event) {
            let data = event.target.result;
            if (!data) {
                try {
                    const oldData = localStorage.getItem(CLIENTS_STORAGE_KEY);
                    if (oldData) {
                        data = JSON.parse(oldData);
                        saveClientsAsync(data);
                    } else {
                        data = [];
                    }
                } catch (e) {
                    data = [];
                }
            }
            resolve(data || []);
        };

        request.onerror = function () {
            resolve([]);
        };
    });
}

async function saveClientsAsync(clients) {
    if (!db) await initIndexedDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(["storeData"], "readwrite");
        const store = transaction.objectStore("storeData");
        const request = store.put(clients, CLIENTS_STORAGE_KEY);

        request.onsuccess = () => resolve(true);
        request.onerror = (e) => reject(e);
    });
}

let cachedClients = [];
async function refreshClientsCache() {
    cachedClients = await loadClientsAsync();
}
function loadClients() {
    return cachedClients;
}
async function saveClients(clients) {
    cachedClients = clients;
    await saveClientsAsync(clients);
}

// Descargar respaldo JSON de la base de datos actual
window.exportBackupJSON = async function () {
    await refreshClientsCache();
    const backupObj = {
        exportedAt: new Date().toISOString(),
        lastInvoiceNumber: getInvoiceNumber(),
        clientsData: loadClients()
    };
    const blob = new Blob([JSON.stringify(backupObj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "respaldo-ultimate-auto-hauz.json";
    a.click();
    URL.revokeObjectURL(url);
};

// --- 4. SCREEN NAVIGATION ---
async function showScreen(screenId) {
    await refreshClientsCache();
    screens.forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');

    if (screenId === 'clients-screen') {
        renderClientList(clientListDiv, false);
    } else if (screenId === 'select-client-invoice') {
        renderClientList(invoiceClientListDiv, true);
    } else if (screenId === 'search-invoices-screen') {
        updateSearchUI();
    }
}

// --- 5. INVOICE COUNTER LOGIC ---
function getInvoiceNumber() {
    return parseInt(localStorage.getItem(INVOICE_COUNTER_KEY)) || INITIAL_INVOICE_NUMBER;
}

function incrementInvoiceNumber() {
    const currentNumber = getInvoiceNumber();
    localStorage.setItem(INVOICE_COUNTER_KEY, currentNumber + 1);
    return currentNumber;
}

function formatInvoiceNumber(num) {
    return 'INV-' + String(num).padStart(4, '0');
}

function updateInvoiceDisplay() {
    const currentInvNum = getInvoiceNumber();
    invoiceNumberDisplay.textContent = formatInvoiceNumber(currentInvNum);
}

// --- 6. CLIENT MANAGEMENT & BUSCADOR GLOBAL LOGIC ---
window.addNewClient = async function () {
    const name = prompt("Enter the new client's full name:");
    if (!name || name.trim() === "") return;

    const phone = prompt(`Enter ${name}'s phone number (optional):`);

    let clients = loadClients();
    if (clients.some(c => c.name.toLowerCase() === name.toLowerCase())) {
        alert("A client with this name already exists.");
        return;
    }

    const newClient = {
        id: Date.now(),
        name: name.trim(),
        phone: phone ? phone.trim() : 'N/A',
        invoices: []
    };

    clients.push(newClient);
    await saveClients(clients);
    renderClientList(clientListDiv, false);
    alert(`Client '${name}' added successfully!`);
};

function renderClientList(targetDiv, forInvoiceSelection = false) {
    const clients = loadClients();
    targetDiv.innerHTML = '';

    if (clients.length === 0) {
        targetDiv.innerHTML = '<p style="text-align: center; color: #777;">No clients found. Add a new one!</p>';
        return;
    }

    const searchInput = forInvoiceSelection ?
        document.getElementById('invoice-client-search') :
        document.getElementById('client-search');
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';

    const filteredClients = clients.filter(client =>
        client.name.toLowerCase().includes(searchTerm) ||
        (client.phone || '').toLowerCase().includes(searchTerm)
    );

    filteredClients.forEach(client => {
        const item = document.createElement('div');
        item.className = 'client-item';
        item.innerHTML = `<strong>${client.name}</strong> <span>(Phone: ${client.phone || 'N/A'})</span>`;

        if (forInvoiceSelection) {
            item.onclick = () => startInvoiceForClient(client.id);
        } else {
            item.onclick = () => showClientHistory(client.id);
        }
        targetDiv.appendChild(item);
    });
}

window.searchClients = () => renderClientList(clientListDiv, false);
window.searchClientsForInvoice = () => renderClientList(invoiceClientListDiv, true);

window.updateSearchUI = function () {
    const searchType = document.querySelector('input[name="searchType"]:checked').value;
    const input = document.getElementById('global-invoice-search');

    if (searchType === 'plate') {
        input.placeholder = "Ingrese No. de Placa (Ej. XYZ 123)...";
    } else {
        input.placeholder = "Ingrese No. de Factura (Ej. INV-0001 o 1)...";
    }

    input.value = '';
    document.getElementById('global-search-results').innerHTML = '<p style="text-align: center; color: #777; margin-top: 15px;">Ingrese un dato para buscar.</p>';
};

window.performGlobalSearch = function () {
    const searchTermRaw = document.getElementById('global-invoice-search').value.toLowerCase().trim();
    const searchType = document.querySelector('input[name="searchType"]:checked').value;
    const resultsDiv = document.getElementById('global-search-results');
    resultsDiv.innerHTML = '';

    if (searchTermRaw === '') {
        resultsDiv.innerHTML = '<p style="text-align: center; color: #777; margin-top: 15px;">Ingrese un dato para buscar.</p>';
        return;
    }

    const clients = loadClients();

    if (searchType === 'invoice') {
        let foundInvoices = [];
        clients.forEach(client => {
            (client.invoices || []).forEach(inv => {
                const invNumberStr = formatInvoiceNumber(inv.id).toLowerCase();
                const invIdStr = String(inv.id);
                if (invNumberStr.includes(searchTermRaw) || invIdStr.includes(searchTermRaw)) {
                    foundInvoices.push({ client: client, invoice: inv });
                }
            });
        });

        if (foundInvoices.length === 0) {
            resultsDiv.innerHTML = '<p style="text-align: center; color: #777; margin-top: 15px;">No se encontró ninguna factura con ese número.</p>';
            return;
        }

        foundInvoices.forEach(data => {
            const item = document.createElement('div');
            item.className = 'history-item';
            item.style.cursor = 'pointer';
            const carInfo = data.invoice.carDetails
                ? `${data.invoice.carDetails.year || ''} ${data.invoice.carDetails.make || ''} ${data.invoice.carDetails.model || ''}`.trim()
                : '';
            item.innerHTML = `
                <div style="display: flex; justify-content: space-between;">
                    <div>
                        <p><strong>Factura:</strong> ${formatInvoiceNumber(data.invoice.id)}</p>
                        <p><strong>Cliente:</strong> ${data.client.name}</p>
                        <p style="margin-top: 4px; font-size: 12px; color: #555;"><strong>Vehículo:</strong> ${carInfo}</p>
                        <p style="margin-top: 4px; font-size: 12px; color: #888;"><strong>Fecha y Hora:</strong> ${data.invoice.date}</p>
                    </div>
                    <div style="text-align: right; font-weight: bold; color: #28a745;">
                        ${data.invoice.totalDue || ''}
                    </div>
                </div>
            `;
            item.onclick = () => {
                currentClient = data.client;
                viewSavedInvoice(data.invoice, 'search-invoices-screen');
            };
            resultsDiv.appendChild(item);
        });
    } else {
        let foundVehicles = {};
        const cleanSearchTerm = searchTermRaw.replace(/[\s-]/g, '');

        clients.forEach(client => {
            (client.invoices || []).forEach(inv => {
                const details = inv.carDetails || {};
                const rawPlate = (details.plate || 'N/A').toUpperCase().trim();
                const cleanPlate = rawPlate.replace(/[\s-]/g, '');

                if (cleanPlate.toLowerCase().includes(cleanSearchTerm) && cleanPlate !== 'N/A' && cleanPlate !== '') {
                    if (!foundVehicles[cleanPlate]) {
                        foundVehicles[cleanPlate] = {
                            plate: rawPlate,
                            client: client,
                            carDetails: details,
                            invoices: []
                        };
                    }
                    foundVehicles[cleanPlate].invoices.push(inv);
                }
            });
        });

        const keys = Object.keys(foundVehicles);
        if (keys.length === 0) {
            resultsDiv.innerHTML = '<p style="text-align: center; color: #777; margin-top: 15px;">No se encontró ningún vehículo con esa placa.</p>';
            return;
        }

        keys.forEach(k => {
            const v = foundVehicles[k];
            const item = document.createElement('div');
            item.className = 'history-item';
            item.style.cursor = 'pointer';
            item.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <p style="font-size: 15px; font-weight: bold; color: #007bff; margin: 0 0 4px 0;">🚗 Placa: <span style="color:#d9534f;">${v.plate}</span></p>
                        <p style="margin: 0 0 3px 0; color:#333;"><strong>Vehículo:</strong> ${v.carDetails.year || ''} ${v.carDetails.make || ''} ${v.carDetails.model || ''}</p>
                        <p style="margin: 0; color: #666; font-size: 12px;"><strong>Cliente:</strong> ${v.client.name}</p>
                    </div>
                    <div style="text-align: right;">
                        <span style="background: #e8f4ff; padding: 5px 12px; border: 1px solid #007bff; border-radius: 15px; font-size: 12px; font-weight: bold; color:#007bff;">${v.invoices.length} Trabajo(s)</span>
                    </div>
                </div>
            `;
            item.onclick = () => showVehicleHistoryScreen(v, 'search-invoices-screen');
            resultsDiv.appendChild(item);
        });
    }
};

window.showVehicleHistoryScreen = function (vehicleData, sourceScreen) {
    vehicleHistorySourceScreen = sourceScreen;

    document.getElementById('vh-plate').textContent = vehicleData.plate;
    document.getElementById('vh-car').textContent = `${vehicleData.carDetails.year || ''} ${vehicleData.carDetails.make || ''} ${vehicleData.carDetails.model || ''}`.trim();
    document.getElementById('vh-vin').textContent = vehicleData.carDetails.vin || 'N/A';
    document.getElementById('vh-client').textContent = vehicleData.client.name;
    document.getElementById('vh-phone').textContent = vehicleData.client.phone !== 'N/A' ? vehicleData.client.phone : 'N/A';

    const tbody = document.querySelector('#vh-table tbody');
    tbody.innerHTML = '';

    vehicleData.invoices.forEach(inv => {
        const tr = document.createElement('tr');
        const jobsStr = (inv.items || []).map(item => `- ${item.description}`).join('<br>');

        tr.innerHTML = `
            <td style="padding: 8px; border: 1px solid #eee;">${inv.date}</td>
            <td style="padding: 8px; border: 1px solid #eee;"><strong>${formatInvoiceNumber(inv.id)}</strong></td>
            <td style="padding: 8px; border: 1px solid #eee;">${jobsStr}</td>
            <td style="padding: 8px; border: 1px solid #eee; text-align: right; color:#28a745; font-weight:bold;">${inv.totalDue || ''}</td>
            <td class="no-print" style="padding: 8px; border: 1px solid #eee; text-align: center;">
                <button onclick="viewSavedInvoiceFromVehicle(${inv.id}, ${vehicleData.client.id})" style="background:#007bff; color:white; border:none; padding: 5px 10px; border-radius:4px; cursor:pointer;">Ver</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    showScreen('vehicle-history-screen');
};

window.goBackFromVehicleHistory = function () {
    showScreen(vehicleHistorySourceScreen);
};

window.viewSavedInvoiceFromVehicle = function (invoiceId, clientId) {
    const clients = loadClients();
    const client = clients.find(c => c.id === clientId);
    if (client) {
        currentClient = client;
        const inv = (client.invoices || []).find(i => i.id === invoiceId);
        if (inv) {
            viewSavedInvoice(inv, 'vehicle-history-screen');
        }
    }
};

// --- 7. MODE & FORM LOGIC ---
function applyDocMode(mode) {
    currentDocMode = mode;
    if (mode === 'inspection') {
        document.body.classList.add('mode-inspection');
        document.querySelectorAll('.mode-invoice-only').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.mode-inspection-only').forEach(el => el.style.display = 'block');
        document.getElementById('addItemContainer').style.display = 'none';
        document.getElementById('descHeaderCol').style.width = '90%';
    } else {
        document.body.classList.remove('mode-inspection');
        document.querySelectorAll('.mode-invoice-only').forEach(el => el.style.display = '');
        document.querySelectorAll('.mode-inspection-only').forEach(el => el.style.display = 'none');
        document.getElementById('addItemContainer').style.display = 'block';
        document.getElementById('descHeaderCol').style.width = '70%';
    }
}

function resetInvoiceForm() {
    editingInvoiceId = null;
    document.getElementById('addItemForm').reset();
    customDescriptionInput.style.display = 'none';
    document.getElementById('inspectionDescInput').value = '';

    subtotalDisplay.textContent = '$0.00';
    taxDisplay.textContent = '$0.00';
    totalDisplay.textContent = '$0.00';

    tableBody.innerHTML = '';
    itemCounter = 0;

    carDetailsInputs.forEach(input => {
        input.value = '';
        input.readOnly = false;
    });

    warrantyWarranted.checked = false;
    warrantyNotWarranted.checked = false;
    warrantyWarranted.disabled = false;
    warrantyNotWarranted.disabled = false;
}

window.startNewInspection = function () {
    currentClient = null;
    resetInvoiceForm();
    applyDocMode('inspection');

    customerNameInput.readOnly = false;
    invoiceNumberDisplay.textContent = 'INS-' + String(getInvoiceNumber()).padStart(4, '0');
    document.getElementById('currentDate').textContent = new Date().toLocaleString('en-US');

    showScreen('invoice-content');
    document.getElementById('inspectionDescInput').focus();
};

window.startInvoiceForClient = function (clientId) {
    const clients = loadClients();
    currentClient = clients.find(c => c.id === clientId);

    if (!currentClient) {
        alert("Error: Client not found.");
        showScreen('main-menu');
        return;
    }

    resetInvoiceForm();
    applyDocMode('invoice');

    const invoiceNumberToDisplay = getInvoiceNumber();

    customerNameInput.value = currentClient.name;
    customerNameInput.readOnly = true;

    customerPhoneInput.value = currentClient.phone === 'N/A' ? '' : currentClient.phone;
    customerPhoneInput.readOnly = false;

    invoiceNumberDisplay.textContent = formatInvoiceNumber(invoiceNumberToDisplay);
    document.getElementById('currentDate').textContent = new Date().toLocaleString('en-US');

    const datalist = document.getElementById('plate-suggestions');
    datalist.innerHTML = '';
    currentClientVehiclesMap = {};

    (currentClient.invoices || []).forEach(inv => {
        if (inv.carDetails && inv.carDetails.plate) {
            const plateVal = inv.carDetails.plate.trim().toUpperCase();
            const cleanPlate = plateVal.replace(/[\s-]/g, '');

            if (cleanPlate !== '' && !currentClientVehiclesMap[cleanPlate]) {
                currentClientVehiclesMap[cleanPlate] = inv.carDetails;

                const option = document.createElement('option');
                option.value = plateVal;
                datalist.appendChild(option);
            }
        }
    });

    showScreen('invoice-content');
};

document.getElementById('car-plate').addEventListener('input', function () {
    const val = this.value.trim().toUpperCase().replace(/[\s-]/g, '');
    if (currentClientVehiclesMap[val]) {
        const vDetails = currentClientVehiclesMap[val];
        document.getElementById('car-year').value = vDetails.year || '';
        document.getElementById('car-make').value = vDetails.make || '';
        document.getElementById('car-model').value = vDetails.model || '';
        document.getElementById('car-vin').value = vDetails.vin || '';
    }
});

window.addInspectionRow = function () {
    const input = document.getElementById('inspectionDescInput');
    const desc = input.value.trim();
    if (!desc) {
        alert("Please enter an inspection description.");
        return;
    }
    addItem(desc, 0, false);
    input.value = '';
    input.focus();
};

window.editSavedInvoice = function () {
    if (!currentlyViewedInvoice || !currentClient) return;

    resetInvoiceForm();
    applyDocMode(currentlyViewedInvoice.docMode || 'invoice');
    editingInvoiceId = currentlyViewedInvoice.id;

    invoiceNumberDisplay.textContent = formatInvoiceNumber(editingInvoiceId);
    document.getElementById('currentDate').textContent = currentlyViewedInvoice.date;

    document.getElementById('car-year').value = currentlyViewedInvoice.carDetails.year || '';
    document.getElementById('car-make').value = currentlyViewedInvoice.carDetails.make || '';
    document.getElementById('car-model').value = currentlyViewedInvoice.carDetails.model || '';
    document.getElementById('car-mileage').value = currentlyViewedInvoice.carDetails.mileage || '';
    carPlateInput.value = currentlyViewedInvoice.carDetails.plate || '';
    carVinInput.value = currentlyViewedInvoice.carDetails.vin || '';

    customerNameInput.value = currentlyViewedInvoice.customerName || '';
    customerNameInput.readOnly = true;
    customerPhoneInput.value = currentlyViewedInvoice.customerPhone || '';
    customerPhoneInput.readOnly = false;
    customerLicenseInput.value = currentlyViewedInvoice.customerLicense || '';

    warrantyWarranted.checked = (currentlyViewedInvoice.warranty === 'Warranted');
    warrantyNotWarranted.checked = (currentlyViewedInvoice.warranty === 'Not Warranted');

    (currentlyViewedInvoice.items || []).forEach(item => {
        const costVal = parseFloat(String(item.cost || '0').replace(/[^0-9.-]+/g, "")) || 0;
        addItem(item.description, costVal, item.taxable);
    });

    showScreen('invoice-content');
};

let isSaving = false;
window.saveInvoice = async function (shouldPrint = true) {
    if (isSaving) return;

    if (tableBody.children.length === 0) {
        alert("Please add at least one item before saving.");
        return;
    }

    if (currentDocMode === 'invoice' && !currentClient) {
        alert("Please select a client from Facturación before saving an invoice.");
        return;
    }

    isSaving = true;
    const btnOnly = document.getElementById('save-only-invoice-btn');
    const btnPrint = document.getElementById('save-invoice-btn');
    btnOnly.disabled = true;
    btnPrint.disabled = true;

    try {
        const invoiceIdToSave = editingInvoiceId !== null ? editingInvoiceId : getInvoiceNumber();
        const saveDate = editingInvoiceId !== null ? document.getElementById('currentDate').textContent : new Date().toLocaleString('en-US');
        const clientNameToSave = currentClient ? currentClient.name : (customerNameInput.value.trim() || 'Inspection Client');

        const actionText = shouldPrint ? "saving, printing, and completing" : "saving";
        if (!confirm(`Confirm ${actionText} ${formatInvoiceNumber(invoiceIdToSave)} for ${clientNameToSave}?`)) {
            return;
        }

        const invoiceData = {
            id: invoiceIdToSave,
            docMode: currentDocMode,
            date: saveDate,
            customerName: clientNameToSave,
            customerPhone: customerPhoneInput.value,
            customerLicense: customerLicenseInput.value,
            carDetails: {
                year: document.getElementById('car-year').value,
                make: document.getElementById('car-make').value,
                model: document.getElementById('car-model').value,
                mileage: document.getElementById('car-mileage').value,
                plate: carPlateInput.value,
                vin: carVinInput.value
            },
            items: [],
            subtotal: currentDocMode === 'invoice' ? subtotalDisplay.textContent : '$0.00',
            tax: currentDocMode === 'invoice' ? taxDisplay.textContent : '$0.00',
            totalDue: currentDocMode === 'invoice' ? totalDisplay.textContent : 'INSPECTION',
            warranty: warrantyWarranted.checked ? 'Warranted' :
                warrantyNotWarranted.checked ? 'Not Warranted' : 'Unspecified'
        };

        tableBody.querySelectorAll('tr').forEach(row => {
            const costFloat = parseFloat(row.getAttribute('data-total')) || 0;
            const isTaxable = row.getAttribute('data-taxable') === 'true';

            invoiceData.items.push({
                description: row.children[1].textContent.replace('[TAX]', '').trim(),
                cost: formatPrice(costFloat),
                taxable: isTaxable
            });
        });

        let clients = loadClients();
        if (currentClient) {
            const clientIndex = clients.findIndex(c => c.id === currentClient.id);
            if (clientIndex !== -1) {
                clients[clientIndex].invoices = clients[clientIndex].invoices || [];
                if (editingInvoiceId !== null) {
                    const invoiceIndex = clients[clientIndex].invoices.findIndex(inv => inv.id === editingInvoiceId);
                    if (invoiceIndex !== -1) {
                        clients[clientIndex].invoices[invoiceIndex] = invoiceData;
                    } else {
                        clients[clientIndex].invoices.unshift(invoiceData);
                    }
                } else {
                    const invExists = clients[clientIndex].invoices.some(inv => inv.id === invoiceIdToSave);
                    if (!invExists) {
                        clients[clientIndex].invoices.unshift(invoiceData);
                    } else {
                        alert("Bloqueo de sistema: Se ha detectado un intento de duplicar el registro.");
                        return;
                    }
                }
                await saveClients(clients);
            }
        }

        // Guardar el recibo en la nube (Supabase -> tabla Recibos, columna datos)
        if (typeof window.guardarReciboEnSupabase === 'function') {
            const cloudResult = await window.guardarReciboEnSupabase(invoiceData);
            if (!cloudResult.ok) {
                console.warn('No se pudo guardar en Supabase:', cloudResult.error);
            }
        }

        if (shouldPrint) {
            window.printInvoicePrompt();
        }

        if (editingInvoiceId === null) {
            incrementInvoiceNumber();
        }

        alert(`Saved ${formatInvoiceNumber(invoiceIdToSave)} successfully!`);

        currentClient = null;
        editingInvoiceId = null;
        currentlyViewedInvoice = null;
        applyDocMode('invoice');
        showScreen('main-menu');
    } finally {
        isSaving = false;
        btnOnly.disabled = false;
        btnPrint.disabled = false;
    }
};

window.cancelInvoice = function () {
    if (confirm("Are you sure you want to cancel? All unsaved data will be lost.")) {
        const wasInspection = currentDocMode === 'inspection';
        currentClient = null;
        editingInvoiceId = null;
        resetInvoiceForm();
        applyDocMode('invoice');
        showScreen(wasInspection ? 'main-menu' : 'select-client-invoice');
    }
};

// --- 8. INVOICE HISTORY & VIEWER VIEW ---
window.showClientHistory = function (clientId) {
    const clients = loadClients();
    const client = clients.find(c => c.id === clientId);

    if (!client) return;
    currentClient = client;

    historyClientNameHeader.textContent = `Registros de: ${client.name}`;
    historyListDiv.innerHTML = '';

    const invoices = client.invoices || [];
    if (invoices.length === 0) {
        historyListDiv.innerHTML = '<p style="text-align: center; color: #777;">No hay trabajos registrados para este cliente.</p>';
    } else {
        let foundVehicles = {};

        invoices.forEach(inv => {
            const details = inv.carDetails || {};
            const rawPlate = (details.plate || 'N/A').toUpperCase().trim();
            const cleanPlate = rawPlate.replace(/[\s-]/g, '');

            if (cleanPlate !== '' && cleanPlate !== 'N/A') {
                if (!foundVehicles[cleanPlate]) {
                    foundVehicles[cleanPlate] = {
                        plate: rawPlate,
                        client: client,
                        carDetails: details,
                        invoices: []
                    };
                }
                foundVehicles[cleanPlate].invoices.push(inv);
            } else {
                if (!foundVehicles['SIN_PLACA']) {
                    foundVehicles['SIN_PLACA'] = {
                        plate: 'N/A',
                        client: client,
                        carDetails: details,
                        invoices: []
                    };
                }
                foundVehicles['SIN_PLACA'].invoices.push(inv);
            }
        });

        Object.keys(foundVehicles).forEach(key => {
            const v = foundVehicles[key];
            const item = document.createElement('div');
            item.className = 'history-item';
            item.style.cursor = 'pointer';
            item.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <p style="font-size: 15px; font-weight: bold; color: #007bff; margin: 0 0 4px 0;">🚗 Placa: <span style="color:#d9534f;">${v.plate}</span></p>
                        <p style="margin: 0; color:#333;"><strong>Vehículo:</strong> ${v.carDetails.year || ''} ${v.carDetails.make || ''} ${v.carDetails.model || ''}</p>
                    </div>
                    <div style="text-align: right;">
                        <span style="background: #e8f4ff; padding: 5px 12px; border: 1px solid #007bff; border-radius: 15px; font-size: 12px; font-weight: bold; color:#007bff;">${v.invoices.length} Trabajo(s)</span>
                    </div>
                </div>
            `;
            item.onclick = () => showVehicleHistoryScreen(v, 'client-history-screen');
            historyListDiv.appendChild(item);
        });
    }

    showScreen('client-history-screen');
};

window.viewSavedInvoice = function (invoice, backScreen = 'client-history-screen') {
    previousViewerScreen = backScreen;
    currentlyViewedInvoice = invoice;
    const isInspection = invoice.docMode === 'inspection';

    viewerContentArea.innerHTML = invoiceTemplateHtml;
    const target = viewerContentArea;

    target.querySelector('#invoiceNumberDisplay').textContent = formatInvoiceNumber(invoice.id);
    target.querySelector('#currentDate').textContent = invoice.date;

    const details = invoice.carDetails || {};
    target.querySelector('#car-year').value = details.year || '';
    target.querySelector('#car-make').value = details.make || '';
    target.querySelector('#car-model').value = details.model || '';
    target.querySelector('#car-mileage').value = details.mileage || '';
    target.querySelector('#car-plate').value = details.plate || '';
    target.querySelector('#car-vin').value = details.vin || '';
    target.querySelector('#customer-name').value = invoice.customerName || '';
    target.querySelector('#customer-phone').value = invoice.customerPhone || '';
    target.querySelector('#customer-license').value = invoice.customerLicense || '';

    target.querySelector('#subtotal').textContent = invoice.subtotal || '$0.00';
    target.querySelector('#tax').textContent = invoice.tax || '$0.00';
    target.querySelector('#total').textContent = invoice.totalDue || '$0.00';

    const itemsTableBody = target.querySelector('#itemsTable tbody');
    itemsTableBody.innerHTML = '';
    (invoice.items || []).forEach((item, index) => {
        const row = document.createElement('tr');
        const taxBadge = (!isInspection && item.taxable) ? ' <span style="font-size:10px; color:#007bff; font-weight:bold;">[TAX]</span>' : '';
        if (isInspection) {
            row.innerHTML = `
                <td class="text-center">${index + 1}</td>
                <td>${item.description}${taxBadge}</td>
                <td></td>
            `;
        } else {
            row.innerHTML = `
                <td class="text-center">${index + 1}</td>
                <td>${item.description}${taxBadge}</td>
                <td class="text-right">${item.cost}</td>
                <td></td>
            `;
        }
        itemsTableBody.appendChild(row);
    });

    const warrantedBox = target.querySelector('#warranty-warranted');
    const notWarrantedBox = target.querySelector('#warranty-not-warranted');
    warrantedBox.checked = (invoice.warranty === 'Warranted');
    notWarrantedBox.checked = (invoice.warranty === 'Not Warranted');

    if (isInspection) {
        target.querySelectorAll('.mode-invoice-only').forEach(el => el.style.display = 'none');
        target.querySelector('#descHeaderCol').style.width = '90%';
    } else {
        target.querySelectorAll('.mode-invoice-only').forEach(el => el.style.display = '');
        target.querySelector('#descHeaderCol').style.width = '70%';
    }

    target.querySelectorAll('input, select, button').forEach(el => {
        el.disabled = true;
        if (el.type === 'text' || el.type === 'number' || el.type === 'checkbox') {
            el.readOnly = true;
        }
    });

    if (target.querySelector('#addItemContainer')) {
        target.querySelector('#addItemContainer').style.display = 'none';
    }
    if (target.querySelector('#addInspectionContainer')) {
        target.querySelector('#addInspectionContainer').style.display = 'none';
    }

    showScreen('invoice-viewer');
};

window.goBackFromViewer = function () {
    if (previousViewerScreen === 'search-invoices-screen') {
        showScreen('search-invoices-screen');
    } else if (previousViewerScreen === 'vehicle-history-screen') {
        showScreen('vehicle-history-screen');
    } else if (currentClient && currentClient.id) {
        showClientHistory(currentClient.id);
    } else {
        showScreen('main-menu');
    }
};

// --- 9. UTILITIES ---
function formatPrice(price) {
    return price.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function calculateTotals() {
    let subtotal = 0;
    let taxableSubtotal = 0;

    tableBody.querySelectorAll('tr').forEach(row => {
        const itemTotal = parseFloat(row.getAttribute('data-total'));
        const isTaxable = row.getAttribute('data-taxable') === 'true';

        if (!isNaN(itemTotal)) {
            subtotal += itemTotal;
            if (isTaxable) {
                taxableSubtotal += itemTotal;
            }
        }
    });

    const taxAmount = taxableSubtotal * TAX_RATE;
    const totalDue = subtotal + taxAmount;

    subtotalDisplay.textContent = formatPrice(subtotal);
    taxDisplay.textContent = formatPrice(taxAmount);
    totalDisplay.textContent = formatPrice(totalDue);
}

function addItem(description, itemTotal, isTaxable = false) {
    itemCounter++;

    const newRow = document.createElement('tr');
    newRow.setAttribute('data-total', itemTotal.toFixed(2));
    newRow.setAttribute('data-taxable', isTaxable);

    const taxBadge = (currentDocMode === 'invoice' && isTaxable) ? ' <span style="font-size:10px; color:#007bff; font-weight:bold;">[TAX]</span>' : '';

    if (currentDocMode === 'inspection') {
        newRow.innerHTML = `
            <td class="text-center">${itemCounter}</td>
            <td>${description}</td>
            <td class="text-center"><span class="delete-btn" onclick="deleteItem(this)">X</span></td>
        `;
    } else {
        newRow.innerHTML = `
            <td class="text-center">${itemCounter}</td>
            <td>${description}${taxBadge}</td>
            <td class="text-right">${formatPrice(itemTotal)}</td>
            <td class="text-center"><span class="delete-btn" onclick="deleteItem(this)">X</span></td>
        `;
    }

    tableBody.appendChild(newRow);
    if (currentDocMode === 'invoice') {
        calculateTotals();
    }
}

window.deleteItem = function (button) {
    const row = button.closest('tr');
    row.remove();
    let index = 1;
    tableBody.querySelectorAll('tr').forEach(r => {
        r.children[0].textContent = index++;
    });
    if (currentDocMode === 'invoice') {
        calculateTotals();
    }
};

window.printInvoicePrompt = function () {
    window.print();
};

// --- 10. EVENT LISTENERS & INITIAL SETUP ---
function initializeApp() {
    defaultDescriptions.forEach(desc => {
        const option = document.createElement('option');
        option.value = (desc.includes("Other")) ? 'OTHER' : desc;
        option.textContent = desc;
        descriptionSelector.appendChild(option);
    });

    descriptionSelector.addEventListener('change', function () {
        if (this.value === 'OTHER') {
            customDescriptionInput.style.display = 'block';
            customDescriptionInput.required = true;
            customDescriptionInput.value = '';
            customDescriptionInput.focus();
        } else {
            customDescriptionInput.style.display = 'none';
            customDescriptionInput.required = false;
        }
    });

    totalCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', function () {
            if (this.checked) {
                totalCheckboxes.forEach(otherCheckbox => {
                    if (otherCheckbox !== this) {
                        otherCheckbox.checked = false;
                    }
                });
            }
        });
    });

    document.getElementById('addItemForm').addEventListener('submit', function (event) {
        event.preventDefault();
        const selectedDescription = descriptionSelector.value;
        const customText = customDescriptionInput.value.trim();
        const itemTotal = parseFloat(document.getElementById('itemTotal').value);
        const isTaxable = document.getElementById('isTaxableCheck').checked;

        let finalDescription = '';

        if (selectedDescription === 'OTHER') {
            if (customText === '') {
                alert("Please enter the custom labor/part description.");
                return;
            }
            finalDescription = customText;
        } else if (selectedDescription.includes("Select")) {
            alert("Please select a job or choose 'Other'.");
            return;
        } else {
            finalDescription = selectedDescription;
        }

        if (itemTotal >= 0) {
            addItem(finalDescription, itemTotal, isTaxable);
            this.reset();
            customDescriptionInput.style.display = 'none';
            customDescriptionInput.required = false;
        } else {
            alert("Total Cost cannot be negative.");
        }
    });

    // Atajos con tecla Enter
    document.getElementById('inspectionDescInput').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            addInspectionRow();
        }
    });

    document.getElementById('itemTotal').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            document.getElementById('addItemForm').requestSubmit();
        }
    });

    document.getElementById('customDescription').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            document.getElementById('addItemForm').requestSubmit();
        }
    });

    document.getElementById('currentDate').textContent = new Date().toLocaleString('en-US');
    updateInvoiceDisplay();
}

document.getElementById('login-form').addEventListener('submit', async function (event) {
    event.preventDefault();
    const user = document.getElementById('username').value;
    const pass = document.getElementById('password').value;
    const message = document.getElementById('login-message');

    if (user === CORRECT_USER && pass === CORRECT_PASS) {
        try {
            await initIndexedDB();
            await refreshClientsCache();
        } catch (e) {
            console.error("DB Init failed", e);
        }

        loginOverlay.style.display = 'none';
        appContainer.style.display = 'block';

        initializeApp();
        showScreen('main-menu');
    } else {
        message.textContent = 'Invalid username or password.';
    }
});