# Tampermonkey scripts

This repository contains four Tampermonkey userscripts.

## Install

- [CDJR tools](https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/production/cdjr-tools.user.js)
- [DemandHub tools](https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/production/dhub-tools.user.js)
- [DealerSocket tools](https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/production/dsocket-tools.user.js)
- [Global phone links](https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/production/global-phone-links.user.js)

## Workflow

1. Edit and test the scripts in `production/`.
2. Increment the changed script's `@version` so Tampermonkey recognizes the
   update.
3. Commit and push the changes to the `main` branch.
4. In the Tampermonkey Dashboard, use **Check for updates**, or wait for its
   scheduled update check.

Each script's `@updateURL` and `@downloadURL` point to its raw GitHub file in
`production/` on the `main` branch. Open an install link above and choose
**Install** in Tampermonkey.
