// ==UserScript==
// @name         !DEV Marketplace Autofill
// @namespace    http://tampermonkey.net/
// @version      1.4
// @updateURL    https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/!DEV-marketplace-autofill.user.js?v=1.4
// @downloadURL  https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/!DEV-marketplace-autofill.user.js?v=1.4
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
        'Sold On',
        'Stock',
        'URL',
        'Year',
        'Make',
        'Model',
        'Trim',
        'Mileage',
        'Price',
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

    function normalize(value) {
        return (value || '').replace(/\s+/g, ' ').trim().toLowerCase();
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
            if (dataRow.length > headerRow.length) {
                throw new Error('The copied row has non-empty cells beyond its headers.');
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
            if (rows.length !== 1 || dataRow.length !== scraperHeaders.length) {
                throw new Error(
                    `Copy one complete scraper row (${scraperHeaders.length} columns), without the header.`
                );
            }
            values = Object.fromEntries(
                scraperHeaders.map((header, index) => [header, dataRow[index] || ''])
            );
        }

        return {
            vehicleType: 'Car/Truck',
            location: 'Ottawa, Ontario',
            year: values.Year.trim(),
            make: values.Make.trim(),
            model: values.Model.trim(),
            trim: values.Trim.trim(),
            mileage: values.Mileage.replace(/\D/g, ''),
            price: values.Price.replace(/[^\d.]/g, ''),
            condition: values.Condition.trim(),
            fuelType: values['Fuel Type'].trim(),
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

    function findOption(value, exactOnly, combobox) {
        const target = normalize(value);
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
                return text === target || (!exactOnly &&
                    (text.startsWith(`${target},`) || text.startsWith(`${target} `)));
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
        return element.value === value;
    }

    async function fillField(element, value, exactOption) {
        if (element instanceof HTMLButtonElement ||
            element.getAttribute('role') === 'button') {
            element.click();
            await new Promise(resolve => window.setTimeout(resolve, 300));
            const option = findOption(value, exactOption, element);
            if (!option) return false;
            option.click();
            return true;
        }

        if (element.getAttribute('role') === 'combobox') {
            const valueElement = getValueElement(element);
            if (valueElement) {
                if (!setNativeValue(valueElement, value)) return false;
            } else {
                element.click();
            }

            for (let attempt = 0; attempt < 10; attempt++) {
                await new Promise(resolve => window.setTimeout(resolve, 250));
                const option = findOption(value, exactOption, element);
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
        return Boolean(valueElement && setNativeValue(valueElement, value));
    }

    async function fillVehicleForm(vehicle) {
        const failed = [];
        let filledCount = 0;
        const vehicleTypeField = findField(
            'Vehicle type',
            ['vehicle type', 'category']
        );
        if (vehicleTypeField &&
            await fillField(vehicleTypeField, 'Car/Truck', false)) {
            filledCount++;
        } else {
            failed.push('Vehicle type');
        }

        const fields = [
            ['Location', ['location'], vehicle.location],
            ['Year', ['year'], vehicle.year],
            ['Make', ['make'], vehicle.make],
            ['Model', ['model'], vehicle.model],
            ['Trim', ['trim'], vehicle.trim],
            ['Mileage', ['mileage', 'odometer'], vehicle.mileage],
            ['Price', ['price'], vehicle.price],
            ['Condition', ['condition', 'vehicle condition'], vehicle.condition, true],
            ['Fuel type', ['fuel type', 'fuel'], vehicle.fuelType],
            ['Transmission', ['transmission', 'transmission type'], vehicle.transmission],
            ['Description', ['description'], vehicle.description]
        ];

        for (const [label, aliases, value, exactOption = false] of fields) {
            if (!value) continue;
            const element = findField(label, aliases);
            if (!element || !await fillField(element, value, exactOption)) {
                failed.push(label);
            } else {
                filledCount++;
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
            'padding:6px 8px;background:#fff;border-radius:4px;' +
            'box-shadow:0 1px 5px rgba(0,0,0,.2);text-align:right;';

        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = 'Autofill';
        button.style.cssText =
            'padding:10px 16px;border:0;border-radius:6px;' +
            'background:#1877f2;color:#fff;font:bold 14px Arial,sans-serif;' +
            'cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.25);';
        button.addEventListener('click', async () => {
            button.disabled = true;
            status.textContent = 'Reading copied vehicle row...';
            try {
                const text = await navigator.clipboard.readText();
                const vehicle = getVehicleFromClipboard(text);
                status.textContent = 'Filling vehicle fields...';
                const { filledCount, failed } = await fillVehicleForm(vehicle);
                status.textContent = failed.length
                    ? `Filled ${filledCount} fields. Could not fill: ${failed.join(', ')}.`
                    : `Filled ${filledCount} fields. Review the listing before publishing.`;
            } catch (error) {
                console.error('Could not autofill Marketplace vehicle listing', error);
                status.textContent = error instanceof DOMException &&
                    error.name === 'NotAllowedError'
                    ? 'Clipboard access was denied. Allow clipboard access and click Autofill again.'
                    : error.message || 'Autofill failed. Check the copied row and try again.';
            } finally {
                button.disabled = false;
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
