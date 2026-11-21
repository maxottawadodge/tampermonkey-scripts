// Version: 1.1.0
let trackerContext_;

function invoke(action, context, args) {
    const actions = {
        onOpen,
        setPriceTrackerSheet,
        installDailyPriceCheck,
        fillBlankListingIds,
        showCopyTrackerRow,
        getCopyTrackerRow,
        runPriceCheck,
        continuePriceCheck,
        setInventoryScraperGeminiKey,
        setInventoryScraperSearchUrl,
        saveInventoryScraperSearchUrl,
        setSalespersonSettings,
        saveSalespersonSettings,
        installDailyInventoryScrape,
        startInventoryScrape,
        fillBlankInventoryDescriptions,
        runScheduledInventoryScrape,
        continueInventoryScrape
    };
    if (!Object.prototype.hasOwnProperty.call(actions, action)) {
        throw new Error(`Unknown tracker action: ${action}`);
    }
    trackerContext_ = context;
    return actions[action](...(args || []));
}

function getTrackerProperties_() {
    return trackerContext_.properties;
}

function getTrackerLock_() {
    return trackerContext_.lock;
}
