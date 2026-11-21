// Version: 1.0.0
load('google-apps-script/library/shared-entry.gs');
load('google-apps-script/library/price-tracker.gs');
load('google-apps-script/library/inventory-scraper.gs');

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

const headers = ['Status', 'Stock', 'URL', 'Price', 'Description'];
const rows = [
    ['Listed', 'A1', 'https://example.test/1', 10000, 'Description without a price.'],
    ['Listed', 'A2', 'https://example.test/2', 12000, 'Legacy description\nPrice: $12000 plus tax and licensing.']
];
const sheet = {
    getSheetId: () => 7,
    getName: () => 'Inventory',
    getLastRow: () => rows.length + 1,
    getLastColumn: () => headers.length,
    getRange: (row, column, count, width) => ({
        getDisplayValues: () => [headers],
        getValues: () => rows.slice(row - 2, row - 2 + count),
        setValues: values => values.forEach((value, index) => {
            rows[row - 2 + index][column - 1] = value[0];
        })
    })
};
const spreadsheet = {
    getId: () => 'original',
    getSheets: () => [sheet],
    toast: () => {}
};
globalThis.SpreadsheetApp = {
    getActiveSpreadsheet: () => spreadsheet,
    openById: () => spreadsheet,
    flush: () => {}
};
globalThis.Logger = { log: () => {} };
globalThis.Utilities = { sleep: () => {} };
fetchListingPrice_ = (url, stock) => stock === 'A1' ? 11000 : 13000;
getHistorySheet_ = () => ({
    getLastRow: () => 3,
    getRange: () => ({ setValues: () => {}, setNumberFormat: () => {} })
});

const values = {
    PRICE_TRACKER_SPREADSHEET_ID: 'original',
    PRICE_TRACKER_SCAN_PROGRESS: JSON.stringify({
        spreadsheetId: 'original',
        trackerSheetId: 7,
        headerRow: 1,
        totalRows: 2,
        nextIndex: 0,
        timestamp: '2026-01-01T00:00:00Z',
        checkedCount: 0,
        changedCount: 0,
        errorCount: 0,
        seenStocks: []
    })
};
const context = {
    properties: {
        getProperty: key => values[key] || null,
        setProperty: (key, value) => { values[key] = value; },
        deleteProperty: key => { delete values[key]; }
    },
    lock: { tryLock: () => true, releaseLock: () => {} },
    clearTriggers: () => {}
};
invoke('runPriceCheck', context);

assert(rows[0][3] === 11000, 'Price without a disclosure was not updated');
assert(rows[0][4] === 'Description without a price.', 'Description without a disclosure was changed');
assert(rows[0][0] === 'Listed, Update Price', 'A missing disclosure incorrectly triggered review');
assert(rows[1][3] === 13000 && rows[1][4].includes('Price: $13000 plus tax and licensing.'), 'Legacy disclosure was not updated');
assert(rows[1][0] === 'Listed, Update Price', 'Legacy price change status was not preserved');
print('Price scan tests passed');
