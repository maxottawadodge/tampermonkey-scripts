// ==UserScript==
// @name         !DEV Marketplace Autofill
// @namespace    http://tampermonkey.net/
// @version      1.15
// @updateURL    https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/!DEV-marketplace-autofill.user.js?v=1.15
// @downloadURL  https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/!DEV-marketplace-autofill.user.js?v=1.15
// @description  Autofill Facebook Marketplace vehicle listings from copied spreadsheet rows
// @match        https://www.facebook.com/marketplace/create/vehicle*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const panelId = 'dev-marketplace-autofill';
    const scraperHeaders = [
        'Status',
        'Listed On',
        'Mrkt',
        'Stock',
        'Vehicle Type',
        'URL',
        'Year',
        'Make',
        'Model',
        'Trim',
        'Mileage',
        'Price',
        'Body Style',
        'Ext',
        'Ext Long',
        'Int',
        'Int Long',
        'Fuel Type',
        'Transmission',
        'Description',
        'VIN',
        'Condition',
        'Scraped On'
    ];
    const fuelTypes = [
        'Diesel',
        'Electric',
        'Gasoline',
        'Flex',
        'Hybrid',
        'Petrol',
        'Plug-in hybrid',
        'Other'
    ];

    function normalize(value) {
        return (value || '').replace(/\s+/g, ' ').trim().toLowerCase();
    }

    function normalizeFuelType(value) {
        const normalized = normalize(value);
        if (normalized === 'gas') return 'Gasoline';
        return fuelTypes.find(option => normalize(option) === normalized) ||
            (normalized ? 'Other' : '');
    }

    function parseTsv(text) {
        const rows = [];
        let row = [];
        let value = '';
        let quoted = false;

        for (let index = 0; index < text.length; index++) {
            const character = text[index];
            if (character === '"') {
                if (quoted && text[index + 1] === '"') {
                    value += '"';
                    index++;
                } else {
                    quoted = !quoted;
                }
            } else if (character === '\t' && !quoted) {
                row.push(value);
                value = '';
            } else if ((character === '\n' || character === '\r') && !quoted) {
                if (character === '\r' && text[index + 1] === '\n') index++;
                row.push(value);
                if (row.some(cell => cell.trim())) rows.push(row);
                row = [];
                value = '';
            } else {
                value += character;
            }
        }

        row.push(value);
        if (row.some(cell => cell.trim())) rows.push(row);
        if (quoted) throw new Error('The copied row has an unmatched quote.');
        return rows;
    }

    function parseHtmlTable(html) {
        const clipboardDocument = new DOMParser().parseFromString(html, 'text/html');

        for (const table of clipboardDocument.querySelectorAll('table')) {
            const tableRows = [...table.querySelectorAll('tr')]
                .map(row => [...row.cells])
                .filter(row => row.length);
            const headerIndex = tableRows.findIndex(row => {
                const headers = row.map(cell => normalize(cell.textContent));
                return headers.includes('status') &&
                    headers.includes('year') &&
                    headers.includes('make') &&
                    headers.includes('model');
            });

            if (headerIndex !== -1) {
                const headers = tableRows[headerIndex]
                    .map(cell => cell.innerText || cell.textContent || '');
                return [
                    headers,
                    ...tableRows.slice(headerIndex + 1)
                        .filter(row => row.some(cell => cell.textContent.trim()))
                        .map(row => row.map((cell, index) => {
                            const header = normalize(headers[index]);
                            const link = cell.querySelector('a[href]');
                            return link && (header === 'listed on' || header === 'url')
                                ? link.href
                                : cell.innerText || cell.textContent || '';
                        }))
                ];
            }

            const dataRow = tableRows.find(row => row.length === scraperHeaders.length);
            if (dataRow) {
                return [dataRow.map((cell, index) => {
                    const link = cell.querySelector('a[href]');
                    return link && (index === 1 || index === 5)
                        ? link.href
                        : cell.innerText || cell.textContent || '';
                })];
            }
        }

        return null;
    }

    function serializeTsv(rows) {
        return rows.map(row => row.map(value => {
            const cell = String(value).replace(/"/g, '""');
            return /["\t\r\n]/.test(cell) ? `"${cell}"` : cell;
        }).join('\t')).join('\n');
    }

    async function readClipboard() {
        const clipboard = navigator.clipboard;
        if (typeof clipboard.read !== 'function') return clipboard.readText();

        const items = await clipboard.read();
        let plainText = '';
        for (const item of items) {
            if (item.types.includes('text/html')) {
                const html = await (await item.getType('text/html')).text();
                const rows = parseHtmlTable(html);
                if (rows) return serializeTsv(rows);
            }
            if (!plainText && item.types.includes('text/plain')) {
                plainText = await (await item.getType('text/plain')).text();
            }
        }
        return plainText || clipboard.readText();
    }

    function trimTrailingEmptyCells(row) {
        const trimmed = [...row];
        while (trimmed.length && !trimmed[trimmed.length - 1].trim()) {
            trimmed.pop();
        }
        return trimmed;
    }

    function getVehicleFromClipboard(text) {
        const rows = parseTsv(text);
        if (!rows.length) throw new Error('The clipboard is empty.');

        let values;
        const headerRow = trimTrailingEmptyCells(rows[0]);
        const firstRowHeaders = headerRow.map(value => normalize(value));
        if (
            firstRowHeaders.includes('status') &&
            firstRowHeaders.includes('year') &&
            firstRowHeaders.includes('make') &&
            firstRowHeaders.includes('model')
        ) {
            if (rows.length !== 2) {
                throw new Error('Copy exactly one vehicle row, with its header row if included.');
            }
            const dataRow = trimTrailingEmptyCells(rows[1]);
            if (
                headerRow.length !== scraperHeaders.length ||
                dataRow.length !== scraperHeaders.length
            ) {
                throw new Error('Copy exactly one 23-column scraper row, with its header row.');
            }
            const headerIndexes = new Map(
                headerRow.map((header, index) => [normalize(header), index])
            );
            values = Object.fromEntries(
                scraperHeaders.map((header, index) => {
                    const columnIndex = headerIndexes.get(normalize(header));
                    return [
                        header,
                        columnIndex === undefined ? '' : dataRow[columnIndex] || ''
                    ];
                })
            );
        } else {
            const dataRow = trimTrailingEmptyCells(rows[0]);
            if (
                rows.length !== 1 ||
                dataRow.length !== scraperHeaders.length
            ) {
                throw new Error('Copy exactly one 23-column scraper row without the header.');
            }
            values = Object.fromEntries(
                scraperHeaders.map((header, index) => [header, dataRow[index] || ''])
            );
        }

        return {
            vehicleType: /^commercial\/industrial$/i.test(
                (values['Vehicle Type'] || '').trim()
            ) ? 'Commercial/Industrial' : 'Car/Truck',
            location: 'Ottawa, Ontario',
            year: values.Year.trim(),
            make: values.Make.trim(),
            model: [values.Model, values.Trim].map(value => value.trim())
                .filter(Boolean).join(' '),
            bodyStyle: (values['Body Style'] || '').trim(),
            mileage: values.Mileage.replace(/\D/g, ''),
            price: values.Price.replace(/[^\d.]/g, ''),
            exteriorColor: values.Ext.trim(),
            interiorColor: /^other$/i.test(values.Int.trim())
                ? 'Black'
                : values.Int.trim(),
            condition: 'Excellent',
            fuelType: normalizeFuelType(values['Fuel Type']),
            transmission: values.Transmission.trim(),
            description: values.Description.trim()
        };
    }

    function fieldLabel(element) {
        const labels = element.labels
            ? [...element.labels].map(label => label.textContent || '')
            : [];
        const labelledBy = (element.getAttribute('aria-labelledby') || '')
            .split(/\s+/)
            .map(id => document.getElementById(id)?.textContent || '');
        return normalize([
            element.getAttribute('aria-label'),
            element.getAttribute('placeholder'),
            ...labels,
            ...labelledBy,
            element.matches('button, [role="button"]')
                ? element.textContent
                : ''
        ].filter(Boolean).join(' '));
    }

    function findField(name, aliases) {
        const terms = [name, ...aliases].map(normalize);
        return [...document.querySelectorAll(
            'input:not([type="hidden"]), textarea, select, [role="combobox"], ' +
            'button, [role="button"]'
        )].find(element => {
            if (!element.getClientRects().length) return false;
            const label = fieldLabel(element);
            return terms.some(term => label === term || label.includes(term));
        }) || null;
    }

    function findOption(value, exactOnly, combobox, aliases = []) {
        const targets = [value, ...aliases].map(normalize);
        const listboxId = combobox?.getAttribute('aria-controls') ||
            combobox?.getAttribute('aria-owns');
        const listbox = listboxId ? document.getElementById(listboxId) : null;
        const selector =
            '[role="option"], [role="menuitem"], [role="radio"], button, [role="button"]';
        const options = listbox
            ? [...listbox.querySelectorAll(selector)]
            : [...document.querySelectorAll(selector)];
        return options
            .filter(option => !option.querySelector('[role="option"]'))
            .find(option => {
                if (!option.getClientRects().length) return false;
                const text = normalize(option.innerText || option.textContent);
                return targets.some(target =>
                    text === target || (!exactOnly &&
                        (text.startsWith(`${target},`) || text.startsWith(`${target} `)))
                );
            }) || null;
    }

    function getValueElement(element) {
        if (element.matches('input, textarea, select')) return element;
        return element.querySelector('input:not([type="hidden"]), textarea, select');
    }

    function findCleanTitleCheckbox() {
        return [...document.querySelectorAll(
            'input[type="checkbox"], [role="checkbox"], label'
        )].find(element =>
            element.getClientRects().length &&
            normalize(
                element.getAttribute('aria-label') ||
                element.innerText ||
                element.textContent
            )
                .includes('this vehicle has a clean title')
        ) || null;
    }

    function checkCheckbox(element) {
        const checkbox = element.matches('input[type="checkbox"]')
            ? element
            : element.querySelector('input[type="checkbox"]') ||
                (element.getAttribute('role') === 'checkbox' ? element : null);
        if (checkbox) {
            if (checkbox.checked || checkbox.getAttribute('aria-checked') === 'true') {
                return true;
            }
            checkbox.click();
            return checkbox.checked || checkbox.getAttribute('aria-checked') === 'true';
        }

        element.click();
        return element.getAttribute('aria-checked') === 'true';
    }

    function setNativeValue(element, value, aliases = []) {
        if (element instanceof HTMLSelectElement) {
            const targets = [value, ...aliases].map(normalize);
            const option = [...element.options].find(item =>
                targets.includes(normalize(item.textContent)) ||
                targets.includes(normalize(item.value))
            );
            if (!option) return false;
            element.value = option.value;
        } else {
            let prototype;
            if (element instanceof HTMLTextAreaElement) {
                prototype = HTMLTextAreaElement.prototype;
            } else if (element instanceof HTMLInputElement) {
                prototype = HTMLInputElement.prototype;
            } else {
                return false;
            }
            const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
            if (!setter) return false;
            setter.call(element, value);
        }
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        return element.value === value ||
            aliases.some(alias => normalize(element.value) === normalize(alias));
    }

    function priceMatches(value, expected) {
        const actualPrice = Number(String(value).replace(/[^\d.-]/g, ''));
        const expectedPrice = Number(expected);
        return Number.isFinite(actualPrice) &&
            Number.isFinite(expectedPrice) &&
            actualPrice === expectedPrice;
    }

    async function fillField(element, value, exactOption, optionAliases = []) {
        element.scrollIntoView({ block: 'center', inline: 'nearest' });

        if (element instanceof HTMLButtonElement ||
            element.getAttribute('role') === 'button') {
            element.click();
            await new Promise(resolve => window.setTimeout(resolve, 300));
            const option = findOption(value, exactOption, element, optionAliases);
            if (!option) return false;
            option.click();
            return true;
        }

        if (element.getAttribute('role') === 'combobox') {
            const valueElement = getValueElement(element);
            if (valueElement) {
                if (!setNativeValue(valueElement, value, optionAliases)) return false;
            } else {
                element.click();
            }

            for (let attempt = 0; attempt < 10; attempt++) {
                await new Promise(resolve => window.setTimeout(resolve, 250));
                const option = findOption(value, exactOption, element, optionAliases);
                if (option) {
                    option.click();
                    return true;
                }
            }

            element.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Escape',
                bubbles: true
            }));
            return false;
        }

        const valueElement = getValueElement(element);
        return Boolean(valueElement && setNativeValue(valueElement, value, optionAliases));
    }

    async function fillVehicleForm(vehicle) {
        const failed = [];
        let filledCount = 0;
        const vehicleTypeField = findField(
            'Vehicle type',
            ['vehicle type', 'category']
        );
        if (vehicleTypeField &&
            await fillField(vehicleTypeField, vehicle.vehicleType, false)) {
            filledCount++;
        } else {
            failed.push('Vehicle type');
        }

        const fields = [
            ['Location', ['location'], vehicle.location],
            ['Year', ['year'], vehicle.year],
            ['Make', ['make'], vehicle.make],
            ['Model', ['model'], vehicle.model],
            ['Body style', ['body style'], vehicle.bodyStyle, true],
            ['Exterior color', ['exterior color'], vehicle.exteriorColor],
            ['Interior color', ['interior color'], vehicle.interiorColor],
            ['Mileage', ['mileage', 'odometer'], vehicle.mileage],
            ['Price', ['price'], vehicle.price],
            ['Condition', ['condition', 'vehicle condition'], vehicle.condition, true],
            [
                'Fuel type',
                ['fuel type', 'fuel'],
                vehicle.fuelType,
                true,
                vehicle.fuelType === 'Gasoline' ? ['Gas'] : []
            ],
            ['Transmission', ['transmission', 'transmission type'], vehicle.transmission],
            ['Description', ['description'], vehicle.description]
        ];

        for (const [
            label,
            aliases,
            value,
            exactOption = false,
            optionAliases = []
        ] of fields) {
            if (!value) continue;
            const element = findField(label, aliases);
            const filled = element &&
                await fillField(element, value, exactOption, optionAliases);
            const priceWasFormatted = label === 'Price' &&
                element &&
                priceMatches(getValueElement(element)?.value || '', value);
            if (!filled && !priceWasFormatted) {
                failed.push(label);
            } else {
                filledCount++;
            }
        }

        const cleanTitleCheckbox = findCleanTitleCheckbox();
        if (cleanTitleCheckbox && checkCheckbox(cleanTitleCheckbox)) {
            filledCount++;
        } else {
            failed.push('Clean title checkbox');
        }

        return { filledCount, failed };
    }

    function createPanel() {
        if (document.getElementById(panelId)) return;

        const panel = document.createElement('section');
        panel.id = panelId;
        panel.style.cssText =
            'position:fixed;right:16px;bottom:16px;z-index:999999;' +
            'display:flex;flex-direction:column;align-items:flex-end;gap:6px;' +
            'max-width:calc(100vw - 32px);font:13px Arial,sans-serif;';

        const status = document.createElement('span');
        status.setAttribute('aria-live', 'polite');
        status.style.cssText =
            'display:block;padding:6px 8px;background:#fff;border-radius:4px;' +
            'box-shadow:0 1px 5px rgba(0,0,0,.2);text-align:left;' +
            'white-space:pre-wrap;overflow-wrap:anywhere;max-height:180px;' +
            'overflow:auto;max-width:min(420px,calc(100vw - 48px));';

        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = 'Autofill';
        button.style.cssText =
            'padding:10px 16px;border:0;border-radius:6px;' +
            'background:#1877f2;color:#fff;font:bold 14px Arial,sans-serif;' +
            'cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.25);';
        let clipboardContents = null;
        button.addEventListener('click', async () => {
            button.disabled = true;
            try {
                if (clipboardContents === null) {
                    status.textContent = 'Reading clipboard...';
                    clipboardContents = await readClipboard();
                    if (!clipboardContents.trim()) {
                        clipboardContents = null;
                        status.textContent = 'Clipboard is empty. Copy a vehicle row and try again.';
                        return;
                    }
                    status.textContent =
                        `Clipboard contents detected:\n${clipboardContents}\n\n` +
                        'Review the copied row, then click Confirm Autofill.';
                    button.textContent = 'Confirm Autofill';
                    return;
                }

                const vehicle = getVehicleFromClipboard(clipboardContents);
                clipboardContents = null;
                button.textContent = 'Autofill';
                status.textContent = 'Filling vehicle fields...';
                const { filledCount, failed } = await fillVehicleForm(vehicle);
                status.textContent = failed.length
                    ? `Filled ${filledCount} fields. Could not fill: ${failed.join(', ')}.`
                    : `Filled ${filledCount} fields. Review the listing before publishing.`;
            } catch (error) {
                console.error('Could not autofill Marketplace vehicle listing', error);
                clipboardContents = null;
                button.textContent = 'Autofill';
                status.textContent = error instanceof DOMException &&
                    error.name === 'NotAllowedError'
                    ? 'Clipboard access was denied. Allow clipboard access and click Autofill again.'
                    : error.message || 'Autofill failed. Check the copied row and try again.';
            } finally {
                button.disabled = false;
                if (clipboardContents === null) button.textContent = 'Autofill';
            }
        });

        panel.append(status, button);
        document.body.appendChild(panel);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createPanel, { once: true });
    } else {
        createPanel();
    }
})();
