# Tampermonkey scripts

This repository contains production and development Tampermonkey userscripts.

## Install

- <a href="https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/production/cdjr-tools.user.js" target="_blank" rel="noopener noreferrer">CDJR tools (v5.23)</a>
- <a href="https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/production/dhub-tools.user.js" target="_blank" rel="noopener noreferrer">DemandHub tools (v1.17)</a>
- <a href="https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/production/dsocket-tools.user.js" target="_blank" rel="noopener noreferrer">DealerSocket tools (v4.9)</a>
- <a href="https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/production/global-phone-links.user.js" target="_blank" rel="noopener noreferrer">Global phone links (v1.11)</a>

## Development

- <a href="https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/!DEV-cdjr-tools.user.js" target="_blank" rel="noopener noreferrer">!DEV CDJR tools (v5.23)</a>
- <a href="https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/!DEV-dhub-tools.user.js" target="_blank" rel="noopener noreferrer">!DEV DemandHub tools (v1.17)</a>
- <a href="https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/!DEV-dsocket-tools.user.js" target="_blank" rel="noopener noreferrer">!DEV DealerSocket tools (v4.9)</a>
- <a href="https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/!DEV-dsocket-auto-refresh.user.js" target="_blank" rel="noopener noreferrer">!DEV DealerSocket auto refresh (v1.3)</a>
- <a href="https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/!DEV-global-phone-links.user.js" target="_blank" rel="noopener noreferrer">!DEV Global phone links (v1.11)</a>
- <a href="https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/!DEV-kijiji-autofill.user.js" target="_blank" rel="noopener noreferrer">!DEV Kijiji Autofill (v1.2)</a>
- <a href="https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/!DEV-marketplace-autofill.user.js" target="_blank" rel="noopener noreferrer">!DEV Marketplace Autofill (v1.19)</a>
- <a href="https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/!DEV-used-car-scraper.user.js" target="_blank" rel="noopener noreferrer">!DEV Used car scraper (v1.54)</a>

Development scripts have `!DEV` names and separate update URLs so they can be
installed alongside production scripts. Disable one environment when testing
changes that would otherwise run on the same page.

The global script's Compare button uses the vehicle year and, when
available on the dealership page, its kilometres. Adjust the year and kilometre
sliders to widen or narrow the search around those values. If kilometres are
unavailable, enter them manually or leave the field blank for no kilometre filter.

## Scheduled price tracking

The shared Apps Script library in [google-apps-script/library/](./google-apps-script/library/)
checks each vehicle URL in the selected tracker tab, updates its `Price` cell,
and appends price changes to a `Price History` tab. Each spreadsheet has a
small bound script and its own tracker, progress, triggers, and salesperson
details. The Gemini key is saved in the current user's properties.

### Create the shared library

1. Create a standalone Apps Script project. Add the three `.gs` files from
   `google-apps-script/library/` to it and save.
2. Create a versioned deployment and copy the script ID from **Project Settings**.
   Share the library project with at least view access for each user. Library
   viewers can read its code, so do not put API keys in the project.

### Set up each spreadsheet

Use a clean template when making copies: copied spreadsheet cells include any
existing statuses and descriptions. Share each copy only with its intended
editors; editing one copy does not update the others.

1. Open the spreadsheet and choose **Extensions > Apps Script**. For an existing
   tracker, finish any in-progress scans first. Replace the old bound
   `price-tracker.gs` and `inventory-scraper.gs` code with the contents of
   [bound-script.gs](./google-apps-script/bound-script.gs), and remove the old
   duplicate functions from that project. Keeping the same bound project keeps
   its existing settings and installed triggers. Do not remove the files from
   the shared library project.
2. Add the library by its script ID, select the deployed version, and set its
   identifier to `InventoryTracker`. Add the HTML files
   [inventory-scraper-dialog.html](./google-apps-script/inventory-scraper-dialog.html),
   [salesperson-settings.html](./google-apps-script/salesperson-settings.html), and
   [copy-tracker-row.html](./google-apps-script/copy-tracker-row.html)
   to the bound project using those exact names. Save.
3. Reload the spreadsheet. Select the tracker tab, then choose **Price Tracker >
   Set active tab as tracker**.
4. Choose **Price Tracker > Run price scan now** and approve the requested
   spreadsheet and external request permissions.
5. Choose **Price Tracker > Install scans (8 AM-8 PM, every 2 hours)**. Scans
   run about every two hours from 8 AM through 8 PM in the Apps Script project's
   time zone. Long scans show progress and resume automatically in smaller runs.
   Use **Run price scan now** to start or resume a scan immediately.
6. Choose **Price Tracker > Fill blank Listing IDs** to fill empty Listing ID
   cells from each row's URL. IDs in the URL are extracted directly; pages are
   fetched only when the URL does not contain a listing ID.
7. Choose **Price Tracker > Set inventory scraper Gemini key** and enter your
   own Gemini API key. Choose **Set salesperson details** and enter the name,
   phone number and optional writing personality. The personality guides Gemini's
   tone; the name and phone number appear in newly generated descriptions.
   Changing the name or phone, including the first time they are set, requires
   confirmation and clears all existing descriptions in the tracker, including
   custom text and formulas. Finish any in-progress inventory scrape first.
   Changing only the personality keeps existing descriptions. Select the tracker
   tab before saving the settings. New descriptions omit the price disclosure;
   use **Copy selected vehicle row** to include it in the copied row. Set the search URL with
   **Set inventory scraper search URL**;
   the editor opens with the saved URL so you can keep or change it. **Scrape new
   inventory** uses that saved URL for manual runs; choose **Install daily
   inventory scrape (8 AM)** to schedule it. New vehicles are appended by
   Listing ID; existing IDs are skipped unless their Stock cell is blank and a
   stock number has since appeared on the site, in which case that row is
   updated and its status refreshed. Progress appears in the spreadsheet toast,
   and longer scrapes resume automatically. Gemini retries transient description
   failures up to three times. Use **Fill blank inventory descriptions** to
   retry missing descriptions for existing listings returned by the saved URL;
   this does not append new vehicles. The script processes the
   listings returned by that URL and follows every **Next page** link through
   the last page. Use separate search URLs for different inventory categories
   or filters. To fill only one blank description, select any cell in its row
   and choose **Fill selected row description**. This uses the row's Ottawa
   Chrysler vehicle URL directly, even without a saved search URL. The URL must
   contain a listing ID and match the Listing ID cell if it is populated. It
   does not replace an existing description or formula, and only updates the
   Description cell.
8. Select one vehicle row and choose **Price Tracker > Copy selected vehicle
   row**, then **Copy row**. The copied tab-separated row includes a price
   disclosure in its description; the sheet itself is unchanged. The price is
   read from the sheet when you click **Copy row**, not fetched live from the
   dealer. Run a price scan first if needed. A valid price, description, and
   salesperson settings are required. If the browser blocks clipboard access,
   press Command+C or Ctrl+C to copy the selected text shown in the dialog.

For each new copy, set the tracker tab, search URL and salesperson details,
authorize the script, and install the schedules from the intended user's
account. Scheduled and continuation triggers run as the account that created
them and use that account's Gemini key. Do not have multiple users install
the same schedules in one copy. Settings and API keys should be checked after
copying rather than assumed to have carried over.

To update shared logic, edit the library project and publish a new version.
Each bound project must select that version in its library settings; copies do
not automatically switch versions. Bound-script or HTML changes must also be
copied into each bound project. Test updates on a separate spreadsheet first.

The tracker tab must have a header row containing `Stock`, `URL`, and `Price`.
Add a `Listing ID` header to use **Fill blank Listing IDs**.
The inventory scraper requires the full 24-column scraper header row, including
`Listing ID`.
Price history records include a timestamp, stock number, vehicle, previous and
current prices, URL, and whether the row is a baseline or a price change.
Rows with a `Status` column get `Update Price` added alongside `Listed` when
their price changes. If a stock-number lookup confirms a vehicle is no longer
listed, `Gone` is added to its Status if it already contains `Sold`;
otherwise, `Review` is added. Existing status values are preserved.
Existing descriptions with an older OMVIC price line continue to have that line
updated when the price changes. Descriptions without that line are left alone.
Rows whose Status contains `Gone` are skipped during price scans.
This monitors vehicles already in the tracker; it does not add new inventory
rows. A blank tracker price is recorded as a baseline on the first successful
check.

## Workflow

1. Make and test changes in `development/`. Increment the changed script's
   `@version` before committing so Tampermonkey recognizes the update.
2. When ready, copy the approved changes to the corresponding script in
   `production/`, retain the development `@version`, and restore its production
   name and production update/download URLs.
3. Commit and push changes to the `main` branch.
4. In Tampermonkey, use **Check for updates** or wait for its scheduled update
   check.

Each script's `@updateURL` and `@downloadURL` point to its raw GitHub file in
its respective folder on the `main` branch without cache-busting query parameters.
Open an install link above and
choose **Install** in Tampermonkey.
