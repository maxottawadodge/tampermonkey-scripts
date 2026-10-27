# Tampermonkey scripts

This repository contains four Tampermonkey userscripts.

## Install

- [CDJR tools](https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/production/cdjr-tools.user.js)
- [DemandHub tools](https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/production/dhub-tools.user.js)
- [DealerSocket tools](https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/production/dsocket-tools.user.js)
- [Global phone links](https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/production/global-phone-links.user.js)

## Development

- [!DEV CDJR tools](https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/!DEV-cdjr-tools.user.js)
- [!DEV DemandHub tools](https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/!DEV-dhub-tools.user.js)
- [!DEV DealerSocket tools](https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/!DEV-dsocket-tools.user.js)
- [!DEV Global phone links](https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/!DEV-global-phone-links.user.js)

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
