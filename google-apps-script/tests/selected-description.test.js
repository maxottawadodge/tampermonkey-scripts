// Version: 1.0.0
load('google-apps-script/library/shared-entry.gs');
load('google-apps-script/library/price-tracker.gs');
load('google-apps-script/library/inventory-scraper.gs');

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function assertThrows(fn, message) {
    try {
        fn();
    } catch (error) {
        assert(error.message.includes(message), `Unexpected error: ${error.message}`);
        return;
    }
    throw new Error(`Expected error containing: ${message}`);
}

const headers = [...INVENTORY_SCRAPER_HEADERS];
const col = name => headers.indexOf(name);
const makeRow = (id, description) => {
    const row = headers.map(() => '');
    row[col('Listing ID')] = id;
    row[col('Stock')] = `A${id}`;
    row[col('URL')] = `https://www.ottawachryslerjeepdodge.com/used/vehicle-id${id}.html`;
    row[col('Year')] = '2024';
    row[col('Make')] = 'Jeep';
    row[col('Model')] = 'Example';
    row[col('Mileage')] = '12,345';
    row[col('Price')] = '$25,000';
    row[col('Body Style')] = 'SUV';
    row[col('Description')] = description;
    return row;
};
const rows = [makeRow('123', ''), makeRow('456', 'Existing description')];
const formulas = ['', ''];
let writes = 0;
let selectedRow = 2;
let selectedCount = 1;
const sheet = {
    getSheetId: () => 7,
    getName: () => 'Inventory',
    getLastRow: () => 3,
    getLastColumn: () => headers.length,
    getRange: (row, column) => ({
        getDisplayValues: () => [row === 1 ? [...headers] : [...rows[row - 2]]],
        getRichTextValues: () => [rows[row - 2].map(() => null)],
        getFormula: () => formulas[row - 2],
        setValue: value => {
            assert(column === col('Description') + 1, 'A non-description column was changed');
            rows[row - 2][column - 1] = value;
            writes++;
        }
    })
};
const spreadsheet = {
    getId: () => 'original',
    getActiveSheet: () => sheet,
    getSheets: () => [sheet],
    getActiveRangeList: () => ({
        getRanges: () => [{ getNumRows: () => selectedCount, getRow: () => selectedRow }]
    }),
    toast: () => {}
};
globalThis.SpreadsheetApp = {
    getActiveSpreadsheet: () => spreadsheet,
    openById: () => spreadsheet,
    flush: () => {}
};
let apiKey = 'test-key';
globalThis.PropertiesService = {
    getUserProperties: () => ({ getProperty: () => apiKey })
};
const properties = {
    PRICE_TRACKER_SPREADSHEET_ID: 'original',
    PRICE_TRACKER_SHEET_ID: '7',
    INVENTORY_SALESPERSON_NAME: 'Alex',
    INVENTORY_SALESPERSON_PHONE: '555-1234'
};
let released = 0;
const context = {
    properties: { getProperty: key => properties[key] || null },
    lock: { tryLock: () => true, releaseLock: () => { released++; } }
};
let fetchedUrl;
let capturedVehicle;
let onGenerate = () => {};
let fetchError = false;
fetchInventoryVehicleDetails_ = url => {
    if (fetchError) throw new Error('Vehicle page unavailable');
    fetchedUrl = url;
    return {
        vehicleType: 'Car/Truck',
        bodyStyle: 'Other',
        exteriorColor: 'Other',
        exteriorColorLong: '',
        interiorColor: 'Other',
        interiorColorLong: '',
        fuelType: 'Gasoline',
        transmissionType: 'Automatic',
        descriptionBody: 'Heated seats.'
    };
};
generateInventoryCopy_ = vehicle => {
    capturedVehicle = vehicle;
    onGenerate();
    return { bodyStyle: 'Truck', description: 'Generated description' };
};

invoke('fillSelectedInventoryDescription', context);
assert(rows[0][col('Description')] === 'Generated description', 'Selected row was not filled');
assert(rows[1][col('Description')] === 'Existing description', 'Another row was changed');
assert(rows[0][col('Body Style')] === 'SUV' && writes === 1, 'Selected action changed more than the description');
assert(fetchedUrl === rows[0][col('URL')] && capturedVehicle.mileage === '12345', 'Selected row data was not used');
assert(capturedVehicle.descriptionBody === 'Heated seats.' && capturedVehicle.price === '25000', 'Listing details were not passed to the generator');

selectedRow = 3;
fetchedUrl = '';
assertThrows(() => invoke('fillSelectedInventoryDescription', context), 'already has a description');
assert(!fetchedUrl && writes === 1, 'Existing description triggered generation');
selectedRow = 2;
rows[0][col('Description')] = '';
formulas[0] = '=""';
assertThrows(() => invoke('fillSelectedInventoryDescription', context), 'description formula');
assert(writes === 1, 'Blank formula was overwritten');
formulas[0] = '';
properties.INVENTORY_SCRAPE_STATE = '{}';
assertThrows(() => invoke('fillSelectedInventoryDescription', context), 'Finish generating descriptions');
delete properties.INVENTORY_SCRAPE_STATE;

const validUrl = rows[0][col('URL')];
rows[0][col('URL')] = 'https://other.example/vehicle-id123.html';
assertThrows(() => invoke('fillSelectedInventoryDescription', context), 'valid Ottawa Chrysler');
rows[0][col('URL')] = validUrl;
rows[0][col('Listing ID')] = '999';
assertThrows(() => invoke('fillSelectedInventoryDescription', context), 'does not match');
rows[0][col('Listing ID')] = '123';
selectedCount = 2;
assertThrows(() => invoke('fillSelectedInventoryDescription', context), 'exactly one');
selectedCount = 1;

onGenerate = () => { rows[0][col('Description')] = 'Edited while generating'; };
assertThrows(() => invoke('fillSelectedInventoryDescription', context), 'changed while generating');
assert(rows[0][col('Description')] === 'Edited while generating' && writes === 1, 'Concurrent edit was overwritten');
rows[0][col('Description')] = '';
onGenerate = () => { properties.INVENTORY_SCRAPE_STATE = '{}'; };
assertThrows(() => invoke('fillSelectedInventoryDescription', context), 'changed while generating');
assert(!rows[0][col('Description')] && writes === 1, 'Concurrent scrape state was ignored');
delete properties.INVENTORY_SCRAPE_STATE;
onGenerate = () => { formulas[0] = '=""'; };
assertThrows(() => invoke('fillSelectedInventoryDescription', context), 'changed while generating');
assert(writes === 1, 'A concurrent formula was overwritten');
formulas[0] = '';
onGenerate = () => {};
fetchError = true;
assertThrows(() => invoke('fillSelectedInventoryDescription', context), 'Vehicle page unavailable');
assert(writes === 1, 'Description was written after the vehicle page failed');
fetchError = false;
apiKey = '';
assertThrows(() => invoke('fillSelectedInventoryDescription', context), 'Gemini API key');
apiKey = 'test-key';
properties.INVENTORY_SALESPERSON_NAME = '  ';
assertThrows(() => invoke('fillSelectedInventoryDescription', context), 'salesperson name and phone');
assert(released >= 5, 'Locks were not released after errors');
print('Selected description tests passed');
