// Version: 1.2.0
function invokeTracker_(action, ...args) {
    return InventoryTracker.invoke(action, {
        properties: PropertiesService.getScriptProperties(),
        lock: LockService.getScriptLock(),
        triggerNames: () => ScriptApp.getProjectTriggers().map(trigger => trigger.getHandlerFunction()),
        clearTriggers: handler => {
            ScriptApp.getProjectTriggers()
                .filter(trigger => trigger.getHandlerFunction() === handler)
                .forEach(trigger => ScriptApp.deleteTrigger(trigger));
        },
        installDailyTriggers: (handler, hours) => {
            hours.forEach(hour => ScriptApp.newTrigger(handler)
                .timeBased()
                .everyDays(1)
                .atHour(hour)
                .inTimezone(Session.getScriptTimeZone())
                .create());
        },
        scheduleContinuation: (handler, delay) => {
            ScriptApp.newTrigger(handler).timeBased().after(delay).create();
        },
        showDialog: (file, values, width, height, title) => {
            const template = HtmlService.createTemplateFromFile(file);
            Object.assign(template, values);
            SpreadsheetApp.getUi().showModalDialog(template.evaluate().setWidth(width).setHeight(height), title);
        }
    }, args);
}

function onOpen() { invokeTracker_('onOpen'); }
function setPriceTrackerSheet() { invokeTracker_('setPriceTrackerSheet'); }
function installDailyPriceCheck() { invokeTracker_('installDailyPriceCheck'); }
function fillBlankListingIds() { invokeTracker_('fillBlankListingIds'); }
function showCopyTrackerRow() { invokeTracker_('showCopyTrackerRow'); }
function getCopyTrackerRow(reference) { return invokeTracker_('getCopyTrackerRow', reference); }
function runPriceCheck() { invokeTracker_('runPriceCheck'); }
function continuePriceCheck() { invokeTracker_('continuePriceCheck'); }
function setInventoryScraperGeminiKey() { invokeTracker_('setInventoryScraperGeminiKey'); }
function setInventoryScraperSearchUrl() { invokeTracker_('setInventoryScraperSearchUrl'); }
function saveInventoryScraperSearchUrl(url) { invokeTracker_('saveInventoryScraperSearchUrl', url); }
function setSalespersonSettings() { invokeTracker_('setSalespersonSettings'); }
function saveSalespersonSettings(settings) { invokeTracker_('saveSalespersonSettings', settings); }
function installDailyInventoryScrape() { invokeTracker_('installDailyInventoryScrape'); }
function startInventoryScrape() { invokeTracker_('startInventoryScrape'); }
function fillBlankInventoryDescriptions() { invokeTracker_('fillBlankInventoryDescriptions'); }
function fillSelectedInventoryDescription() { invokeTracker_('fillSelectedInventoryDescription'); }
function runScheduledInventoryScrape() { invokeTracker_('runScheduledInventoryScrape'); }
function continueInventoryScrape() { invokeTracker_('continueInventoryScrape'); }
