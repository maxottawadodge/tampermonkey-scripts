// ==UserScript==
// @name         !DEV used car scraper
// @namespace    http://tampermonkey.net/
// @version      1.0
// @updateURL    https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/!DEV-used-car-scraper.user.js
// @downloadURL  https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/!DEV-used-car-scraper.user.js
// @description  Export used vehicle listings to Google Sheets or CSV
// @match        https://www.ottawachryslerjeepdodge.com/inventory.html*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const columns = [
        ['Condition', vehicle => vehicle.condition],
        ['Year', vehicle => vehicle.year],
        ['Make', vehicle => vehicle.make],
        ['Model', vehicle => vehicle.model],
        ['Trim', vehicle => vehicle.trim],
        ['Price', vehicle => vehicle.price],
        ['Mileage', vehicle => vehicle.mileage],
        ['Stock Number', vehicle => vehicle.stock],
        ['VIN', vehicle => vehicle.vin],
        ['Listing URL', vehicle => vehicle.url]
    ];

    function cleanText(value) {
        return (value || '').replace(/\s+/g, ' ').trim();
    }

    function getVehicleCards() {
        const vehicles = new Map();
        const inputs = document.querySelectorAll(
            'input[name="vehicledata"][data-vin]'
        );

        for (const input of inputs) {
            const vin = cleanText(input.dataset.vin).toUpperCase();
            if (!vin || vehicles.has(vin)) continue;

            const card = input.closest('.carBoxOuter');
            if (!card) continue;

            const listingLink = [...card.querySelectorAll('a[href]')].find(link =>
                /\/(?:used|occasion)\//i.test(link.pathname)
            );
            vehicles.set(vin, {
                condition: cleanText(input.dataset.condition),
                year: cleanText(input.dataset.year),
                make: cleanText(input.dataset.make),
                model: cleanText(input.dataset.model),
                trim: cleanText(input.dataset.trim) ||
                    cleanText(card.querySelector('.divTrim')?.textContent),
                price: cleanText(card.querySelector('.carPrice')?.textContent),
                mileage: cleanText(card.querySelector('.s-km')?.textContent),
                stock: cleanText(input.dataset.stockNumber),
                vin,
                url: listingLink?.href || ''
            });
        }

        return [...vehicles.values()];
    }

    function makeDelimitedText(vehicles, delimiter, quoteValues) {
        const rows = [
            columns.map(([label]) => label),
            ...vehicles.map(vehicle =>
                columns.map(([, getValue]) => getValue(vehicle))
            )
        ];

        return rows.map(row => row.map(value => {
            const text = cleanText(value);
            if (!quoteValues) return text.replace(/[\t\r\n]/g, ' ');
            return `"${text.replace(/"/g, '""')}"`;
        }).join(delimiter)).join('\r\n');
    }

    function createPanel() {
        if (document.getElementById('dev-used-car-scraper')) return;

        const panel = document.createElement('section');
        panel.id = 'dev-used-car-scraper';
        panel.style.cssText =
            'position:fixed;right:16px;bottom:16px;z-index:999999;' +
            'display:flex;align-items:center;gap:8px;padding:10px;' +
            'background:#fff;border:1px solid #bbb;border-radius:6px;' +
            'box-shadow:0 2px 10px rgba(0,0,0,.2);font:13px Arial,sans-serif;';

        const status = document.createElement('span');
        status.setAttribute('aria-live', 'polite');

        function makeButton(label, handler) {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = label;
            button.style.cssText =
                'padding:7px 10px;border:0;border-radius:4px;' +
                'background:#2d6cdf;color:#fff;font-weight:600;cursor:pointer;';
            button.addEventListener('click', handler);
            return button;
        }

        const copyButton = makeButton('Copy for Sheets', async () => {
            const vehicles = getVehicleCards();
            if (!vehicles.length) {
                status.textContent = 'No vehicle listings found.';
                return;
            }

            try {
                await navigator.clipboard.writeText(
                    makeDelimitedText(vehicles, '\t', false)
                );
                status.textContent = `Copied ${vehicles.length} vehicles. Paste into Sheets.`;
            } catch (error) {
                console.error('Could not copy vehicle data', error);
                status.textContent = 'Copy failed. Try Download CSV instead.';
            }
        });

        const downloadButton = makeButton('Download CSV', () => {
            const vehicles = getVehicleCards();
            if (!vehicles.length) {
                status.textContent = 'No vehicle listings found.';
                return;
            }

            const blob = new Blob(
                ['\uFEFF', makeDelimitedText(vehicles, ',', true)],
                { type: 'text/csv;charset=utf-8' }
            );
            const downloadUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = 'ottawa-used-vehicles.csv';
            link.click();
            setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
            status.textContent = `Downloaded ${vehicles.length} vehicles.`;
        });

        panel.append(status, copyButton, downloadButton);
        document.body.appendChild(panel);
        updateCount();

        function updateCount() {
            const count = getVehicleCards().length;
            status.textContent = `${count} vehicles found`;
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createPanel, { once: true });
    } else {
        createPanel();
    }
})();
