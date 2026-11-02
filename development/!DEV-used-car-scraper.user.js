// ==UserScript==
// @name         !DEV used car scraper
// @namespace    http://tampermonkey.net/
// @version      1.12
// @updateURL    https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/!DEV-used-car-scraper.user.js?v=1.12
// @downloadURL  https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/!DEV-used-car-scraper.user.js?v=1.12
// @description  Export used vehicle listings to Google Sheets or CSV
// @match        https://www.ottawachryslerjeepdodge.com/inventory.html*
// @match        https://www.ottawachryslerjeepdodge.com/new/inventory/search.html*
// @match        https://www.ottawachryslerjeepdodge.com/used/search.html*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      generativelanguage.googleapis.com
// ==/UserScript==

(function () {
    'use strict';

    const columns = [
        ['Name', vehicle => vehicle.name],
        ['Price', vehicle => vehicle.price],
        ['Mileage', vehicle => vehicle.mileage],
        ['Description', vehicle => vehicle.description],
        ['URL', vehicle => vehicle.url],
        ['Stock Number', vehicle => vehicle.stock],
        ['VIN', vehicle => vehicle.vin],
        ['Year', vehicle => vehicle.year],
        ['Make', vehicle => vehicle.make],
        ['Model', vehicle => vehicle.model],
        ['Trim', vehicle => vehicle.trim],
        ['Fuel Type', vehicle => vehicle.fuelType],
        ['Transmission Type', vehicle => vehicle.transmissionType]
    ];

    function cleanText(value) {
        return (value || '').replace(/\s+/g, ' ').trim();
    }

    function getPrice(card) {
        const priceText = cleanText(card.querySelector('.carPrice')?.textContent);
        const currentPrice = priceText.split(/\bwas\b/i)[0];
        const match = currentPrice.match(/\d[\d,]*(?:\.\d{1,2})?/);
        return match ? match[0] : '';
    }

    function getVehicleCards() {
        const vehicles = new Map();
        const inputs = document.querySelectorAll(
            'input[name="vehicledata"]'
        );

        for (const input of inputs) {
            const card = input.closest('.carBoxOuter');
            if (!card) continue;

            const carId = cleanText(input.dataset.carid);
            const listingLink = [...card.querySelectorAll('a[href]')].find(link =>
                /\/(?:used|occasion|new)\/[^/]*id\d+\.html$/i.test(link.pathname) &&
                (!carId || link.pathname.includes(`id${carId}.html`))
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
                year,
                make,
                model,
                trim,
                price: getPrice(card),
                mileage: cleanText(card.querySelector('.s-km')?.textContent),
                url: key,
                stock: cleanText(input.dataset.stockNumber),
                vin: cleanText(input.dataset.vin).toUpperCase(),
                description: '',
                fuelType: '',
                transmissionType: ''
            });
        }

        return [...vehicles.values()];
    }

    function getSpecValue(document, inputName, elementId) {
        const inputValue = document.querySelector(`input[name="${inputName}"]`)?.value;
        const elementValue = document.getElementById(elementId)?.textContent;
        return cleanText(inputValue || elementValue).replace(/^[^:]*:\s*/, '');
    }

    async function fetchVehicleDetails(vehicle) {
        const response = await fetch(vehicle.url, { credentials: 'same-origin' });
        if (!response.ok) {
            throw new Error(`Could not load ${vehicle.url}: HTTP ${response.status}`);
        }
        const html = await response.text();
        const detailDocument = new DOMParser().parseFromString(html, 'text/html');
        return {
            fuelType: getSpecValue(detailDocument, 'fuelType', 'specsFuel'),
            transmissionType: getSpecValue(
                detailDocument,
                'transmission',
                'specsTransmission'
            )
        };
    }

    function generateDescription(vehicle, apiKey) {
        const fields = [
            ['Year', vehicle.year],
            ['Make', vehicle.make],
            ['Model', vehicle.model],
            ['Trim', vehicle.trim],
            ['Price', vehicle.price ? `$${vehicle.price}` : ''],
            ['Mileage', vehicle.mileage],
            ['VIN', vehicle.vin]
        ];
        const vehicleDetails = fields
            .filter(([, value]) => value)
            .map(([label, value]) => `${label}: ${value}`)
            .join('\n');
        const prompt = [
            'Write one concise, natural-sounding used-vehicle sales description.',
            'Use only the vehicle information provided below. Do not invent features, condition, history, or specifications.',
            'Mention the year, make, model, trim, price, and mileage when provided.',
            'Do not mention color or provide a key-features list. Do not include the VIN in the description.',
            '',
            vehicleDetails
        ].join('\n');

        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': apiKey
                },
                data: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.3 }
                }),
                timeout: 30000,
                onload(response) {
                    let result;
                    try {
                        result = JSON.parse(response.responseText || '{}');
                    } catch {
                        reject(new Error('Gemini returned an invalid response.'));
                        return;
                    }

                    if (response.status < 200 || response.status >= 300) {
                        reject(new Error(
                            result.error?.message ||
                            `Gemini request failed with HTTP ${response.status}.`
                        ));
                        return;
                    }

                    const description = cleanText(
                        result.candidates?.[0]?.content?.parts
                            ?.map(part => part.text || '')
                            .join('')
                    );
                    if (!description) {
                        reject(new Error('Gemini returned an empty description.'));
                        return;
                    }
                    resolve(description);
                },
                onerror() {
                    reject(new Error('Could not connect to the Gemini API.'));
                },
                ontimeout() {
                    reject(new Error('Gemini description request timed out.'));
                }
            });
        });
    }

    async function scrapeVehicles(vehicles, apiKey, onProgress) {
        let nextIndex = 0;
        let completed = 0;
        const descriptionErrors = [];
        const detailErrors = [];

        async function worker() {
            while (nextIndex < vehicles.length) {
                const index = nextIndex++;
                const vehicle = vehicles[index];
                try {
                    Object.assign(vehicle, await fetchVehicleDetails(vehicle));
                } catch (error) {
                    vehicle.fuelType = '';
                    vehicle.transmissionType = '';
                    detailErrors.push(error);
                    console.error('Could not scrape vehicle details', error);
                }
                try {
                    vehicle.description = await generateDescription(vehicle, apiKey);
                } catch (error) {
                    vehicle.description = '';
                    descriptionErrors.push(error);
                    console.error(
                        `Could not generate description for ${vehicle.url}`,
                        error
                    );
                }
                completed++;
                onProgress(completed, vehicles.length);
            }
        }

        await Promise.all(
            Array.from({ length: Math.min(3, vehicles.length) }, () => worker())
        );
        return { descriptionErrors, detailErrors };
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
            const sanitized = quoteValues
                ? text
                : text.replace(/\t/g, ' ').trim();
            return quoteValues || /[\r\n"]/.test(sanitized)
                ? `"${sanitized.replace(/"/g, '""')}"`
                : sanitized;
        }).join(delimiter)).join('\r\n');
    }

    function createPanel() {
        if (document.getElementById('dev-used-car-scraper')) return;

        const panel = document.createElement('section');
        panel.id = 'dev-used-car-scraper';
        panel.style.cssText =
            'position:fixed;right:16px;bottom:16px;z-index:999999;' +
            'display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:10px;' +
            'max-width:calc(100vw - 52px);' +
            'background:#fff;border:1px solid #bbb;border-radius:6px;' +
            'box-shadow:0 2px 10px rgba(0,0,0,.2);font:13px Arial,sans-serif;';

        const status = document.createElement('span');
        status.setAttribute('aria-live', 'polite');
        status.textContent = GM_getValue('geminiApiKey', '')
            ? 'Gemini API key ready. Click Run Scrape.'
            : 'Add a Gemini API key, then click Run Scrape.';
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

        const apiKeyInput = document.createElement('input');
        apiKeyInput.type = 'password';
        apiKeyInput.autocomplete = 'off';
        apiKeyInput.placeholder = 'Gemini API key';
        apiKeyInput.setAttribute('aria-label', 'Gemini API key');
        apiKeyInput.style.cssText =
            'box-sizing:border-box;width:180px;padding:7px 8px;' +
            'border:1px solid #bbb;border-radius:4px;';
        const saveKeyButton = makeButton('Save key', () => {
            GM_setValue('geminiApiKey', apiKeyInput.value.trim());
            apiKeyInput.value = '';
            status.textContent = GM_getValue('geminiApiKey', '')
                ? 'Gemini API key saved in Tampermonkey.'
                : 'Gemini API key cleared.';
        });

        const runButton = makeButton('Run Scrape', async () => {
            const apiKey = String(GM_getValue('geminiApiKey', '')).trim();
            if (!apiKey) {
                status.textContent = 'Enter and save a Gemini API key first.';
                apiKeyInput.focus();
                return;
            }
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
                const { descriptionErrors, detailErrors } = await scrapeVehicles(
                    vehicles,
                    apiKey,
                    (completed, total) => {
                        status.textContent = `Generating descriptions: ${completed}/${total}`;
                    }
                );
                hasRun = true;
                copyButton.disabled = false;
                downloadButton.disabled = false;
                status.textContent = descriptionErrors.length || detailErrors.length
                    ? `Processed ${vehicles.length} vehicles; ${descriptionErrors.length} descriptions and ${detailErrors.length} detail lookups failed.`
                    : `Generated descriptions for ${vehicles.length} vehicles. Ready to export.`;
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
        panel.append(
            status,
            apiKeyInput,
            saveKeyButton,
            runButton,
            copyButton,
            downloadButton
        );
        document.body.appendChild(panel);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createPanel, { once: true });
    } else {
        createPanel();
    }
})();
