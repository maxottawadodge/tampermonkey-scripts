const PRICE_TRACKER_CONFIG = Object.freeze({
    historySheetName: 'Price History',
    trackerSheetIdProperty: 'PRICE_TRACKER_SHEET_ID',
    spreadsheetIdProperty: 'PRICE_TRACKER_SPREADSHEET_ID',
    dailyHandler: 'runPriceCheck',
    dailyHour: 8,
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
    SpreadsheetApp.getUi()
        .createMenu('Price Tracker')
        .addItem('Set active tab as tracker', 'setPriceTrackerSheet')
        .addItem('Install daily scan (8 AM)', 'installDailyPriceCheck')
        .addSeparator()
        .addItem('Run price scan now', 'runPriceCheck')
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
}

function installDailyPriceCheck() {
    const spreadsheet = getTrackerSpreadsheet_();
    const trackerSheet = getTrackerSheet_(spreadsheet);
    getTrackerColumns_(trackerSheet);

    ScriptApp.getProjectTriggers()
        .filter(trigger =>
            trigger.getHandlerFunction() === PRICE_TRACKER_CONFIG.dailyHandler
        )
        .forEach(trigger => ScriptApp.deleteTrigger(trigger));

    ScriptApp.newTrigger(PRICE_TRACKER_CONFIG.dailyHandler)
        .timeBased()
        .everyDays(1)
        .atHour(PRICE_TRACKER_CONFIG.dailyHour)
        .inTimezone(Session.getScriptTimeZone())
        .create();

    spreadsheet.toast(
        `Daily price scans installed for "${trackerSheet.getName()}" at about 8 AM.`
    );
}

function runPriceCheck() {
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(1000)) {
        throw new Error('A price scan is already running.');
    }

    try {
        const spreadsheet = getTrackerSpreadsheet_();
        const trackerSheet = getTrackerSheet_(spreadsheet);
        const columns = getTrackerColumns_(trackerSheet);
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
            trackerSheet.getLastColumn()
        ).getValues();
        const historySheet = getHistorySheet_(spreadsheet);
        const timestamp = new Date();
        const historyEntries = [];
        const errors = [];
        const seenStocks = new Set();
        let checkedCount = 0;
        let changedCount = 0;
        let requestCount = 0;

        rows.forEach((row, index) => {
            const stock = String(row[columns.stock - 1] || '').trim();
            const url = String(row[columns.url - 1] || '').trim();
            if (!stock && !url) return;
            if (!stock || !url) {
                errors.push(`Row ${columns.headerRow + index + 1} is missing Stock or URL.`);
                return;
            }

            const stockKey = stock.toUpperCase();
            if (seenStocks.has(stockKey)) {
                errors.push(`Duplicate stock number "${stock}" was skipped.`);
                return;
            }
            seenStocks.add(stockKey);

            try {
                if (requestCount > 0) Utilities.sleep(150);
                requestCount++;
                const currentPrice = fetchListingPrice_(url, stock);
                checkedCount++;
                const previousPrice = parsePrice_(row[columns.price - 1]);
                if (previousPrice === currentPrice) return;

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
                trackerSheet.getRange(
                    columns.headerRow + index + 1,
                    columns.price
                ).setValue(currentPrice);
                if (
                    columns.status &&
                    String(row[columns.status - 1] || '').trim().toLowerCase() === 'listed'
                ) {
                    trackerSheet.getRange(
                        columns.headerRow + index + 1,
                        columns.status
                    ).setValue('Update Price');
                }
                changedCount++;
            } catch (error) {
                if (error.code === 'STOCK_NOT_FOUND') {
                    trackerSheet.getRange(
                        columns.headerRow + index + 1,
                        3
                    ).setValue('REVIEW');
                }
                errors.push(`Stock ${stock}: ${error.message}`);
            }
        });

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
        const summary =
            `Checked ${checkedCount} vehicles; updated ${changedCount} prices.` +
            (errors.length ? ` ${errors.length} row(s) need attention; see Apps Script execution logs.` : '');
        Logger.log(summary);
        errors.forEach(error => Logger.log(`Price scan warning: ${error}`));
        spreadsheet.toast(summary, 'Price Tracker', 10);

        if (checkedCount === 0 && errors.length) {
            throw new Error(`No vehicle prices could be checked. ${errors.join(' ')}`);
        }
    } finally {
        lock.releaseLock();
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
