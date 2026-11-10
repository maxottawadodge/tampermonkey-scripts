// Version: 1.1.5
const PRICE_TRACKER_CONFIG = Object.freeze({
    historySheetName: 'Price History',
    trackerSheetIdProperty: 'PRICE_TRACKER_SHEET_ID',
    spreadsheetIdProperty: 'PRICE_TRACKER_SPREADSHEET_ID',
    scheduleEnabledProperty: 'PRICE_TRACKER_SCHEDULE_ENABLED',
    progressProperty: 'PRICE_TRACKER_SCAN_PROGRESS',
    dailyHandler: 'runPriceCheck',
    continuationHandler: 'continuePriceCheck',
    scanHours: [8, 10, 12, 14, 16, 18, 20],
    maxRunMillis: 4 * 60 * 1000,
    continuationDelayMillis: 60 * 1000,
    progressUpdateInterval: 5,
    historyHeaders: [
        'Timestamp',
        'Stock',
        'Vehicle',
        'Previous Price',
        'Current Price',
        'URL',
        'Change Type'
    ]
});

function onOpen() {
    const scriptProperties = PropertiesService.getScriptProperties();
    const userProperties = PropertiesService.getUserProperties();
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const activeSheet = spreadsheet.getActiveSheet();
    const trackerTabIsSet =
        scriptProperties.getProperty(PRICE_TRACKER_CONFIG.spreadsheetIdProperty) === spreadsheet.getId() &&
        scriptProperties.getProperty(PRICE_TRACKER_CONFIG.trackerSheetIdProperty) === String(activeSheet.getSheetId());
    let priceScansAreEnabled = scriptProperties.getProperty(
        PRICE_TRACKER_CONFIG.scheduleEnabledProperty
    ) === 'true';
    let inventoryScansAreEnabled = scriptProperties.getProperty(
        INVENTORY_SCRAPER_CONFIG.scheduleEnabledProperty
    ) === 'true';
    try {
        const triggers = ScriptApp.getProjectTriggers();
        priceScansAreEnabled = triggers.filter(trigger =>
            trigger.getHandlerFunction() === PRICE_TRACKER_CONFIG.dailyHandler
        ).length >= PRICE_TRACKER_CONFIG.scanHours.length;
        inventoryScansAreEnabled = triggers.some(trigger =>
            trigger.getHandlerFunction() === INVENTORY_SCRAPER_CONFIG.dailyHandler
        );
    } catch (error) {
        Logger.log(`Could not inspect installed scan triggers: ${error.message}`);
    }
    const inventoryApiKeyIsSet = Boolean(
        userProperties.getProperty(
            INVENTORY_SCRAPER_CONFIG.apiKeyProperty
        )
    );
    const inventorySearchUrl = scriptProperties.getProperty(
        INVENTORY_SCRAPER_CONFIG.searchUrlProperty
    );
    const inventorySearchUrlIsSet = Boolean(
        inventorySearchUrl && isInventorySearchUrl_(inventorySearchUrl)
    );

    SpreadsheetApp.getUi()
        .createMenu('Price Tracker')
        .addItem(
            `${trackerTabIsSet ? '✅ ' : ''}Set active tab as tracker`,
            'setPriceTrackerSheet'
        )
        .addItem(
            `${priceScansAreEnabled ? '✅ ' : ''}Install scans (8 AM-8 PM, every 2 hours)`,
            'installDailyPriceCheck'
        )
        .addSeparator()
        .addItem('Run price scan now', 'runPriceCheck')
        .addItem('Fill blank Listing IDs', 'fillBlankListingIds')
        .addSeparator()
        .addItem(
            `${inventoryApiKeyIsSet ? '✅ ' : ''}Set inventory scraper Gemini key`,
            'setInventoryScraperGeminiKey'
        )
        .addItem(
            `${inventorySearchUrlIsSet ? '✅ ' : ''}Set inventory scraper search URL`,
            'setInventoryScraperSearchUrl'
        )
        .addItem('Scrape new inventory', 'startInventoryScrape')
        .addItem(
            `${inventoryScansAreEnabled ? '✅ ' : ''}Install daily inventory scrape (8 AM)`,
            'installDailyInventoryScrape'
        )
        .addItem('Continue inventory scrape now', 'continueInventoryScrape')
        .addToUi();
}

function setPriceTrackerSheet() {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet.getActiveSheet();
    getTrackerColumns_(sheet);
    const properties = PropertiesService.getScriptProperties();
    properties.setProperty(
        PRICE_TRACKER_CONFIG.trackerSheetIdProperty,
        String(sheet.getSheetId())
    );
    properties.setProperty(
        PRICE_TRACKER_CONFIG.spreadsheetIdProperty,
        spreadsheet.getId()
    );
    spreadsheet.toast(`Using "${sheet.getName()}" as the price tracker.`);
    onOpen();
}

function installDailyPriceCheck() {
    const spreadsheet = getTrackerSpreadsheet_();
    const trackerSheet = getTrackerSheet_(spreadsheet);
    getTrackerColumns_(trackerSheet);

    const properties = PropertiesService.getScriptProperties();
    properties.deleteProperty(PRICE_TRACKER_CONFIG.scheduleEnabledProperty);
    ScriptApp.getProjectTriggers()
        .filter(trigger =>
            trigger.getHandlerFunction() === PRICE_TRACKER_CONFIG.dailyHandler
        )
        .forEach(trigger => ScriptApp.deleteTrigger(trigger));

    PRICE_TRACKER_CONFIG.scanHours.forEach(hour => {
        ScriptApp.newTrigger(PRICE_TRACKER_CONFIG.dailyHandler)
            .timeBased()
            .everyDays(1)
            .atHour(hour)
            .inTimezone(Session.getScriptTimeZone())
            .create();
    });
    properties.setProperty(PRICE_TRACKER_CONFIG.scheduleEnabledProperty, 'true');

    spreadsheet.toast(
        `Price scans installed for "${trackerSheet.getName()}" every 2 hours from about 8 AM through 8 PM.`
    );
    onOpen();
}

function fillBlankListingIds() {
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(1000)) {
        throw new Error('Another price tracker task is already running.');
    }

    try {
        const spreadsheet = getTrackerSpreadsheet_();
        const trackerSheet = getTrackerSheet_(spreadsheet);
        const columns = getTrackerColumns_(trackerSheet);
        const lastColumn = trackerSheet.getLastColumn();
        const headers = trackerSheet
            .getRange(columns.headerRow, 1, 1, lastColumn)
            .getDisplayValues()[0]
            .map(normalizeHeader_);
        const urlColumn = headers.indexOf('url') + 1;
        const listingIdColumn = headers.indexOf('listingid') + 1;
        if (!urlColumn || !listingIdColumn) {
            spreadsheet.toast('Add a Listing ID header to the tracker tab first.');
            return;
        }

        const lastRow = trackerSheet.getLastRow();
        if (lastRow <= columns.headerRow) {
            spreadsheet.toast('No vehicle rows found to check.');
            return;
        }

        const rowCount = lastRow - columns.headerRow;
        const rows = trackerSheet.getRange(
            columns.headerRow + 1,
            1,
            rowCount,
            lastColumn
        ).getDisplayValues();
        const candidates = rows.flatMap((row, index) => {
            const listingId = String(row[listingIdColumn - 1] || '').trim();
            const url = String(row[urlColumn - 1] || '').trim();
            return !listingId && url
                ? [{ rowNumber: columns.headerRow + index + 1, url }]
                : [];
        });
        if (!candidates.length) {
            spreadsheet.toast('Every vehicle with a URL already has a Listing ID.');
            return;
        }

        const updates = new Map();
        let notFoundCount = 0;
        spreadsheet.toast(`Filling Listing IDs: 0/${candidates.length}`);
        candidates.forEach((candidate, index) => {
            let listingId = extractListingIdFromUrl_(candidate.url);
            if (!listingId) {
                try {
                    listingId = fetchListingIdFromPage_(candidate.url);
                } catch (error) {
                    Logger.log(`Listing ID lookup failed for row ${candidate.rowNumber}: ${error.message}`);
                }
            }

            if (listingId) {
                updates.set(candidate.rowNumber, listingId);
            } else {
                notFoundCount++;
            }

            const completed = index + 1;
            if (
                completed % PRICE_TRACKER_CONFIG.progressUpdateInterval === 0 ||
                completed === candidates.length
            ) {
                spreadsheet.toast(`Filling Listing IDs: ${completed}/${candidates.length}`);
            }
        });

        writeColumnUpdates_(trackerSheet, listingIdColumn, updates);
        SpreadsheetApp.flush();
        spreadsheet.toast(
            `Filled ${updates.size} Listing ID(s); ${notFoundCount} URL(s) had no ID to extract.`,
            'Price Tracker',
            10
        );
    } finally {
        lock.releaseLock();
    }
}

function extractListingIdFromUrl_(url) {
    return String(url).match(/(?:^|\/)[^/?#]*?id(\d+)\.html(?:[?#]|$)/i)?.[1] || '';
}

function fetchListingIdFromPage_(url) {
    if (!/^https:\/\/www\.ottawachryslerjeepdodge\.com\//i.test(url)) {
        return '';
    }

    const response = UrlFetchApp.fetch(url, {
        followRedirects: true,
        muteHttpExceptions: true,
        headers: { Accept: 'text/html' }
    });
    const responseCode = response.getResponseCode();
    if (responseCode < 200 || responseCode >= 300) {
        throw new Error(`Vehicle page returned HTTP ${responseCode}.`);
    }

    const html = response.getContentText();
    const canonicalTag = (html.match(/<link\b[^>]*>/gi) || [])
        .find(tag => /\brel=["'][^"']*\bcanonical\b/i.test(tag));
    const canonicalUrl = canonicalTag?.match(/\bhref=["']([^"']+)["']/i)?.[1] || '';
    if (canonicalUrl) {
        const listingId = extractListingIdFromUrl_(canonicalUrl);
        if (listingId) return listingId;
    }

    const carId = html.match(/\bdata-carid=["'](\d+)["']/i)?.[1];
    return carId || '';
}

function runPriceCheck() {
    processPriceCheck_(false);
}

function continuePriceCheck() {
    processPriceCheck_(true);
}

function processPriceCheck_(continuationOnly) {
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(1000)) {
        throw new Error('A price scan is already running.');
    }

    try {
        const startedAt = Date.now();
        const properties = PropertiesService.getScriptProperties();
        const savedProgress = properties.getProperty(PRICE_TRACKER_CONFIG.progressProperty);
        let progress = savedProgress ? JSON.parse(savedProgress) : null;
        if (!progress) {
            if (continuationOnly) return;

            const spreadsheet = getTrackerSpreadsheet_();
            const trackerSheet = getTrackerSheet_(spreadsheet);
            const columns = getTrackerColumns_(trackerSheet);
            const lastRow = trackerSheet.getLastRow();
            if (lastRow <= columns.headerRow) {
                spreadsheet.toast('No vehicle rows found to check.');
                return;
            }

            progress = {
                spreadsheetId: spreadsheet.getId(),
                trackerSheetId: trackerSheet.getSheetId(),
                headerRow: columns.headerRow,
                totalRows: lastRow - columns.headerRow,
                nextIndex: 0,
                timestamp: new Date().toISOString(),
                checkedCount: 0,
                changedCount: 0,
                errorCount: 0,
                seenStocks: []
            };
            properties.setProperty(
                PRICE_TRACKER_CONFIG.progressProperty,
                JSON.stringify(progress)
            );
        }

        const spreadsheet = SpreadsheetApp.openById(progress.spreadsheetId);
        const trackerSheet = spreadsheet.getSheets().find(
            sheet => String(sheet.getSheetId()) === String(progress.trackerSheetId)
        );
        if (!trackerSheet) {
            properties.deleteProperty(PRICE_TRACKER_CONFIG.progressProperty);
            clearPriceCheckContinuationTriggers_();
            throw new Error('The saved tracker tab no longer exists. Select it and set it again.');
        }
        const columns = getTrackerColumns_(trackerSheet);
        if (columns.headerRow !== progress.headerRow) {
            properties.deleteProperty(PRICE_TRACKER_CONFIG.progressProperty);
            clearPriceCheckContinuationTriggers_();
            throw new Error('The tracker header changed during a scan. Start the scan again.');
        }

        const rows = trackerSheet.getRange(
            progress.headerRow + 1,
            1,
            progress.totalRows,
            trackerSheet.getLastColumn()
        ).getValues();
        const historySheet = getHistorySheet_(spreadsheet);
        const timestamp = new Date(progress.timestamp);
        const historyEntries = [];
        const priceUpdates = new Map();
        const statusUpdates = new Map();
        const seenStocks = new Set(progress.seenStocks);
        let requestCount = 0;

        if (progress.nextIndex === 0) {
            showPriceCheckProgress_(spreadsheet, progress);
        }

        while (
            progress.nextIndex < progress.totalRows &&
            Date.now() - startedAt < PRICE_TRACKER_CONFIG.maxRunMillis
        ) {
            if (
                progress.nextIndex > 0 &&
                progress.nextIndex % PRICE_TRACKER_CONFIG.progressUpdateInterval === 0
            ) {
                showPriceCheckProgress_(spreadsheet, progress);
            }

            const index = progress.nextIndex++;
            const row = rows[index];
            if (
                columns.status &&
                splitStatusValues_(row[columns.status - 1])
                    .some(value => value.toLowerCase() === 'gone')
            ) {
                continue;
            }

            const stock = String(row[columns.stock - 1] || '').trim();
            const url = String(row[columns.url - 1] || '').trim();
            if (!stock && !url) continue;
            if (!stock || !url) {
                progress.errorCount++;
                Logger.log(`Price scan warning: Row ${progress.headerRow + index + 1} is missing Stock or URL.`);
                continue;
            }

            const stockKey = stock.toUpperCase();
            if (seenStocks.has(stockKey)) {
                progress.errorCount++;
                Logger.log(`Price scan warning: Duplicate stock number "${stock}" was skipped.`);
                continue;
            }
            seenStocks.add(stockKey);

            try {
                if (requestCount > 0) Utilities.sleep(150);
                requestCount++;
                const currentPrice = fetchListingPrice_(url, stock);
                progress.checkedCount++;
                const previousPrice = parsePrice_(row[columns.price - 1]);
                if (previousPrice === currentPrice) continue;

                const vehicle = formatVehicleName_(row, columns);
                historyEntries.push([
                    timestamp,
                    stock,
                    vehicle,
                    previousPrice === null ? '' : previousPrice,
                    currentPrice,
                    url,
                    previousPrice === null ? 'Baseline' : 'Price change'
                ]);
                const sheetRow = progress.headerRow + index + 1;
                priceUpdates.set(sheetRow, currentPrice);
                if (
                    columns.status &&
                    splitStatusValues_(row[columns.status - 1])
                        .some(value => value.toLowerCase() === 'listed')
                ) {
                    statusUpdates.set(
                        sheetRow,
                        addStatusValue_(row[columns.status - 1], 'Update Price')
                    );
                }
                progress.changedCount++;
            } catch (error) {
                if (error.code === 'STOCK_NOT_FOUND' && columns.status) {
                    const status = row[columns.status - 1];
                    const missingStockStatus = splitStatusValues_(status)
                        .some(value => value.toLowerCase() === 'sold')
                        ? 'Gone'
                        : 'Review';
                    statusUpdates.set(
                        progress.headerRow + index + 1,
                        addStatusValue_(status, missingStockStatus)
                    );
                }
                progress.errorCount++;
                Logger.log(`Price scan warning: Stock ${stock}: ${error.message}`);
            }

        }

        writeColumnUpdates_(trackerSheet, columns.price, priceUpdates);
        if (columns.status) {
            writeColumnUpdates_(trackerSheet, columns.status, statusUpdates);
        }

        if (historyEntries.length) {
            historySheet.getRange(
                historySheet.getLastRow() + 1,
                1,
                historyEntries.length,
                PRICE_TRACKER_CONFIG.historyHeaders.length
            ).setValues(historyEntries);
            historySheet
                .getRange(historySheet.getLastRow() - historyEntries.length + 1, 1, historyEntries.length, 1)
                .setNumberFormat('yyyy-mm-dd hh:mm:ss');
        }

        SpreadsheetApp.flush();
        progress.seenStocks = [...seenStocks];
        if (progress.nextIndex < progress.totalRows) {
            properties.setProperty(
                PRICE_TRACKER_CONFIG.progressProperty,
                JSON.stringify(progress)
            );
            schedulePriceCheckContinuation_();
            spreadsheet.toast(
                `Price scan progress: ${progress.nextIndex}/${progress.totalRows}. Continuing shortly.`,
                'Price Tracker',
                10
            );
            return;
        }

        properties.deleteProperty(PRICE_TRACKER_CONFIG.progressProperty);
        clearPriceCheckContinuationTriggers_();
        const summary =
            `Checked ${progress.checkedCount} vehicles; updated ${progress.changedCount} prices.` +
            (progress.errorCount ? ` ${progress.errorCount} row(s) need attention; see Apps Script execution logs.` : '');
        Logger.log(summary);
        spreadsheet.toast(summary, 'Price Tracker', 10);

        if (progress.checkedCount === 0 && progress.errorCount) {
            throw new Error('No vehicle prices could be checked. See Apps Script execution logs for row warnings.');
        }
    } finally {
        lock.releaseLock();
    }
}

function showPriceCheckProgress_(spreadsheet, progress) {
    spreadsheet.toast(
        `Price scan progress: ${progress.nextIndex}/${progress.totalRows}`,
        'Price Tracker',
        5
    );
}

function schedulePriceCheckContinuation_() {
    clearPriceCheckContinuationTriggers_();
    ScriptApp.newTrigger(PRICE_TRACKER_CONFIG.continuationHandler)
        .timeBased()
        .after(PRICE_TRACKER_CONFIG.continuationDelayMillis)
        .create();
}

function clearPriceCheckContinuationTriggers_() {
    ScriptApp.getProjectTriggers()
        .filter(trigger =>
            trigger.getHandlerFunction() === PRICE_TRACKER_CONFIG.continuationHandler
        )
        .forEach(trigger => ScriptApp.deleteTrigger(trigger));
}

function writeColumnUpdates_(sheet, column, updates) {
    const entries = [...updates.entries()].sort((left, right) => left[0] - right[0]);
    let entryIndex = 0;
    while (entryIndex < entries.length) {
        const startRow = entries[entryIndex][0];
        const values = [[entries[entryIndex][1]]];
        let previousRow = startRow;
        entryIndex++;

        while (
            entryIndex < entries.length &&
            entries[entryIndex][0] === previousRow + 1
        ) {
            values.push([entries[entryIndex][1]]);
            previousRow = entries[entryIndex][0];
            entryIndex++;
        }

        sheet.getRange(startRow, column, values.length, 1).setValues(values);
    }
}

function getTrackerSheet_(spreadsheet) {
    const sheetId = PropertiesService.getScriptProperties().getProperty(
        PRICE_TRACKER_CONFIG.trackerSheetIdProperty
    );
    if (!sheetId) {
        throw new Error(
            'Choose the tracker tab, then use Price Tracker > Set active tab as tracker.'
        );
    }
    const sheet = spreadsheet.getSheets().find(
        candidate => String(candidate.getSheetId()) === sheetId
    );
    if (!sheet) {
        throw new Error('The saved tracker tab no longer exists. Select it and set it again.');
    }
    return sheet;
}

function getTrackerSpreadsheet_() {
    const spreadsheetId = PropertiesService.getScriptProperties().getProperty(
        PRICE_TRACKER_CONFIG.spreadsheetIdProperty
    );
    if (!spreadsheetId) {
        throw new Error(
            'Choose the tracker tab, then use Price Tracker > Set active tab as tracker.'
        );
    }
    return SpreadsheetApp.openById(spreadsheetId);
}

function getTrackerColumns_(sheet) {
    const rowsToCheck = Math.min(sheet.getLastRow(), 10);
    const columnCount = sheet.getLastColumn();
    if (!rowsToCheck || !columnCount) {
        throw new Error(`"${sheet.getName()}" is empty.`);
    }

    const values = sheet.getRange(1, 1, rowsToCheck, columnCount).getDisplayValues();
    for (let rowIndex = 0; rowIndex < values.length; rowIndex++) {
        const headers = new Map(
            values[rowIndex].map((value, index) => [normalizeHeader_(value), index + 1])
        );
        const stock = firstHeaderColumn_(headers, ['stock', 'stocknumber', 'stockno']);
        const url = firstHeaderColumn_(headers, ['url', 'vehicleurl', 'listingurl']);
        const price = firstHeaderColumn_(headers, ['price', 'currentprice', 'latestprice']);
        if (stock && url && price) {
            return {
                headerRow: rowIndex + 1,
                status: headers.get('status') || 0,
                stock,
                url,
                price,
                year: headers.get('year') || 0,
                make: headers.get('make') || 0,
                model: headers.get('model') || 0,
                trim: headers.get('trim') || 0
            };
        }
    }
    throw new Error(
        `Could not find Stock, URL, and Price headers in the first 10 rows of "${sheet.getName()}".`
    );
}

function firstHeaderColumn_(headers, choices) {
    for (const choice of choices) {
        if (headers.has(choice)) return headers.get(choice);
    }
    return 0;
}

function normalizeHeader_(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function splitStatusValues_(value) {
    return String(value || '')
        .split(/\s*,\s*/)
        .map(status => status.trim())
        .filter(Boolean);
}

function addStatusValue_(currentValue, valueToAdd) {
    const statuses = splitStatusValues_(currentValue);
    if (statuses.some(status => status.toLowerCase() === valueToAdd.toLowerCase())) {
        return statuses.join(', ');
    }
    return [...statuses, valueToAdd].join(', ');
}

function getHistorySheet_(spreadsheet) {
    let sheet = spreadsheet.getSheetByName(PRICE_TRACKER_CONFIG.historySheetName);
    if (!sheet) {
        sheet = spreadsheet.insertSheet(PRICE_TRACKER_CONFIG.historySheetName);
        sheet.getRange(1, 1, 1, PRICE_TRACKER_CONFIG.historyHeaders.length)
            .setValues([PRICE_TRACKER_CONFIG.historyHeaders]);
        sheet.setFrozenRows(1);
        return sheet;
    }

    if (sheet.getLastRow() === 0) {
        sheet.getRange(1, 1, 1, PRICE_TRACKER_CONFIG.historyHeaders.length)
            .setValues([PRICE_TRACKER_CONFIG.historyHeaders]);
        sheet.setFrozenRows(1);
        return sheet;
    }

    const headers = sheet
        .getRange(1, 1, 1, PRICE_TRACKER_CONFIG.historyHeaders.length)
        .getDisplayValues()[0]
        .map(normalizeHeader_);
    const expectedHeaders = PRICE_TRACKER_CONFIG.historyHeaders.map(normalizeHeader_);
    if (expectedHeaders.some((header, index) => headers[index] !== header)) {
        throw new Error(
            `"${PRICE_TRACKER_CONFIG.historySheetName}" exists but has unexpected headers. Rename it or correct its header row before scanning.`
        );
    }
    return sheet;
}

function fetchListingPrice_(url, stock) {
    if (!/^https:\/\/www\.ottawachryslerjeepdodge\.com\/(?:used|new|demo|occasion)\/[^?#]*id\d+\.html(?:[?#].*)?$/i.test(url)) {
        throw new Error('The listing URL is not a recognized dealership vehicle page.');
    }

    const response = UrlFetchApp.fetch(url, {
        followRedirects: true,
        muteHttpExceptions: true,
        headers: { Accept: 'text/html' }
    });
    const responseCode = response.getResponseCode();
    if (responseCode === 404 && stock) {
        return fetchListingPriceByStock_(stock);
    }
    if (responseCode < 200 || responseCode >= 300) {
        throw new Error(`Vehicle page returned HTTP ${responseCode}.`);
    }

    const price = extractListingPrice_(response.getContentText());
    if (price !== null) return price;
    if (stock) return fetchListingPriceByStock_(stock);
    throw new Error('Could not find a current price on the vehicle page.');
}

function fetchListingPriceByStock_(stock) {
    const searchUrl =
        'https://www.ottawachryslerjeepdodge.com/used/search.html?stocknumber=' +
        encodeURIComponent(stock);
    const response = UrlFetchApp.fetch(searchUrl, {
        followRedirects: true,
        muteHttpExceptions: true,
        headers: { Accept: 'text/html' }
    });
    const responseCode = response.getResponseCode();
    if (responseCode < 200 || responseCode >= 300) {
        throw new Error(
            `Original listing returned 404 and stock lookup returned HTTP ${responseCode}.`
        );
    }

    const expectedStock = String(stock).trim().toUpperCase();
    const cards = response.getContentText().match(
        /<li\b[^>]*class=["'][^"']*\bcarBoxWrapper\b[^"']*["'][^>]*>[\s\S]*?<\/li>/gi
    ) || [];
    for (const card of cards) {
        const stockMatches = [
            ...card.matchAll(
                /(?:data-stock-number|data-stockid)=["']([^"']+)["']/gi
            )
        ];
        if (!stockMatches.some(match =>
            match[1].trim().toUpperCase() === expectedStock
        )) continue;

        const price = extractListingPrice_(card);
        if (price !== null) return price;
        throw new Error(`Stock lookup found "${stock}" but its current price was missing.`);
    }
    const error = new Error(
        `Original listing returned 404 and no current vehicle was found for stock "${stock}".`
    );
    error.code = 'STOCK_NOT_FOUND';
    throw error;
}

function extractListingPrice_(html) {
    const priceContainer = html.match(
        /<div\b[^>]*\b(?:id=["']carPrice["']|class=["'][^"']*\bcarPrice\b[^"']*["'])[^>]*>([\s\S]*?)<\/div>/i
    );
    if (!priceContainer) return null;

    const formattedPrice = priceContainer[1].match(
        /<span\b[^>]*class=["'][^"']*\bformat-price\b[^"']*["'][^>]*>\s*([\d,]+(?:\.\d{1,2})?)\s*<\/span>/i
    );
    const priceText = formattedPrice
        ? formattedPrice[1]
        : priceContainer[1].replace(/<[^>]*>/g, ' ');
    return parsePrice_(priceText);
}

function parsePrice_(value) {
    if (value === null || value === undefined || value === '') return null;
    const normalized = String(value).replace(/[, $]/g, '').trim();
    if (!/^-?\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
    const price = Number(normalized);
    return Number.isFinite(price) ? price : null;
}

function formatVehicleName_(row, columns) {
    return [columns.year, columns.make, columns.model, columns.trim]
        .filter(column => column)
        .map(column => String(row[column - 1] || '').trim())
        .filter(Boolean)
        .join(' ');
}
