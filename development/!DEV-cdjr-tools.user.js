// ==UserScript==
// @name         !DEV cdjr tools
// @namespace    http://tampermonkey.net/
// @version      5.17
// @updateURL   https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/!DEV-cdjr-tools.user.js?v=5.17
// @downloadURL https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/!DEV-cdjr-tools.user.js?v=5.17
// @description  Inventory search, VIN decode, window sticker, and copy tools
// @match        *://*.ottawachryslerjeepdodge.com/*
// @grant        none
// ==/UserScript==

(function () {

    'use strict';

    function getInventoryFilterState(search = window.location.search) {
        const filterId = new URLSearchParams(search).get('filterid');
        const match = filterId?.match(/^a9b([123]+)q0-10(s47Ex0|x0)-0-0(?:\s|$)/);
        return { filterId, match };
    }

    function createSearchBar() {
        if (document.getElementById('ocdj-search')) return;

        const filterState = getInventoryFilterState(window.location.search);
        const filterMatch = filterState.match;
        const urlCategoryIds = filterMatch ? new Set(filterMatch[1]) : null;

        const style = document.createElement('style');
        style.textContent = `
            #ocdj-search-container {
                position: fixed;
                top: 10px;
                right: 10px;
                z-index: 999999;
                box-sizing: border-box;
                max-width: calc(100vw - 20px);
                padding: 6px;
                border: 1px solid #ccc;
                border-radius: 8px;
                background: #fff;
                box-shadow: 0 2px 10px rgba(0,0,0,.2);
                font: 13px Arial, sans-serif;
            }
            #ocdj-search-row {
                display: flex;
                align-items: center;
                gap: 6px;
            }
            #ocdj-search-mobile-toggle {
                display: none;
            }
            #ocdj-search {
                box-sizing: border-box;
                width: clamp(120px, 18vw, 200px);
                min-width: 0;
                padding: 5px 6px;
                font: inherit;
            }
            #ocdj-search-button,
            #ocdj-search-filters summary {
                padding: 5px 8px;
                cursor: pointer;
                white-space: nowrap;
            }
            #ocdj-search-filters {
                position: relative;
            }
            #ocdj-search-filter-options {
                position: absolute;
                top: calc(100% + 8px);
                right: 0;
                display: none;
                gap: 10px;
                padding: 8px;
                border: 1px solid #ccc;
                border-radius: 6px;
                background: #fff;
                box-shadow: 0 2px 8px rgba(0,0,0,.18);
                white-space: nowrap;
            }
            #ocdj-search-filters[open] #ocdj-search-filter-options {
                display: flex;
            }
            #ocdj-search-filter-options label {
                display: flex;
                align-items: center;
                gap: 2px;
            }
            @media (max-width: 600px) {
                #ocdj-search-container {
                    top: 0;
                    right: 0;
                    left: 0;
                    width: 100%;
                    max-width: none;
                    padding: 8px 10px;
                    border-radius: 0 0 8px 8px;
                }
                #ocdj-search-row {
                    padding-right: 38px;
                }
                #ocdj-search {
                    flex: 1;
                    width: 100%;
                    font-size: 16px;
                }
                #ocdj-search-button {
                    display: none;
                }
                #ocdj-search-mobile-toggle {
                    position: absolute;
                    top: 8px;
                    right: 10px;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    width: 32px;
                    height: 32px;
                    padding: 0;
                    border: 0;
                    border-radius: 5px;
                    background: #2d6cdf;
                    color: #fff;
                    font-size: 19px;
                    cursor: pointer;
                }
                #ocdj-search-container.mobile-collapsed {
                    left: auto;
                    width: auto;
                    padding: 5px;
                    border-radius: 8px;
                }
                #ocdj-search-container.mobile-collapsed #ocdj-search-row {
                    display: none;
                }
                #ocdj-search-container.mobile-collapsed #ocdj-search-mobile-toggle {
                    position: static;
                    width: 38px;
                    height: 34px;
                }
                #ocdj-search-filter-options {
                    flex-wrap: wrap;
                    max-width: calc(100vw - 40px);
                    white-space: normal;
                }
            }
        `;
        document.head.appendChild(style);

        const container = document.createElement('div');
        container.id = 'ocdj-search-container';
        const mobileCollapsed =
            localStorage.getItem('ocdj-search-mobile-collapsed') === 'true';
        if (mobileCollapsed) {
            container.classList.add('mobile-collapsed');
        }

        const mobileToggle = document.createElement('button');
        mobileToggle.id = 'ocdj-search-mobile-toggle';
        mobileToggle.type = 'button';
        mobileToggle.textContent = mobileCollapsed ? '⌕' : '×';
        mobileToggle.title = mobileCollapsed
            ? 'Expand inventory search'
            : 'Collapse inventory search';
        mobileToggle.setAttribute('aria-label', mobileToggle.title);
        mobileToggle.setAttribute('aria-expanded', String(!mobileCollapsed));

        const searchRow = document.createElement('div');
        searchRow.id = 'ocdj-search-row';

        const input = document.createElement('input');
        input.id = 'ocdj-search';
        input.type = 'text';
        input.placeholder = 'Search inventory...';
        input.setAttribute('aria-label', 'Search inventory');

        const categoryGroup = document.createElement('div');
        categoryGroup.style.cssText =
            'display:flex;align-items:center;gap:6px;';
        const categories = [
            { name: 'New', id: '3' },
            { name: 'Used', id: '1' },
            { name: 'Demo', id: '2' }
        ].map(category => {
            const label = document.createElement('label');

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = urlCategoryIds
                ? urlCategoryIds.has(category.id)
                : true;
            label.append(checkbox, document.createTextNode(category.name));
            categoryGroup.appendChild(label);

            return { ...category, checkbox };
        });
        const localOnlyLabel = document.createElement('label');
        const localOnlyCheckbox = document.createElement('input');
        localOnlyCheckbox.type = 'checkbox';
        localOnlyCheckbox.checked = filterMatch
            ? filterMatch[2] === 's47Ex0'
            : true;
        localOnlyCheckbox.setAttribute('aria-label', 'Local search only');
        localOnlyLabel.append(
            localOnlyCheckbox,
            document.createTextNode('Local only')
        );

        const filters = document.createElement('details');
        filters.id = 'ocdj-search-filters';
        const filtersSummary = document.createElement('summary');
        filtersSummary.textContent = 'Filters';
        const filterOptions = document.createElement('div');
        filterOptions.id = 'ocdj-search-filter-options';
        filterOptions.append(categoryGroup, localOnlyLabel);
        filters.append(filtersSummary, filterOptions);

        const button = document.createElement('button');
        button.id = 'ocdj-search-button';
        button.textContent = 'Search';
        button.type = 'button';

        function search() {
            const term = input.value.trim();

            const categoryIds = categories
                .filter(category => category.checkbox.checked)
                .map(category => category.id)
                .sort()
                .join('');
            if (!categoryIds) return;

            const searchFilter = term
                ? '+' + btoa(JSON.stringify([{
                    tsearch: [{
                        n: 'fieldsearch',
                        v: term.toLowerCase(),
                        s: 1
                    }]
                }]))
                : '';
            const dealerFilter = localOnlyCheckbox.checked ? 's47Ex0' : 'x0';
            const prefix = `a9b${categoryIds}q0-10${dealerFilter}-0-0`;

            window.location.href =
                'https://www.ottawachryslerjeepdodge.com/inventory.html?filterid=' +
                prefix + searchFilter;
        }

        button.addEventListener('click', search);
        input.addEventListener('keydown', event => {
            if (event.key === 'Enter') search();
        });
        document.addEventListener('keydown', event => {
            if (event.ctrlKey && event.key.toLowerCase() === 'k') {
                event.preventDefault();
                input.focus();
                input.select();
            }

            if (event.key === '/' &&
                document.activeElement.tagName !== 'INPUT' &&
                document.activeElement.tagName !== 'TEXTAREA') {
                event.preventDefault();
                input.focus();
                input.select();
            }
        });

        mobileToggle.addEventListener('click', () => {
            const collapsed = container.classList.toggle('mobile-collapsed');
            localStorage.setItem(
                'ocdj-search-mobile-collapsed',
                String(collapsed)
            );
            mobileToggle.textContent = collapsed ? '⌕' : '×';
            mobileToggle.title = collapsed
                ? 'Expand inventory search'
                : 'Collapse inventory search';
            mobileToggle.setAttribute('aria-label', mobileToggle.title);
            mobileToggle.setAttribute('aria-expanded', String(!collapsed));
        });

        searchRow.append(input, button, filters);
        container.append(searchRow, mobileToggle);
        document.body.appendChild(container);

        let lastObservedFilterId = filterState.filterId;
        function syncFiltersFromUrl() {
            const currentFilterState = getInventoryFilterState(window.location.search);
            if (currentFilterState.filterId === lastObservedFilterId) return;
            lastObservedFilterId = currentFilterState.filterId;
            if (!currentFilterState.match) return;

            const selectedCategoryIds = new Set(currentFilterState.match[1]);
            categories.forEach(category => {
                category.checkbox.checked = selectedCategoryIds.has(category.id);
            });
            localOnlyCheckbox.checked = currentFilterState.match[2] === 's47Ex0';
        }

        const filterObserver = new MutationObserver(syncFiltersFromUrl);
        filterObserver.observe(document.body, { childList: true, subtree: true });
        window.addEventListener('popstate', syncFiltersFromUrl);
        window.setTimeout(() => {
            if (window.innerWidth > 600) input.focus();
        }, 250);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createSearchBar, { once: true });
    } else {
        createSearchBar();
    }

    function getVINFromText(text) {
        const match = text.match(/\b[A-HJ-NPR-Z0-9]{17}\b/);
        return match ? match[0] : null;
    }

    function getVIN() {
        const vinInput = document.querySelector('input[data-vin]');

        if (vinInput?.dataset.vin) {
            return vinInput.dataset.vin;
        }

        const scripts = document.querySelectorAll(
            'script[type="application/ld+json"]'
        );

        for (const script of scripts) {

            try {

                const data = JSON.parse(script.textContent);

                if (data?.vehicleIdentificationNumber) {
                    return data.vehicleIdentificationNumber;
                }

                if (Array.isArray(data)) {

                    for (const item of data) {

                        if (item?.vehicleIdentificationNumber) {
                            return item.vehicleIdentificationNumber;
                        }
                    }
                }

            } catch (e) {}
        }

        return getVINFromText(document.body.textContent || '');
    }

    function getStockNumber() {
        const stockElement = document.querySelector('[data-stock-number]');
        const stockNumber = stockElement?.dataset.stockNumber?.trim();

        if (stockNumber) {
            return stockNumber;
        }

        const match = (document.body.textContent || '').match(
            /\bStock\s*(?:#|number|no\.?)\s*:?\s*([A-Z0-9-]+)/i
        );

        return match ? match[1] : null;
    }

    const cdjrWmis = new Set([
        '1C3', '1C4', '1C6',
        '2C3', '2C4', '2C7',
        '3C3', '3C4', '3C6',
        'ZAC', 'ZFA'
    ]);

    function isCDJR(vin) {

        const wmi = vin.substring(0, 3).toUpperCase();

        return cdjrWmis.has(wmi);
    }

    function copyValue(value, button, label) {

        navigator.clipboard.writeText(value)
            .then(() => {

                const original = button.textContent;

                button.textContent = '✓';

                setTimeout(() => {
                    button.textContent = original;
                }, 1250);

            })
            .catch(() => {
                alert(`Failed to copy ${label}`);
            });
    }

    function copyVIN(vin, button) {
        copyValue(vin, button, 'VIN');
    }

    async function decodeVIN(vin) {

        try {

            const response = await fetch(
                `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVin/${vin}?format=json`
            );

            const json = await response.json();

            const rows = json.Results.filter(row =>
                row.Value &&
                row.Value !== '0' &&
                row.Value !== 'Not Applicable'
            );

            const popup = window.open('', '_blank');

            popup.document.write(`
<!DOCTYPE html>
<html>
<head>
<title>${vin}</title>

<style>

body{
    font-family:Arial,sans-serif;
    max-width:1400px;
    margin:20px auto;
    padding:20px;
    background:#f5f5f5;
}

table{
    width:100%;
    border-collapse:collapse;
    background:white;
}

td{
    border:1px solid #ddd;
    padding:8px;
}

td:first-child{
    width:350px;
    font-weight:bold;
    background:#fafafa;
}

</style>
</head>

<body>

<h1>${vin}</h1>

<table>

${rows.map(row => `
<tr>
<td>${row.Variable}</td>
<td>${row.Value}</td>
</tr>
`).join('')}

</table>

</body>
</html>
`);

            popup.document.close();

        } catch (error) {

            console.error(error);
            alert('VIN Decode Failed');
        }
    }

    function makeMiniButton(text, color, clickHandler) {

        const button = document.createElement('button');

        button.textContent = text;

        button.style.cssText = `
            background:${color};
            color:#fff;
            border:none;
            border-radius:4px;
            padding:2px 4px;
            min-height:30px;
            font-family: verdana;
            line-height:1;
            font-size:8px;
            font-weight:600;
            cursor:pointer;
            white-space:nowrap;
        `;

        button.addEventListener('click', clickHandler);

        return button;
    }

    function handleInventoryPage(cards = document.querySelectorAll('.carBoxOuter')) {

        const cardCount = cards?.length ?? cards?.size ?? 0;

        if (cardCount === 0) {
            return false;
        }

        cards.forEach(card => {

            if (card.querySelector('.vin-tools-row')) {
                return;
            }

            const vinInput = card.querySelector('input[data-vin]');

            if (!vinInput) {
                return;
            }

            const vin = vinInput.dataset.vin;
            const stockNumber = vinInput.dataset.stockNumber;

            if (!vin || vin.length !== 17) {
                return;
            }

            const linkArea =
                card.querySelector('.group-lc.carLinks') ||
                card.querySelector('.carLinks');

            if (!linkArea) {
                return;
            }

            const toolbar = document.createElement('div');

            toolbar.className = 'vin-tools-row -p flex-evenly';

            toolbar.style.cssText = `
                display:flex;
                justify-content:center;
                align-items:center;
                gap:2px;
                flex-wrap:nowrap;
                white-space:nowrap;
                padding-bottom: 0px;
            `;

            if (isCDJR(vin)) {

                toolbar.appendChild(
                    makeMiniButton(
                        'Sticker',
                        '#c64545',
                        () => window.open(
                            `https://www.chrysler.com/hostd/windowsticker/getWindowStickerPdf.do?vin=${vin}`,
                            '_blank'
                        )
                    )
                );
            }

            toolbar.appendChild(
                makeMiniButton(
                    'Decode',
                    '#2d6cdf',
                    () => decodeVIN(vin)
                )
            );

            toolbar.appendChild(
                makeMiniButton(
                    'CopyVIN',
                    '#2f8f5b',
                    function () {
                        copyVIN(vin, this);
                    }
                )
            );

            if (stockNumber) {
                toolbar.appendChild(
                    makeMiniButton(
                        'CopyStock',
                        '#8a5a2b',
                        function () {
                            copyValue(stockNumber, this, 'stock number');
                        }
                    )
                );
            }

            linkArea.insertBefore(
                toolbar,
                linkArea.firstChild
            );

        });

        return true;
    }

    function createFloatingButton(
        text,
        color,
        top,
        clickHandler
    ) {

        const button = document.createElement('button');

        button.textContent = text;

        button.style.cssText = `
            position:fixed;
            top:${top}px;
            right:15px;
            z-index:999999;
            background:${color};
            color:white;
            border:none;
            border-radius:5px;
            padding:6px 12px;
            font-size:12px;
            font-weight:600;
            cursor:pointer;
            opacity:.85;
        `;

        button.addEventListener('click', clickHandler);

        document.body.appendChild(button);

        return button;
    }

    if (handleInventoryPage()) {
        const changedCards = new Set();
        let updateScheduled = false;

        const inventoryObserver = new MutationObserver(records => {
            for (const record of records) {
                const target = record.target.nodeType === Node.ELEMENT_NODE
                    ? record.target
                    : record.target.parentElement;
                const targetCard = target?.closest('.carBoxOuter');

                if (targetCard) {
                    changedCards.add(targetCard);
                }

                for (const node of record.addedNodes) {
                    if (node.nodeType !== Node.ELEMENT_NODE) {
                        continue;
                    }

                    if (node.matches('.carBoxOuter')) {
                        changedCards.add(node);
                    }

                    node.querySelectorAll('.carBoxOuter').forEach(card => {
                        changedCards.add(card);
                    });
                }
            }

            if (!changedCards.size || updateScheduled) {
                return;
            }

            updateScheduled = true;
            requestAnimationFrame(() => {
                updateScheduled = false;
                const cardsToUpdate = [...changedCards];
                changedCards.clear();
                handleInventoryPage(cardsToUpdate);
            });
        });

        inventoryObserver.observe(document.body, {
            childList: true,
            subtree: true
        });

        return;
    }

    const vin = getVIN();
    const stockNumber = getStockNumber();

    if (!vin) {
        return;
    }

    let top = 100;

    if (isCDJR(vin)) {
        createFloatingButton(
            'Window Sticker',
            '#c64545',
            top,
            () => window.open(
                `https://www.chrysler.com/hostd/windowsticker/getWindowStickerPdf.do?vin=${vin}`,
                '_blank'
            )
        );
        top += 35;
    }

    createFloatingButton(
        'VIN Decode',
        '#2d6cdf',
        top,
        () => decodeVIN(vin)
    );
    top += 35;

    let copyBtn;
    copyBtn = createFloatingButton(
        'Copy VIN',
        '#2f8f5b',
        top,
        () => copyVIN(vin, copyBtn)
    );

    if (stockNumber) {
        top += 35;
        createFloatingButton(
            'Copy Stock',
            '#8a5a2b',
            top,
            function () {
                copyValue(stockNumber, this, 'stock number');
            }
        );
    }

})();