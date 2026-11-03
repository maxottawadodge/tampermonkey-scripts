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
- <a href="https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/!DEV-global-phone-links.user.js" target="_blank" rel="noopener noreferrer">!DEV Global phone links</a>
- <a href="https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/!DEV-marketplace-listing.user.js" target="_blank" rel="noopener noreferrer">!DEV Marketplace listing helper</a>
- <a href="https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/!DEV-used-car-scraper.user.js" target="_blank" rel="noopener noreferrer">!DEV Used car scraper</a>

Development scripts have `!DEV` names and separate update URLs so they can be
installed alongside production scripts. Disable one environment when testing
changes that would otherwise run on the same page.

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
