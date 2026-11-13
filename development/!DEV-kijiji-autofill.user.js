// ==UserScript==
// @name         !DEV Kijiji Autofill
// @namespace    http://tampermonkey.net/
// @version      1.1
// @updateURL    https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/!DEV-kijiji-autofill.user.js?v=1.1
// @downloadURL  https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/!DEV-kijiji-autofill.user.js?v=1.1
// @description  Autofill Kijiji vehicle ads from copied scraper rows
// @match        https://www.kijiji.ca/p-post-ad.html*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const panelId = 'dev-kijiji-autofill';
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
        'Scraped On',
        'Listing ID'
    ];
    const supportedColumnCounts = [scraperHeaders.length - 1, scraperHeaders.length];

    function normalize(value) {
        return (value || '').replace(/\s+/g, ' ').trim().toLowerCase();
    }

    function getCellText(cell) {
        function getNodeText(node) {
            if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || '';
            if (!(node instanceof Element)) return '';
            if (node.tagName === 'BR') return '\n';

            const text = [...node.childNodes].map(getNodeText).join('');
            return ['DIV', 'LI', 'P'].includes(node.tagName)
                ? `\n${text}\n`
                : text;
        }

        return getNodeText(cell).replace(/^\n+|\n+$/g, '').trim();
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
                const headers = tableRows[headerIndex].map(getCellText);
                return [
                    headers,
                    ...tableRows.slice(headerIndex + 1)
                        .filter(row => row.some(cell => cell.textContent.trim()))
                        .map(row => row.map(getCellText))
                ];
            }

            const dataRow = tableRows.find(row => supportedColumnCounts.includes(row.length));
            if (dataRow) return [dataRow.map(getCellText)];
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
        while (trimmed.length && !trimmed[trimmed.length - 1].trim()) trimmed.pop();
        return trimmed;
    }

    function getVehicleFromClipboard(text) {
        const rows = parseTsv(text);
        if (!rows.length) throw new Error('The clipboard is empty.');

        const headerRow = trimTrailingEmptyCells(rows[0]);
        const headers = headerRow.map(normalize);
        let values;
        if (
            headers.includes('status') &&
            headers.includes('year') &&
            headers.includes('make') &&
            headers.includes('model')
        ) {
            if (rows.length !== 2) {
                throw new Error('Copy exactly one vehicle row, with its header row if included.');
            }
            const dataRow = trimTrailingEmptyCells(rows[1]);
            if (!supportedColumnCounts.includes(headerRow.length) ||
                dataRow.length > headerRow.length) {
                throw new Error('Copy exactly one 23- or 24-column scraper row, with its header row.');
            }
            const headerIndexes = new Map(
                headerRow.map((header, index) => [normalize(header), index])
            );
            values = Object.fromEntries(scraperHeaders.map(header => {
                const index = headerIndexes.get(normalize(header));
                return [header, index === undefined ? '' : dataRow[index] || ''];
            }));
        } else {
            const dataRow = trimTrailingEmptyCells(rows[0]);
            if (rows.length !== 1 || !supportedColumnCounts.includes(dataRow.length)) {
                throw new Error('Copy exactly one 23- or 24-column scraper row without the header.');
            }
            values = Object.fromEntries(
                scraperHeaders.map((header, index) => [header, dataRow[index] || ''])
            );
        }

        return {
            title: [values.Year, values.Make, values.Model, values.Trim]
                .map(value => value.trim()).filter(Boolean).join(' '),
            year: values.Year.trim(),
            make: values.Make.trim(),
            model: values.Model.trim(),
            trim: values.Trim.trim(),
            mileage: values.Mileage.replace(/\D/g, ''),
            price: values.Price.replace(/[^\d.]/g, ''),
            bodyStyle: values['Body Style'].trim(),
            exteriorColor: values.Ext.trim(),
            interiorColor: values.Int.trim(),
            fuelType: values['Fuel Type'].trim(),
            transmission: values.Transmission.trim(),
            condition: values.Condition.trim(),
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
            element.getAttribute('name'),
            element.getAttribute('id'),
            ...labels,
            ...labelledBy,
            element.matches('button, [role="button"], [role="combobox"]')
                ? element.textContent
                : ''
        ].filter(Boolean).join(' '));
    }

    function findField(name, aliases = []) {
        const terms = [name, ...aliases].map(normalize);
        const fields = [...document.querySelectorAll(
            'input:not([type="hidden"]), textarea, select, [role="combobox"], ' +
            'button, [role="button"]'
        )].filter(element => element.getClientRects().length);
        const matchesExactly = element => {
            const label = fieldLabel(element);
            return terms.some(term => label === term);
        };
        return fields.find(matchesExactly) || fields.find(element => {
            const label = fieldLabel(element);
            return terms.some(term => label.includes(term));
        }) || null;
    }

    function findOption(value, combobox, aliases = []) {
        const targets = [value, ...aliases].map(normalize);
        const listboxId = combobox?.getAttribute('aria-controls') ||
            combobox?.getAttribute('aria-owns');
        const listbox = listboxId ? document.getElementById(listboxId) : null;
        const selector =
            '[role="option"], [role="menuitem"], button, [role="button"]';
        const options = listbox
            ? [...listbox.querySelectorAll(selector)]
            : [...document.querySelectorAll(selector)];
        return options.find(option => {
            if (!option.getClientRects().length) return false;
            const text = normalize(option.innerText || option.textContent);
            return targets.some(target =>
                text === target || text.startsWith(`${target},`) ||
                text.startsWith(`${target} `)
            );
        }) || null;
    }

    function getValueElement(element) {
        if (element.matches('input, textarea, select')) return element;
        return element.querySelector('input:not([type="hidden"]), textarea, select');
    }

    function setNativeValue(element, value) {
        if (element instanceof HTMLSelectElement) {
            const option = [...element.options].find(item =>
                normalize(item.textContent) === normalize(value) ||
                normalize(item.value) === normalize(value)
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
        return true;
    }

    function findSelectOption(select, value, aliases = []) {
        if (select.disabled) return null;
        const targets = [value, ...aliases].map(normalize);
        const options = [...select.options].filter(option =>
            !option.disabled && normalize(option.value)
        );
        return options.find(option => targets.some(target =>
            normalize(option.textContent) === target ||
            normalize(option.value) === target
        )) || options.find(option => {
            const text = normalize(option.textContent);
            return targets.some(target =>
                text.startsWith(`${target} `) ||
                text.startsWith(`${target},`) ||
                text.startsWith(`${target} (`)
            );
        }) || null;
    }

    async function selectOption(select, value, aliases = []) {
        for (let attempt = 0; attempt < 10; attempt++) {
            const option = findSelectOption(select, value, aliases);
            if (option) {
                select.value = option.value;
                select.dispatchEvent(new Event('input', { bubbles: true }));
                select.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
            }
            await new Promise(resolve => window.setTimeout(resolve, 250));
        }
        return false;
    }

    async function fillField(element, value, aliases = []) {
        element.scrollIntoView({ block: 'center', inline: 'nearest' });
        if (element instanceof HTMLButtonElement ||
            element.getAttribute('role') === 'button') {
            element.click();
            await new Promise(resolve => window.setTimeout(resolve, 300));
            const option = findOption(value, element, aliases);
            if (!option) return false;
            option.click();
            return true;
        }

        if (element.getAttribute('role') === 'combobox') {
            const valueElement = getValueElement(element);
            if (valueElement) {
                if (valueElement instanceof HTMLSelectElement) {
                    return selectOption(valueElement, value, aliases);
                }
                if (!setNativeValue(valueElement, value)) return false;
            } else {
                element.click();
            }

            for (let attempt = 0; attempt < 10; attempt++) {
                await new Promise(resolve => window.setTimeout(resolve, 250));
                const option = findOption(value, element, aliases);
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
        if (valueElement && valueElement.matches('select')) {
            return selectOption(valueElement, value, aliases);
        }

        return Boolean(valueElement && setNativeValue(valueElement, value));
    }

    async function fillVehicleForm(vehicle) {
        const bodyTypeAliases = {
            'commercial van': ['Van'],
            minivan: ['Van', 'Minivan/Van'],
            suv: ['Crossover', 'SUV/Crossover'],
            truck: ['Pickup', 'Pickup Truck']
        };
        const fields = [
            ['Title', ['ad title', 'listing title'], vehicle.title],
            ['Description', [], vehicle.description],
            ['Price', [], vehicle.price],
            ['Year', ['model year'], vehicle.year],
            ['Make', ['manufacturer'], vehicle.make],
            ['Model', [], vehicle.model],
            ['Trim', ['vehicle trim'], vehicle.trim],
            [
                'Body type',
                ['body style'],
                vehicle.bodyStyle,
                bodyTypeAliases[normalize(vehicle.bodyStyle)] || []
            ],
            ['Kilometers', ['kilometres', 'mileage', 'odometer'], vehicle.mileage],
            [
                'Colour',
                ['color', 'exterior colour', 'exterior color'],
                vehicle.exteriorColor
            ],
            ['Fuel type', ['fuel'], vehicle.fuelType],
            ['Transmission', ['transmission type'], vehicle.transmission],
            ['Condition', ['vehicle condition'], vehicle.condition]
        ];
        const failed = [];
        let filledCount = 0;

        for (const [label, aliases, value, optionAliases = []] of fields) {
            if (!value) continue;
            const element = findField(label, aliases);
            if (element && await fillField(element, value, optionAliases)) {
                filledCount++;
            } else {
                failed.push(label);
            }
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
                status.textContent = 'Filling vehicle fields...';
                const { filledCount, failed } = await fillVehicleForm(vehicle);
                status.textContent = failed.length
                    ? `Filled ${filledCount} fields. Could not fill: ${failed.join(', ')}.`
                    : `Filled ${filledCount} fields. Review the ad before posting.`;
            } catch (error) {
                console.error('Could not autofill Kijiji vehicle listing', error);
                clipboardContents = null;
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
