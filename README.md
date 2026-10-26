# Tampermonkey scripts

This repository keeps production and development copies of four userscripts.

## Choose an environment

Install only one environment at a time for each site. The development and
production scripts are separate Tampermonkey entries, but they run on the same
sites and can duplicate each other's changes if both are enabled.

In Tampermonkey, disable the currently enabled set, then install the scripts
from the `production` or `development` folder using the links below. Tampermonkey
will check the corresponding raw GitHub URL for updates.

### Production

- [CDJR tools](./production/cdjr-tools.user.js)
- [DemandHub tools](./production/dhub-tools.user.js)
- [DealerSocket tools](./production/dsocket-tools.user.js)
- [Global phone links](./production/global-phone-links.user.js)

### Development

- [CDJR tools (dev)](./development/cdjr-tools.user.js)
- [DemandHub tools (dev)](./development/dhub-tools.user.js)
- [DealerSocket tools (dev)](./development/dsocket-tools.user.js)
- [Global phone links (dev)](./development/global-phone-links.user.js)

## Workflow

1. Make and test changes in `development/`.
2. Commit and push the development changes to GitHub.
3. Update the development Tampermonkey entry from its script's **Check for
   updates** action (or wait for its scheduled update check).
4. When the change is ready, copy the approved code into the matching
   `production/` script. Keep the production script's `@name` and update URL
   unchanged, and increment its `@version`.
5. Commit and push the production change. Update the production Tampermonkey
   entry.

The `@updateURL` and `@downloadURL` in each script point to that environment's
raw file on the `main` branch. To install a script, open its raw GitHub URL and
choose **Install** in Tampermonkey.
