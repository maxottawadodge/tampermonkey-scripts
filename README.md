# Tampermonkey scripts

This repository contains production and development Tampermonkey userscripts.

## Install

- <a href="https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/production/cdjr-tools.user.js" target="_blank" rel="noopener noreferrer">CDJR tools</a>
- <a href="https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/production/dhub-tools.user.js" target="_blank" rel="noopener noreferrer">DemandHub tools</a>
- <a href="https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/production/dsocket-tools.user.js" target="_blank" rel="noopener noreferrer">DealerSocket tools</a>
- <a href="https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/production/global-phone-links.user.js" target="_blank" rel="noopener noreferrer">Global phone links</a>

## Development

- <a href="https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/!DEV-cdjr-tools.user.js" target="_blank" rel="noopener noreferrer">!DEV CDJR tools</a>
- <a href="https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/!DEV-dhub-tools.user.js" target="_blank" rel="noopener noreferrer">!DEV DemandHub tools</a>
- <a href="https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/!DEV-dsocket-tools.user.js" target="_blank" rel="noopener noreferrer">!DEV DealerSocket tools</a>
- <a href="https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/!DEV-dsocket-auto-refresh.user.js" target="_blank" rel="noopener noreferrer">!DEV DealerSocket auto refresh</a>
- <a href="https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/!DEV-global-phone-links.user.js" target="_blank" rel="noopener noreferrer">!DEV Global phone links</a>
- <a href="https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/!DEV-marketplace-autofill.user.js" target="_blank" rel="noopener noreferrer">!DEV Marketplace Autofill</a>
- <a href="https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/!DEV-used-car-scraper.user.js" target="_blank" rel="noopener noreferrer">!DEV Used car scraper</a>

Development scripts have `!DEV` names and separate update URLs so they can be
installed alongside production scripts. Disable one environment when testing
changes that would otherwise run on the same page.

## Scheduled price tracking

The Google Apps Script in [google-apps-script/price-tracker.gs](./google-apps-script/price-tracker.gs)
checks each vehicle URL in the selected tracker tab, updates its `Price` cell,
and appends price changes to a `Price History` tab.

1. Open the tracker spreadsheet and choose **Extensions > Apps Script**.
2. Replace the editor contents with `google-apps-script/price-tracker.gs` and save.
3. Reload the spreadsheet. Select the tracker tab, then choose **Price Tracker >
   Set active tab as tracker**.
4. Choose **Price Tracker > Run price scan now** and approve the requested
   spreadsheet and external request permissions.
5. Choose **Price Tracker > Install scans (8 AM-8 PM, every 2 hours)**. Scans
   run about every two hours from 8 AM through 8 PM in the Apps Script project's
   time zone. Use **Run price scan now** to test it immediately.

The tracker tab must have a header row containing `Stock`, `URL`, and `Price`.
Price history records include a timestamp, stock number, vehicle, previous and
current prices, URL, and whether the row is a baseline or a price change.
Rows with a `Status` column get `Update Price` added alongside `Listed` when
their price changes. If a stock-number lookup confirms a vehicle is no longer
listed, `Gone` is added to its Status if it already contains `Sold`;
otherwise, `Review` is added. Existing status values are preserved.
Rows whose Status contains `Gone` are skipped during price scans.
This monitors vehicles already in the tracker; it does not add new inventory
rows. A blank tracker price is recorded as a baseline on the first successful
check.

## Workflow

1. Make and test changes in `development/`. Increment the changed script's
   `@version` before committing so Tampermonkey recognizes the update.
2. When ready, copy the approved changes to the corresponding script in
   `production/` and increment its `@version`.
3. Commit and push changes to the `main` branch.
4. In Tampermonkey, use **Check for updates** or wait for its scheduled update
   check.

Each script's `@updateURL` and `@downloadURL` point to its raw GitHub file in
its respective folder on the `main` branch. Open an install link above and
choose **Install** in Tampermonkey.
