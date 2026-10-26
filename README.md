# Tampermonkey scripts

This repository keeps production and development copies of four userscripts.

## Choose an environment

Install only one environment at a time for each site. The development and
production scripts are separate Tampermonkey entries, but they run on the same
sites and can duplicate each other's changes if both are enabled.

In Tampermonkey, disable the currently enabled set, then install the scripts
from the `production` or `development` URLs below. Tampermonkey will check the
corresponding raw GitHub URL for updates.

### Production

- [CDJR tools](https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/production/cdjr-tools.user.js)
- [DemandHub tools](https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/production/dhub-tools.user.js)
- [DealerSocket tools](https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/production/dsocket-tools.user.js)
- [Global phone links](https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/production/global-phone-links.user.js)

### Development

- [CDJR tools (dev)](https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/cdjr-tools.user.js)
- [DemandHub tools (dev)](https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/dhub-tools.user.js)
- [DealerSocket tools (dev)](https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/dsocket-tools.user.js)
- [Global phone links (dev)](https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/global-phone-links.user.js)

## Workflow

1. Make and test changes in `development/`. Edit on GitHub or use GitHub
   Desktop to edit and commit the files locally. Increment that script's
   `@version` before committing so Tampermonkey recognizes the update.
2. Commit the development changes to GitHub.
3. Update the development Tampermonkey entry from its script's **Check for
   updates** action (or wait for its scheduled update check).
4. When the change is ready, copy the approved code into the matching
   `production/` script. Keep the production script's `@name` and update URL
   unchanged, and increment its `@version`.
5. Commit the production change to GitHub. Update the production Tampermonkey
   entry.

The `@updateURL` and `@downloadURL` in each script point to that environment's
raw file on the `main` branch. Open a link above and choose **Install** in
Tampermonkey. After a GitHub commit, open the Tampermonkey Dashboard and use
each script's **Check for updates** action, or wait for Tampermonkey's scheduled
update check.
