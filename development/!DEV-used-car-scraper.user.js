// ==UserScript==
// @name         !DEV used car scraper
// @namespace    http://tampermonkey.net/
// @version      1.1
// @updateURL    https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/!DEV-used-car-scraper.user.js
// @downloadURL  https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/!DEV-used-car-scraper.user.js
// @description  Export used vehicle listings to Google Sheets or CSV
// @match        https://www.ottawachryslerjeepdodge.com/inventory.html*
// @match        https://www.ottawachryslerjeepdodge.com/new/inventory/search.html*
// @match        https://www.ottawachryslerjeepdodge.com/used/search.html*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const columns = [
        ['Name', vehicle => vehicle.name],
        ['Price', vehicle => vehicle.price],
        ['Mileage', vehicle => vehicle.mileage],
        ['Description', vehicle => vehicle.description]
    ];

    function cleanText(value) {
        return (value || '').replace(/\s+/g, ' ').trim();
    }

    function getPrice(card) {
        const priceText = cleanText(card.querySelector('.carPrice')?.textContent);
        const currentPrice = priceText.split(/\bwas\b/i)[0];
        const match = currentPrice.match(/\d[\d,]*(?:\.\d{1,2})?/);
        return match ? match[0].replace(/,/g, '') : '';
    }

    function getVehicleCards() {
        const vehicles = new Map();
        const inputs = document.querySelectorAll(
            'input[name="vehicledata"]'
        );

        for (const input of inputs) {
            const card = input.closest('.carBoxOuter');
            if (!card) continue;

            const listingLink = [...card.querySelectorAll('a[href]')].find(link =>
                /\/(?:used|occasion|new)\//i.test(link.pathname)
            );
            if (!listingLink) continue;

            const year = cleanText(input.dataset.year);
            const make = cleanText(input.dataset.make);
            const model = cleanText(input.dataset.model);
            const trim = cleanText(input.dataset.trim) ||
                cleanText(card.querySelector('.divTrim')?.textContent);
            const name = [year, make, model, trim].filter(Boolean).join(' ');
            const key = listingLink.href;
            if (!name || vehicles.has(key)) continue;

            vehicles.set(key, {
                name,
                price: getPrice(card),
                mileage: cleanText(card.querySelector('.s-km')?.textContent),
                url: key,
                description: ''
            });
        }

        return [...vehicles.values()];
    }

    function getDescription(document) {
        const model = cleanText(document.getElementById('specsModel')?.textContent);
        const description = document.getElementById('carDescriptionBody') ||
            document.querySelector('.carDescriptionBody');
        const html = description?.innerHTML || '';
        const keyFeatures = /Key Features\s*:/i.exec(html);
        let features = '';

        if (keyFeatures) {
            const remainingHtml = html.slice(keyFeatures.index + keyFeatures[0].length);
            const endOfFeatures = /(?:<br\b[^>]*>\s*){2,}/i.exec(remainingHtml);
            const featuresHtml = endOfFeatures
                ? remainingHtml.slice(0, endOfFeatures.index)
                : remainingHtml;
            const featureContainer = document.createElement('div');
            featureContainer.innerHTML = featuresHtml;
            featureContainer.querySelectorAll('br').forEach(br => {
                br.replaceWith(document.createTextNode('; '));
            });
            features = cleanText(featureContainer.textContent).replace(/;+/g, ';');
        }

        return [model, '----------', features].filter(Boolean).join('\n');
    }

    async function fetchDescription(vehicle) {
        const response = await fetch(vehicle.url, { credentials: 'same-origin' });
        if (!response.ok) {
            throw new Error(`Could not load ${vehicle.url}: HTTP ${response.status}`);
        }
        const html = await response.text();
        const detailDocument = new DOMParser().parseFromString(html, 'text/html');
        return getDescription(detailDocument);
    }

    async function scrapeVehicles(vehicles, onProgress) {
        let nextIndex = 0;
        let completed = 0;
        const errors = [];

        async function worker() {
            while (nextIndex < vehicles.length) {
                const index = nextIndex++;
                const vehicle = vehicles[index];
                try {
                    vehicle.description = await fetchDescription(vehicle);
                    if (!vehicle.description) {
                        throw new Error(`No description found at ${vehicle.url}`);
                    }
                } catch (error) {
                    vehicle.description = '';
                    errors.push(error);
                    console.error('Could not scrape vehicle description', error);
                }
                completed++;
                onProgress(completed, vehicles.length);
            }
        }

        await Promise.all(
            Array.from({ length: Math.min(3, vehicles.length) }, () => worker())
        );
        return errors;
    }

    function makeDelimitedText(vehicles, delimiter, quoteValues) {
        const rows = [
            columns.map(([label]) => label),
            ...vehicles.map(vehicle =>
                columns.map(([, getValue]) => getValue(vehicle))
            )
        ];

        return rows.map(row => row.map(value => {
            const text = value || '';
            if (!quoteValues) {
                return text.replace(/[\t\r\n]+/g, ' | ').trim();
            }
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
        status.textContent = 'Ready. Click Run Scrape.';
        let vehicles = [];
        let hasRun = false;

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

        const runButton = makeButton('Run Scrape', async () => {
            runButton.disabled = true;
            copyButton.disabled = true;
            downloadButton.disabled = true;
            status.textContent = 'Finding vehicle listings...';
            vehicles = getVehicleCards();
            if (!vehicles.length) {
                status.textContent = 'No vehicle listings found on this page.';
                runButton.disabled = false;
                return;
            }

            try {
                const errors = await scrapeVehicles(vehicles, (completed, total) => {
                    status.textContent = `Scraping descriptions: ${completed}/${total}`;
                });
                hasRun = true;
                copyButton.disabled = false;
                downloadButton.disabled = false;
                status.textContent = errors.length
                    ? `Scraped ${vehicles.length} vehicles; ${errors.length} descriptions failed.`
                    : `Scraped ${vehicles.length} vehicles. Ready to export.`;
            } finally {
                runButton.disabled = false;
            }
        });

        const copyButton = makeButton('Copy for Sheets', async () => {
            if (!hasRun || !vehicles.length) {
                status.textContent = 'Click Run Scrape before exporting.';
                return;
            }
            try {
                await navigator.clipboard.writeText(
                    makeDelimitedText(vehicles, '\t', false)
                );
                status.textContent =
                    `Copied ${vehicles.length} vehicles. Paste into Sheets.`;
            } catch (error) {
                console.error('Could not copy vehicle data', error);
                status.textContent = 'Copy failed. Try Download CSV instead.';
            }
        });
        const downloadButton = makeButton('Download CSV', () => {
        const downloadButton = makeButton('Download CSV', () => {
            if (!hasRun || !vehicles.length) {
                status.textContent = 'Click Run Scrape before exporting.';
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

        copyButton.disabled = true;
        downloadButton.disabled = true;
        panel.append(status, runButton, copyButton, downloadButton);
        document.body.appendChild(panel);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createPanel, { once: true });
    } else {
        createPanel();
    }
})();
