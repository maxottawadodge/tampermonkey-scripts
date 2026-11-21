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

function makeProperties(initial = {}) {
    const values = { ...initial };
    return {
        getProperty: key => values[key] || null,
        setProperty: (key, value) => { values[key] = value; },
        setProperties: entries => Object.assign(values, entries),
        deleteProperty: key => { delete values[key]; }
    };
}

const userProperties = makeProperties({ INVENTORY_SCRAPER_GEMINI_API_KEY: 'test-key' });
const userServices = { getUserProperties: () => userProperties };
globalThis.PropertiesService = userServices;
globalThis.Logger = { log: () => {} };
globalThis.Utilities = { sleep: () => {} };

const sheet = {
    getSheetId: () => 7,
    getName: () => 'Inventory',
    getLastRow: () => 1,
    getLastColumn: () => 3,
    getRange: () => ({ getDisplayValues: () => [['Stock', 'URL', 'Price']] })
};
const spreadsheets = {
    original: { getId: () => 'original', getActiveSheet: () => sheet, getSheets: () => [sheet], toast: () => {} },
    copy: { getId: () => 'copy', getActiveSheet: () => sheet, getSheets: () => [sheet], toast: () => {} }
};
let activeSpreadsheet = spreadsheets.original;
const menu = {
    addItem() { return this; },
    addSeparator() { return this; },
    addToUi() {}
};
globalThis.SpreadsheetApp = {
    getActiveSpreadsheet: () => activeSpreadsheet,
    openById: id => spreadsheets[id],
    getUi: () => ({ createMenu: () => menu, alert: () => {} })
};

let prompt;
globalThis.UrlFetchApp = {
    fetch: (url, options) => {
        prompt = JSON.parse(options.payload).contents[0].parts[0].text;
        return {
            getResponseCode: () => 200,
            getContentText: () => JSON.stringify({
                candidates: [{ content: { parts: [{ text: JSON.stringify({
                    bodyStyle: 'SUV',
                    description: 'A practical vehicle.\n- Four doors'
                }) }] } }]
            })
        };
    }
};

function makeContext(properties) {
    const cleared = [];
    return {
        properties,
        cleared,
        lock: { tryLock: () => true, releaseLock: () => {} },
        triggerNames: () => [],
        clearTriggers: handler => cleared.push(handler),
        installDailyTriggers: () => {},
        scheduleContinuation: () => {},
        showDialog: () => {}
    };
}

const originalProperties = makeProperties({ PRICE_TRACKER_SPREADSHEET_ID: 'original' });
const copyProperties = makeProperties({ PRICE_TRACKER_SPREADSHEET_ID: 'copy' });
const original = makeContext(originalProperties);
const copy = makeContext(copyProperties);

assertThrows(() => invoke('saveSalespersonSettings', original, [{ name: ' ', phone: '123' }]), 'name and phone');
invoke('saveSalespersonSettings', original, [{ name: ' Alex ', phone: ' 555-1234 ', personality: 'friendly and concise' }]);
invoke('saveSalespersonSettings', copy, [{ name: 'Sam', phone: '555-5678', personality: '' }]);
assert(originalProperties.getProperty('INVENTORY_SALESPERSON_NAME') === 'Alex', 'Original settings were not saved');
assert(copyProperties.getProperty('INVENTORY_SALESPERSON_NAME') === 'Sam', 'Copy settings were not isolated');

const vehicle = { year: '2024', make: 'Jeep', model: 'Example', bodyStyle: 'SUV', price: '25000', stock: 'A1' };
invoke('setSalespersonSettings', original);
const generated = generateInventoryCopy_(vehicle);
assert(prompt.includes('friendly and concise'), 'Personality was omitted from the Gemini prompt');
assert(prompt.includes('do not override the factual or formatting rules'), 'Personality must not override factual rules');
assert(generated.description.includes('Call or text: 555-1234'), 'Phone number missing from description');
assert(generated.description.includes('Ask for Alex'), 'Salesperson name missing from description');
invoke('setSalespersonSettings', copy);
const copyDescription = generateInventoryCopy_(vehicle).description;
assert(copyDescription.includes('Ask for Sam') && !copyDescription.includes('555-1234'), 'Copy used another salesperson');
assert(!prompt.includes('Salesperson writing style preference:'), 'Blank personality should not add a preference');

originalProperties.setProperty('PRICE_TRACKER_SHEET_ID', '7');
originalProperties.setProperty('INVENTORY_SCRAPE_SEARCH_URL', 'https://www.ottawachryslerjeepdodge.com/inventory.html');
sheet.getLastColumn = () => INVENTORY_SCRAPER_HEADERS.length;
sheet.getRange = () => ({ getDisplayValues: () => [INVENTORY_SCRAPER_HEADERS] });
let searchFetched = false;
globalThis.UrlFetchApp.fetch = () => {
    searchFetched = true;
    return { getResponseCode: () => 200, getContentText: () => '' };
};
invoke('startInventoryScrape', original);
assert(searchFetched, 'Manual inventory scrape did not use the saved search URL');

const staleProperties = makeProperties({
    PRICE_TRACKER_SPREADSHEET_ID: 'original',
    PRICE_TRACKER_SCAN_PROGRESS: JSON.stringify({ spreadsheetId: 'original' }),
    INVENTORY_SCRAPE_STATE: JSON.stringify({ spreadsheetId: 'original' })
});
const staleCopy = makeContext(staleProperties);
activeSpreadsheet = spreadsheets.copy;
assertThrows(() => invoke('runPriceCheck', staleCopy), 'another spreadsheet');
assertThrows(() => invoke('continueInventoryScrape', staleCopy), 'another spreadsheet');
invoke('setPriceTrackerSheet', staleCopy);
assert(staleProperties.getProperty('PRICE_TRACKER_SPREADSHEET_ID') === 'copy', 'Copy tracker was not configured');
assert(!staleProperties.getProperty('PRICE_TRACKER_SCAN_PROGRESS'), 'Old price progress was not cleared');
assert(!staleProperties.getProperty('INVENTORY_SCRAPE_STATE'), 'Old inventory progress was not cleared');
assert(staleCopy.cleared.includes('continuePriceCheck') && staleCopy.cleared.includes('continueInventoryScrape'), 'Old continuation triggers were not cleared');
assert(originalProperties.getProperty('PRICE_TRACKER_SPREADSHEET_ID') === 'original', 'Original tracker was changed');

let captured;
let triggers = [{ getHandlerFunction: () => 'old' }];
let installedHour;
let continuationDelay;
globalThis.InventoryTracker = { invoke: (action, context, args) => { captured = { action, context, args }; } };
globalThis.PropertiesService.getScriptProperties = () => copyProperties;
globalThis.LockService = { getScriptLock: () => copy.lock };
globalThis.Session = { getScriptTimeZone: () => 'America/Toronto' };
globalThis.ScriptApp = {
    getProjectTriggers: () => triggers,
    deleteTrigger: trigger => { triggers = triggers.filter(item => item !== trigger); },
    newTrigger: handler => ({
        timeBased() { return this; },
        everyDays() { return this; },
        atHour(hour) { installedHour = hour; return this; },
        inTimezone() { return this; },
        after(delay) { continuationDelay = delay; return this; },
        create() { triggers.push({ getHandlerFunction: () => handler }); }
    })
};
const bound = new Function(readFile('google-apps-script/bound-script.gs') +
    '; return { saveSalespersonSettings, runScheduledInventoryScrape };')();
bound.saveSalespersonSettings({ name: 'Sam' });
assert(captured.action === 'saveSalespersonSettings' && captured.args[0].name === 'Sam', 'Bound settings wrapper did not forward arguments');
assert(captured.context.properties === copyProperties && captured.context.lock === copy.lock, 'Bound wrapper did not pass its own resources');
captured.context.clearTriggers('old');
captured.context.installDailyTriggers('daily', [8]);
captured.context.scheduleContinuation('continue', 60000);
assert(installedHour === 8 && continuationDelay === 60000, 'Bound trigger scheduling failed');
assert(captured.context.triggerNames().join(',') === 'daily,continue', 'Bound triggers were not isolated');
bound.runScheduledInventoryScrape();
assert(captured.action === 'runScheduledInventoryScrape', 'Scheduled wrapper did not call the library');

print('Shared library tests passed');
