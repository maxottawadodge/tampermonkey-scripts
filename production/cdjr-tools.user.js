// ==UserScript==
// @name         cdjr tools
// @namespace    http://tampermonkey.net/
// @version      5.1
// @updateURL   https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/production/cdjr-tools.user.js
// @downloadURL https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/production/cdjr-tools.user.js
// @description  Inventory search, VIN decode, window sticker, and copy tools
// @match        *://*.ottawachryslerjeepdodge.com/*
// @grant        none
// ==/UserScript==

(function () {

    'use strict';

    function createSearchBar() {
        if (document.getElementById('ocdj-search')) return;

        const container = document.createElement('div');
        container.style.cssText =
            'position:fixed;top:10px;right:10px;z-index:999999;background:#fff;' +
            'padding:8px;border:1px solid #ccc;border-radius:8px;' +
            'box-shadow:0 2px 10px rgba(0,0,0,.2);display:flex;' +
            'align-items:center;gap:6px;';

        const input = document.createElement('input');
        input.id = 'ocdj-search';
        input.type = 'text';
        input.placeholder = 'Search inventory...';
        input.style.cssText = 'padding:6px;width:220px;';

        const categoryGroup = document.createElement('div');
        categoryGroup.style.cssText = 'display:flex;align-items:center;gap:6px;';
        const categories = [
            { name: 'New', id: '3' },
            { name: 'Used', id: '2' },
            { name: 'Demo', id: '1' }
        ].map(category => {
            const label = document.createElement('label');
            label.style.cssText = 'display:flex;align-items:center;gap:2px;';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = true;
            label.append(checkbox, document.createTextNode(category.name));
            categoryGroup.appendChild(label);

            return { ...category, checkbox };
        });

        const button = document.createElement('button');
        button.textContent = 'Search';
        button.style.cssText = 'padding:6px 10px;cursor:pointer;';

        function search() {
            const term = input.value.trim();
            if (!term) return;

            const categoryIds = categories
                .filter(category => category.checkbox.checked)
                .map(category => category.id)
                .sort()
                .join('');
            if (!categoryIds) return;

            const filter = [{
                tsearch: [{
                    n: 'fieldsearch',
                    v: term.toLowerCase(),
                    s: 1
                }]
            }];
            const encoded = btoa(JSON.stringify(filter));
            const prefix = `a9b${categoryIds}q0-10x0-0-0+`;

            window.location.href =
                'https://www.ottawachryslerjeepdodge.com/inventory.html?filterid=' +
                prefix + encoded;
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

        container.append(input, categoryGroup, button);
        document.body.appendChild(container);
        window.setTimeout(() => input.focus(), 250);
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
