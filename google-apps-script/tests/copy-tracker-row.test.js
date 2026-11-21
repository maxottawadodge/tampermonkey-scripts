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

function parseTsv(text) {
    const values = [];
    let value = '';
    let quoted = false;
    for (let index = 0; index < text.length; index++) {
        const char = text[index];
        if (char === '"') {
            if (quoted && text[index + 1] === '"') {
                value += '"';
                index++;
            } else quoted = !quoted;
        } else if (char === '\t' && !quoted) {
            values.push(value);
            value = '';
        } else value += char;
    }
    values.push(value);
    return values;
}

const headers = [...INVENTORY_SCRAPER_HEADERS];
const values = headers.map(() => '');
values[headers.indexOf('Stock')] = 'A1';
values[headers.indexOf('URL')] = 'Vehicle link';
values[headers.indexOf('Listed On')] = 'Listing link';
values[headers.indexOf('Price')] = '$40,000';
values[headers.indexOf('Listing ID')] = 'LIST-1';
values[headers.indexOf('Description')] =
    'Comfortable "vehicle"\n.\nFor more information or to schedule a test drive, contact us at:\nAsk for Alex';
let selection = [{ getNumRows: () => 1, getRow: () => 2 }];
const sheet = {
    getSheetId: () => 7,
    getName: () => 'Inventory',
    getLastRow: () => 2,
    getLastColumn: () => headers.length,
    getRange: row => ({
        getDisplayValues: () => [row === 1 ? [...headers] : [...values]],
        getRichTextValues: () => [values.map((value, index) => ({
            getLinkUrl: () => index === headers.indexOf('URL') ? 'https://example.test/vehicle' :
                index === headers.indexOf('Listed On') ? 'https://example.test/listing' : null
        }))]
    })
};
const spreadsheet = {
    getId: () => 'original',
    getActiveSheet: () => sheet,
    getSheets: () => [sheet],
    getActiveRangeList: () => ({ getRanges: () => selection })
};
globalThis.SpreadsheetApp = {
    getActiveSpreadsheet: () => spreadsheet,
    openById: () => spreadsheet
};
const properties = {
    PRICE_TRACKER_SPREADSHEET_ID: 'original',
    PRICE_TRACKER_SHEET_ID: '7',
    INVENTORY_SALESPERSON_NAME: 'Alex',
    INVENTORY_SALESPERSON_PHONE: '555-1234'
};
let reference;
const context = {
    properties: { getProperty: key => properties[key] || null },
    showDialog: (file, data) => {
        assert(file === 'copy-tracker-row', 'Wrong dialog opened');
        reference = data;
    }
};

invoke('showCopyTrackerRow', context);
values[headers.indexOf('Price')] = '$42,900';
const originalDescription = values[headers.indexOf('Description')];
const copiedText = invoke('getCopyTrackerRow', context, [reference]);
const copied = parseTsv(copiedText);
assert(copied.length === headers.length, 'Copied row lost columns');
assert(copied[headers.indexOf('Price')] === '$42,900', 'Copy did not read the latest sheet price');
assert(copied[headers.indexOf('Description')].includes('Price: $42900 plus tax and licensing.'), 'Copy omitted the disclosure');
assert(copied[headers.indexOf('Description')].includes('Comfortable "vehicle"\n'), 'Copy did not preserve multiline quoted text');
assert(copied[headers.indexOf('URL')] === 'https://example.test/vehicle', 'Copied row lost the vehicle hyperlink');
assert(copied[headers.indexOf('Listed On')] === 'https://example.test/listing', 'Copied row lost the listing hyperlink');
assert(values[headers.indexOf('Description')] === originalDescription, 'Copy changed the sheet description');
globalThis.document = { readyState: 'loading', addEventListener: () => {} };
for (const path of [
    'development/!DEV-marketplace-autofill.user.js',
    'development/!DEV-kijiji-autofill.user.js'
]) {
    const source = readFile(path).replace(/\}\)\(\);\s*$/, 'globalThis.copyRowParser = getVehicleFromClipboard;\n})();');
    new Function(source)();
    const vehicle = globalThis.copyRowParser(copiedText);
    assert(vehicle.price === '42900', `${path} did not read the copied price`);
    assert(vehicle.description.includes('Price: $42900 plus tax and licensing.'), `${path} did not read the disclosure`);
}

values[headers.indexOf('Description')] = 'Legacy\nPrice: $10000 plus tax and licensing.';
const legacy = parseTsv(invoke('getCopyTrackerRow', context, [reference]))[headers.indexOf('Description')];
assert(legacy.includes('Price: $42900 plus tax and licensing.') && !legacy.includes('$10000'), 'Legacy disclosure was not refreshed');
values[headers.indexOf('Description')] = 'Custom\nPrice: $10000';
assertThrows(() => invoke('getCopyTrackerRow', context, [reference]), 'unrecognized');
values[headers.indexOf('Description')] = originalDescription;
values[headers.indexOf('Price')] = '';
assertThrows(() => invoke('getCopyTrackerRow', context, [reference]), 'valid price');
values[headers.indexOf('Price')] = '$42,900';
values[headers.indexOf('Description')] = '';
assertThrows(() => invoke('getCopyTrackerRow', context, [reference]), 'no description');
values[headers.indexOf('Description')] = originalDescription;
values[headers.indexOf('Listing ID')] = 'LIST-2';
assertThrows(() => invoke('getCopyTrackerRow', context, [reference]), 'row changed');
values[headers.indexOf('Listing ID')] = 'LIST-1';
selection = [{ getNumRows: () => 2, getRow: () => 2 }];
assertThrows(() => invoke('showCopyTrackerRow', context), 'exactly one');
selection = [{ getNumRows: () => 1, getRow: () => 1 }];
assertThrows(() => invoke('showCopyTrackerRow', context), 'below the tracker headers');
delete properties.INVENTORY_SALESPERSON_PHONE;
assertThrows(() => invoke('getCopyTrackerRow', context, [reference]), 'salesperson name and phone');
print('Copy tracker row tests passed');
