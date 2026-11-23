// Version: 1.7.0
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
    const scriptProperties = getTrackerProperties_();
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
        const triggers = trackerContext_.triggerNames();
        priceScansAreEnabled = triggers.filter(name =>
            name === PRICE_TRACKER_CONFIG.dailyHandler
        ).length >= PRICE_TRACKER_CONFIG.scanHours.length;
        inventoryScansAreEnabled = triggers.includes(INVENTORY_SCRAPER_CONFIG.dailyHandler);
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
    const salesperson = getSalespersonSettings_();
    const salespersonIsSet = Boolean(salesperson.name && salesperson.phone);
    const scrapeInProgress = Boolean(
        scriptProperties.getProperty(INVENTORY_SCRAPER_CONFIG.stateProperty)
    );

    SpreadsheetApp.getUi()
        .createMenu('Price Tracker')
        .addItem('Copy selected vehicle row', 'showCopyTrackerRow')
        .addItem('Generate all blank descriptions', 'fillBlankInventoryDescriptions')
        .addItem('Generate single description', 'fillSelectedInventoryDescription')
        .addSeparator()
        .addItem('Run price scan now', 'runPriceCheck')
        .addItem('Fill blank Listing IDs', 'fillBlankListingIds')
        .addItem(
            `${scrapeInProgress ? '🔄 ' : ''}Scrape inventory`,
            'startOrResumeInventoryScrape'
        )
        .addSeparator()
        .addItem(
            `${trackerTabIsSet ? '✅ ' : ''}Set active tab as tracker`,
            'setPriceTrackerSheet'
        )
        .addItem(
            `${priceScansAreEnabled ? '✅ ' : ''}Install scans (8 AM-8 PM, every 2 hours)`,
            'installDailyPriceCheck'
        )
        .addItem(
            `${inventoryApiKeyIsSet ? '✅ ' : ''}Set inventory scraper Gemini key`,
            'setInventoryScraperGeminiKey'
        )
        .addItem(
            `${salespersonIsSet ? '✅ ' : ''}Set salesperson details`,
            'setSalespersonSettings'
        )
        .addItem(
            `${inventorySearchUrlIsSet ? '✅ ' : ''}Set inventory scraper search URL`,
            'setInventoryScraperSearchUrl'
        )
        .addItem(
            `${inventoryScansAreEnabled ? '✅ ' : ''}Install daily inventory scrape (8 AM)`,
            'installDailyInventoryScrape'
        )
        .addToUi();
}

function setPriceTrackerSheet() {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet.getActiveSheet();
    getTrackerColumns_(sheet);
    const properties = getTrackerProperties_();
    const previousSpreadsheetId = properties.getProperty(PRICE_TRACKER_CONFIG.spreadsheetIdProperty);
    if (previousSpreadsheetId && previousSpreadsheetId !== spreadsheet.getId()) {
        properties.deleteProperty(PRICE_TRACKER_CONFIG.progressProperty);
        properties.deleteProperty(INVENTORY_SCRAPER_CONFIG.stateProperty);
        trackerContext_.clearTriggers(PRICE_TRACKER_CONFIG.continuationHandler);
        trackerContext_.clearTriggers(INVENTORY_SCRAPER_CONFIG.continuationHandler);
    }
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

function getSelectedTrackerRow_() {
    const spreadsheet = getTrackerSpreadsheet_();
    const trackerSheet = getTrackerSheet_(spreadsheet);
    const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    if (activeSpreadsheet.getActiveSheet().getSheetId() !== trackerSheet.getSheetId()) {
        throw new Error('Select a vehicle row in the configured tracker tab first.');
    }
    const ranges = activeSpreadsheet.getActiveRangeList()?.getRanges() || [];
    if (ranges.length !== 1 || ranges[0].getNumRows() !== 1) {
        throw new Error('Select exactly one vehicle row in the tracker tab.');
    }
    return { spreadsheet, trackerSheet, rowNumber: ranges[0].getRow() };
}

function showCopyTrackerRow() {
    requireSalespersonSettings_();
    const { trackerSheet, rowNumber } = getSelectedTrackerRow_();
    const row = readCopyTrackerRow_(trackerSheet, rowNumber);
    const values = [...row.values];
    values[row.descriptionColumn - 1] = makeCopyDescription_(row.description, row.price);
    const text = values.map(value => {
        const str = String(value).replace(/"/g, '""');
        return /["\t\r\n]/.test(str) ? `"${str}"` : str;
    }).join('\t');

    trackerContext_.showDialog('copy-tracker-row', {
        sheetId: trackerSheet.getSheetId(),
        rowNumber,
        identityKey: row.identityKey,
        identityValue: row.identityValue,
        copiedText: text
    }, 560, 300, 'Copy vehicle row');
}

function getCopyTrackerRow(reference) {
    requireSalespersonSettings_();
    if (
        !reference ||
        !Number.isInteger(reference.rowNumber) ||
        !['listingId', 'stock', 'url'].includes(reference.identityKey) ||
        typeof reference.identityValue !== 'string' ||
        !reference.identityValue
    ) {
        throw new Error('Invalid row selection. Close this dialog and select the vehicle again.');
    }
    const sheet = getTrackerSheet_(getTrackerSpreadsheet_());
    if (String(sheet.getSheetId()) !== String(reference.sheetId)) {
        throw new Error('The tracker tab changed. Close this dialog and select the vehicle again.');
    }
    const row = readCopyTrackerRow_(sheet, reference.rowNumber);
    if (row.identityKey !== reference.identityKey || row.identityValue !== reference.identityValue) {
        throw new Error('The selected row changed. Close this dialog and select the vehicle again.');
    }
    row.values[row.descriptionColumn - 1] = makeCopyDescription_(row.description, row.price);
    return row.values.map(value => {
        const text = String(value).replace(/"/g, '""');
        return /["\t\r\n]/.test(text) ? `"${text}"` : text;
    }).join('\t');
}

function readCopyTrackerRow_(sheet, rowNumber) {
    const columns = getTrackerColumns_(sheet);
    if (!columns.description) throw new Error('Add a Description header to the tracker tab first.');
    if (rowNumber <= columns.headerRow || rowNumber > sheet.getLastRow()) {
        throw new Error('Select a vehicle row below the tracker headers.');
    }
    const lastColumn = sheet.getLastColumn();
    const headers = sheet.getRange(columns.headerRow, 1, 1, lastColumn).getDisplayValues()[0];
    const range = sheet.getRange(rowNumber, 1, 1, lastColumn);
    const values = range.getDisplayValues()[0];
    const richText = range.getRichTextValues()[0];
    headers.forEach((header, index) => {
        if (['url', 'listedon'].includes(normalizeHeader_(header))) {
            values[index] = richText[index]?.getLinkUrl() || values[index];
        }
    });
    const listingIdColumn = headers.findIndex(header => normalizeHeader_(header) === 'listingid');
    const identities = [
        ['listingId', listingIdColumn >= 0 ? values[listingIdColumn] : ''],
        ['stock', values[columns.stock - 1]],
        ['url', values[columns.url - 1]]
    ];
    const identity = identities.find(([, value]) => String(value || '').trim());
    if (!identity) throw new Error('The selected row needs a Listing ID, stock number, or URL.');
    const description = String(values[columns.description - 1] || '').trim();
    if (!description) throw new Error('The selected vehicle has no description to copy.');
    const price = parsePrice_(values[columns.price - 1]);
    if (price === null || price <= 0) {
        throw new Error('The selected vehicle needs a valid price before it can be copied.');
    }
    return {
        values,
        description,
        descriptionColumn: columns.description,
        price,
        identityKey: identity[0],
        identityValue: String(identity[1]).trim()
    };
}

function makeCopyDescription_(description, price) {
    const updated = updateInventoryDescriptionPrice_(description, price);
    const priceLines = description.match(/^Price[ \t]*:[^\r\n]*$/gim) || [];
    if (priceLines.length > 1 || (priceLines.length && updated === null)) {
        throw new Error('The description has an unrecognized or duplicate price line. Remove it before copying.');
    }
    if (updated !== null) return updated;
    const priceLine = `Price: $${price} plus tax and licensing.`;
    const contact = /(^|\r?\n)(For more information or to schedule a test drive, contact us at:)/i;
    if (contact.test(description)) {
        return description.replace(contact, (match, lineBreak, heading) =>
            `${lineBreak}${priceLine}\n.\n${heading}`
        );
    }
    return `${description}\n\n${priceLine}`;
}

function installDailyPriceCheck() {
    const spreadsheet = getTrackerSpreadsheet_();
    const trackerSheet = getTrackerSheet_(spreadsheet);
    getTrackerColumns_(trackerSheet);

    const properties = getTrackerProperties_();
    properties.deleteProperty(PRICE_TRACKER_CONFIG.scheduleEnabledProperty);
    trackerContext_.clearTriggers(PRICE_TRACKER_CONFIG.dailyHandler);
    trackerContext_.installDailyTriggers(
        PRICE_TRACKER_CONFIG.dailyHandler,
        PRICE_TRACKER_CONFIG.scanHours
    );
    properties.setProperty(PRICE_TRACKER_CONFIG.scheduleEnabledProperty, 'true');

    spreadsheet.toast(
        `Price scans installed for "${trackerSheet.getName()}" every 2 hours from about 8 AM through 8 PM.`
    );
    onOpen();
}

function fillBlankListingIds() {
    const lock = getTrackerLock_();
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
    const lock = getTrackerLock_();
    if (!lock.tryLock(1000)) {
        throw new Error('A price scan is already running.');
    }

    try {
        const startedAt = Date.now();
        const properties = getTrackerProperties_();
        const savedProgress = properties.getProperty(PRICE_TRACKER_CONFIG.progressProperty);
        let progress = savedProgress ? JSON.parse(savedProgress) : null;
        if (progress && progress.spreadsheetId !== getTrackerSpreadsheet_().getId()) {
            throw new Error('Saved price scan belongs to a different spreadsheet. Set the tracker tab again.');
        }
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
        const descriptionUpdates = new Map();
        const statusUpdates = new Map();
        const seenStocks = new Set(progress.seenStocks);
        const priceNoteUpdates = new Map();
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
                priceNoteUpdates.set(sheetRow, currentPrice);
                if (columns.description) {
                    const description = String(row[columns.description - 1] || '');
                    if (description.trim()) {
                        const updatedDescription = updateInventoryDescriptionPrice_(
                            description,
                            currentPrice
                        );
                        if (updatedDescription !== null && updatedDescription !== description) {
                            descriptionUpdates.set(sheetRow, updatedDescription);
                        }
                    }
                }
                const currentStatus = columns.status
                    ? statusUpdates.get(sheetRow) || row[columns.status - 1]
                    : '';
                if (
                    columns.status &&
                    splitStatusValues_(currentStatus)
                        .some(value => value.toLowerCase() === 'listed')
                ) {
                    statusUpdates.set(
                        sheetRow,
                        addStatusValue_(currentStatus, 'Update Price')
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
        
        // Append price to cell notes for inline history
        if (priceNoteUpdates.size > 0) {
            const now = new Date();
            const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
            const dateStr = Utilities.formatDate(now, tz, 'MMM d, yyyy h:mm a');
            priceNoteUpdates.forEach((price, row) => {
                const cell = trackerSheet.getRange(row, columns.price);
                const existingNote = cell.getNote() || '';
                const newNote = existingNote 
                    ? existingNote + '\n' + dateStr + ': $' + price
                    : dateStr + ': $' + price;
                cell.setNote(newNote);
            });
        }
        
        if (columns.description) {
            writeColumnUpdates_(trackerSheet, columns.description, descriptionUpdates);
        }
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
    trackerContext_.scheduleContinuation(
        PRICE_TRACKER_CONFIG.continuationHandler,
        PRICE_TRACKER_CONFIG.continuationDelayMillis
    );
}

function clearPriceCheckContinuationTriggers_() {
    trackerContext_.clearTriggers(PRICE_TRACKER_CONFIG.continuationHandler);
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
    const sheetId = getTrackerProperties_().getProperty(
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
    const spreadsheetId = getTrackerProperties_().getProperty(
        PRICE_TRACKER_CONFIG.spreadsheetIdProperty
    );
    if (!spreadsheetId) {
        throw new Error(
            'Choose the tracker tab, then use Price Tracker > Set active tab as tracker.'
        );
    }
    const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    if (activeSpreadsheet && activeSpreadsheet.getId() !== spreadsheetId) {
        throw new Error('This tracker belongs to another spreadsheet. Set the active tab as tracker first.');
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
                description: headers.get('description') || 0,
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

function updateInventoryDescriptionPrice_(description, price) {
    const priceLine = /^Price:[ \t]*(?:\$[ \t]*[\d,]+(?:\.\d{1,2})?|Contact us for pricing)[ \t]+plus tax and licensing\.\r?$/im;
    if (!priceLine.test(description)) return null;
    return description.replace(
        priceLine,
        `Price: $${price} plus tax and licensing.`
    );
}

function formatVehicleName_(row, columns) {
    return [columns.year, columns.make, columns.model, columns.trim]
        .filter(column => column)
        .map(column => String(row[column - 1] || '').trim())
        .filter(Boolean)
        .join(' ');
}
