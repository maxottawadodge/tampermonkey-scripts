// ==UserScript==
// @name         !DEV Marketplace listing helper
// @namespace    http://tampermonkey.net/
// @version      1.2
// @updateURL    https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/!DEV-marketplace-listing.user.js?v=1.2
// @downloadURL  https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/!DEV-marketplace-listing.user.js?v=1.2
// @description  Create Facebook Marketplace vehicle listings from Google Sheets rows
// @match        https://docs.google.com/spreadsheets/*
// @match        https://www.facebook.com/marketplace/create/vehicle*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const marketplaceUrl =
        'https://www.facebook.com/marketplace/create/vehicle';
    const dataParameter = '__dev_vehicle';
    const buttonAttribute = 'data-dev-marketplace-button';
    const fieldAliases = {
        year: ['year'],
        make: ['make'],
        model: ['model'],
        mileage: ['mileage', 'odometer'],
        price: ['price'],
        fuelType: ['fuel type', 'fuel'],
        transmissionType: ['transmission type', 'transmission'],
        description: ['description']
    };

    function normalize(value) {
        return (value || '').replace(/\s+/g, ' ').trim().toLowerCase();
    }

    function isInViewport(element) {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 &&
            rect.bottom > 0 && rect.right > 0 &&
            rect.top < window.innerHeight && rect.left < window.innerWidth;
    }

    function parseCell(cell) {
        const label = cell.getAttribute('aria-label') || '';
        const rowLabel = cell.closest('[role="row"]')?.getAttribute('aria-label') || '';
        const coordinates = `${label} ${rowLabel}`.match(
            /\b([A-Z]{1,3})(\d+)\b/i
        );
        const rowNumber = Number(
            coordinates?.[2] ||
            cell.getAttribute('aria-rowindex') ||
            cell.closest('[role="row"]')?.getAttribute('aria-rowindex')
        );
        const labeledRow = label.match(/\brow\s+(\d+)\b/i);
        const labeledColumn = label.match(/\bcolumn\s+([A-Z]+)\b/i);
        const resolvedRowNumber = rowNumber || Number(labeledRow?.[1]);
        const columnLetters = coordinates?.[1]?.toUpperCase() ||
            labeledColumn?.[1]?.toUpperCase();
        const columnIndex = Number(cell.getAttribute('aria-colindex'));
        const column = columnLetters || (columnIndex
            ? columnName(columnIndex)
            : '');
        if (!resolvedRowNumber || !column) return null;

        const labelValue = label
            .replace(/\b[A-Z]{1,3}\d+\b/i, '')
            .replace(/\bcolumn\s+[A-Z]+\b/gi, '')
            .replace(/\brow\s+\d+\b/gi, '')
            .replace(/^\s*[:,\-\s]+|[\s,:\-]+$/g, '')
            .trim();
        const value = labelValue || cell.getAttribute('data-value') ||
            cell.textContent || '';

        return {
            column,
            row: resolvedRowNumber,
            value: value.trim()
        };
    }

    function columnName(index) {
        let name = '';
        while (index > 0) {
            index--;
            name = String.fromCharCode(65 + index % 26) + name;
            index = Math.floor(index / 26);
        }
        return name;
    }

    function getSheetRows() {
        const rows = new Map();
        const cellsByRow = new Map();
        for (const cell of document.querySelectorAll(
            '[role="gridcell"], [role="columnheader"], [role="rowheader"]'
        )) {
            if (!isInViewport(cell)) continue;
            const parsedCell = parseCell(cell);
            if (!parsedCell) continue;

            if (!cellsByRow.has(parsedCell.row)) {
                cellsByRow.set(parsedCell.row, []);
            }
            cellsByRow.get(parsedCell.row).push({ cell, parsedCell });
        }

        for (const [rowNumber, entries] of cellsByRow) {
            const rowElement = entries[0].cell.closest('[role="row"]') ||
                entries[0].cell.parentElement;
            const values = new Map(
                entries.map(({ parsedCell }) => [
                    parsedCell.column,
                    parsedCell.value
                ])
            );
            if (rowElement) {
                rows.set(rowNumber, { element: rowElement, values });
            }
        }
        return rows;
    }

    function normalizeHeader(value) {
        return normalize(value)
            .replace(/[_-]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function findColumnHeaders(rows) {
        for (const [rowNumber, row] of rows) {
            const foundColumns = new Map();
            for (const [column, value] of row.values) {
                const header = normalizeHeader(value);
                if (header) foundColumns.set(header, column);
            }

            const columns = new Map();
            const headersByField = {
                ...fieldAliases,
                year: ['year', 'vehicle year'],
                make: ['make', 'vehicle make'],
                model: ['model', 'vehicle model'],
                price: ['price', 'listing price']
            };
            let hasRequiredHeaders = true;
            for (const [field, aliases] of Object.entries(headersByField)) {
                const matchedColumn = aliases
                    .map(normalizeHeader)
                    .map(alias => foundColumns.get(alias))
                    .find(Boolean);
                if (['year', 'make', 'model', 'price'].includes(field) &&
                    !matchedColumn) {
                    hasRequiredHeaders = false;
                    break;
                }
                if (matchedColumn) {
                    for (const alias of fieldAliases[field] || aliases) {
                        columns.set(alias, matchedColumn);
                    }
                }
            }
            if (hasRequiredHeaders) return { rowNumber, columns };
        }
        return null;
    }

    function getScraperColumnHeaders() {
        return {
            rowNumber: 1,
            columns: new Map([
                ['price', 'B'],
                ['mileage', 'C'],
                ['description', 'D'],
                ['year', 'H'],
                ['make', 'I'],
                ['model', 'J'],
                ['fuel type', 'L'],
                ['fuel', 'L'],
                ['transmission type', 'M'],
                ['transmission', 'M']
            ])
        };
    }

    function getVehicleData(row, headers) {
        const getValue = aliases => {
            for (const alias of aliases) {
                const column = headers.columns.get(alias);
                if (column) return (row.values.get(column) || '').trim();
            }
            return '';
        };
        const vehicle = {};
        for (const [field, aliases] of Object.entries(fieldAliases)) {
            vehicle[field] = getValue(aliases);
        }
        vehicle.mileage = vehicle.mileage.replace(/[^\d]/g, '');
        vehicle.price = vehicle.price.replace(/[^\d.]/g, '');
        vehicle.vehicleType = 'Car/Truck';
        vehicle.location = 'Ottawa, Ontario';
        vehicle.condition = 'Excellent';
        return vehicle;
    }

    function addRowButton(rowElement, rowNumber, getData) {
        const existingButton = [...document.querySelectorAll(
            `[${buttonAttribute}]`
        )].find(button => button.dataset.rowNumber === String(rowNumber));
        const button = existingButton || document.createElement('button');
        if (!existingButton) {
            button.type = 'button';
            button.setAttribute(buttonAttribute, '1');
            button.dataset.rowNumber = String(rowNumber);
            button.textContent = 'List';
            button.title = `Create Marketplace listing from row ${rowNumber}`;
            button.style.cssText =
                'position:fixed;z-index:999998;padding:4px 8px;' +
                'border:0;border-radius:4px;background:#1877f2;color:#fff;' +
                'font:600 11px Arial,sans-serif;cursor:pointer;';
            button.addEventListener('click', () => {
                const data = getData();
                const url = new URL(marketplaceUrl);
                url.searchParams.set(dataParameter, JSON.stringify(data));
                window.open(url.href, '_blank', 'noopener');
            });
            document.body.appendChild(button);
        }

        const rowRect = rowElement.getBoundingClientRect();
        const buttonWidth = button.offsetWidth || 48;
        const left = Math.max(4, Math.min(
            rowRect.right - buttonWidth - 4,
            window.innerWidth - buttonWidth - 4
        ));
        button.style.left = `${Math.round(left)}px`;
        button.style.top = `${Math.round(rowRect.top + 2)}px`;
    }

    function startSpreadsheet() {
        const panel = document.createElement('div');
        panel.style.cssText =
            'position:fixed;right:12px;bottom:12px;z-index:999999;' +
            'display:flex;align-items:center;gap:8px;padding:8px;' +
            'background:#fff;border:1px solid #bbb;border-radius:6px;' +
            'box-shadow:0 2px 10px rgba(0,0,0,.2);font:13px Arial,sans-serif;';

        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.textContent = 'Enable listing buttons';
        toggle.style.cssText =
            'padding:7px 10px;border:0;border-radius:4px;' +
            'background:#1877f2;color:#fff;font-weight:600;cursor:pointer;';

        const status = document.createElement('span');
        status.setAttribute('aria-live', 'polite');
        status.textContent = 'Listing buttons are disabled.';
        const setStatus = message => {
            if (status.textContent !== message) status.textContent = message;
        };
        panel.append(toggle, status);
        document.body.appendChild(panel);

        let enabled = false;
        let updateTimer;
        const observer = new MutationObserver(() => {
            if (!enabled) return;
            window.clearTimeout(updateTimer);
            updateTimer = window.setTimeout(updateButtons, 100);
        });

        function updateButtons() {
            if (!enabled) return;
            const rows = getSheetRows();
            const visibleRowNumbers = new Set(rows.keys());
            document.querySelectorAll(`[${buttonAttribute}]`).forEach(button => {
                if (!visibleRowNumbers.has(Number(button.dataset.rowNumber))) {
                    button.remove();
                }
            });
            if (!rows.size) {
                setStatus(
                    'No accessible spreadsheet cells found. Reload the sheet after enabling screen reader support.'
                );
                return;
            }
            const detectedHeaders = findColumnHeaders(rows);
            const headers = detectedHeaders || getScraperColumnHeaders();

            let count = 0;
            for (const [rowNumber, row] of rows) {
                if (rowNumber <= headers.rowNumber) continue;
                if (!isInViewport(row.element)) continue;
                addRowButton(row.element, rowNumber, () => {
                    const currentRows = getSheetRows();
                    const currentRow = currentRows.get(rowNumber);
                    return currentRow
                        ? getVehicleData(currentRow, headers)
                        : getVehicleData(row, headers);
                });
                count++;
            }
            setStatus(detectedHeaders
                ? `Listing buttons added to ${count} visible rows.`
                : `Added buttons to ${count} visible rows using the used-car scraper's standard columns.`);
        }

        toggle.addEventListener('click', () => {
            enabled = !enabled;
            toggle.textContent = enabled
                ? 'Disable listing buttons'
                : 'Enable listing buttons';
            if (enabled) {
                observer.observe(document.body, {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    attributeFilter: ['aria-label']
                });
                updateButtons();
                document.addEventListener('scroll', scheduleUpdate, true);
                window.addEventListener('resize', scheduleUpdate);
            } else {
                observer.disconnect();
                document.removeEventListener('scroll', scheduleUpdate, true);
                window.removeEventListener('resize', scheduleUpdate);
                document.querySelectorAll(`[${buttonAttribute}]`).forEach(button => {
                    button.remove();
                });
                setStatus('Listing buttons are disabled.');
            }
        });

        function scheduleUpdate() {
            window.clearTimeout(updateTimer);
            updateTimer = window.setTimeout(updateButtons, 100);
        }
    }

    function getFieldCandidates() {
        return [...document.querySelectorAll(
            'input:not([type="hidden"]), textarea, select, [role="combobox"], ' +
            'button, [role="button"]'
        )].filter(element => element.getClientRects().length);
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
        return getFieldCandidates().find(element => {
            const label = fieldLabel(element);
            return terms.some(term => label === term || label.includes(term));
        }) || null;
    }

    function findOption(value) {
        const target = normalize(value);
        return [...document.querySelectorAll(
            '[role="option"], [role="menuitem"], [role="radio"], button, [role="button"]'
        )].find(option => {
            const text = normalize(option.textContent);
            return option.getClientRects().length &&
                (text === target || text.startsWith(`${target},`) ||
                    text.startsWith(`${target} `));
        }) || null;
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
            const prototype = element instanceof HTMLTextAreaElement
                ? HTMLTextAreaElement.prototype
                : HTMLInputElement.prototype;
            const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
            if (!setter) return false;
            setter.call(element, value);
        }
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        return element.value === value;
    }

    async function fillField(element, value) {
        if (element instanceof HTMLButtonElement ||
            element.getAttribute('role') === 'button') {
            element.click();
            await new Promise(resolve => window.setTimeout(resolve, 300));
            const option = findOption(value);
            if (!option) return false;
            option.click();
            return true;
        }

        if (!setNativeValue(element, value)) return false;
        if (element.getAttribute('role') !== 'combobox') return true;

        await new Promise(resolve => window.setTimeout(resolve, 300));
        const option = findOption(value);
        if (option) {
            option.click();
            return true;
        }
        return false;
    }

    function markUnfilled(element, label) {
        const marker = document.createElement('span');
        marker.textContent = '!';
        marker.title = `Could not fill ${label}`;
        marker.setAttribute('aria-label', `Could not fill ${label}`);
        marker.style.cssText =
            'display:inline-flex;align-items:center;justify-content:center;' +
            'width:18px;height:18px;margin-left:5px;border-radius:50%;' +
            'background:#d93025;color:#fff;font:bold 14px Arial,sans-serif;' +
            'vertical-align:middle;';
        const labelledBy = (element.getAttribute('aria-labelledby') || '')
            .split(/\s+/)
            .map(id => document.getElementById(id))
            .find(Boolean);
        const labelElement = element.labels?.[0] || labelledBy ||
            [...document.querySelectorAll('label, [role="label"], span, div')]
                .find(candidate =>
                    candidate.getClientRects().length &&
                    normalize(candidate.textContent) === normalize(label)
                );
        if (labelElement) {
            labelElement.insertAdjacentElement('afterend', marker);
        } else if (element !== document.body) {
            element.insertAdjacentElement('afterend', marker);
        }
    }

    async function fillVehicleForm(vehicle) {
        const fields = [
            ['Vehicle type', ['vehicle type', 'category'], vehicle.vehicleType],
            ['Location', ['location'], vehicle.location],
            ['Year', ['year'], vehicle.year],
            ['Make', ['make'], vehicle.make],
            ['Model', ['model'], vehicle.model],
            ['Mileage', ['mileage', 'odometer'], vehicle.mileage],
            ['Price', ['price'], vehicle.price],
            ['Vehicle condition', ['condition', 'vehicle condition'], vehicle.condition],
            ['Fuel type', ['fuel type', 'fuel'], vehicle.fuelType],
            ['Transmission type', ['transmission type', 'transmission'], vehicle.transmissionType],
            ['Description', ['description'], vehicle.description]
        ];
        let failures = 0;
        for (const [label, aliases, value] of fields) {
            const element = findField(label, aliases);
            if (!element || !value || !await fillField(element, value)) {
                markUnfilled(element || document.body, label);
                failures++;
            }
        }

        const status = document.createElement('div');
        status.textContent = failures
            ? `${failures} field(s) need attention; look for red ! markers.`
            : 'Vehicle details filled. Review them before publishing.';
        status.style.cssText =
            'position:fixed;left:12px;bottom:12px;z-index:999999;' +
            'padding:10px 12px;background:#fff;border:1px solid #bbb;' +
            'border-radius:6px;box-shadow:0 2px 10px rgba(0,0,0,.2);' +
            'font:13px Arial,sans-serif;';
        document.body.appendChild(status);
    }

    function startMarketplace() {
        const url = new URL(window.location.href);
        const serialized = url.searchParams.get(dataParameter);
        if (!serialized) return;

        url.searchParams.delete(dataParameter);
        window.history.replaceState(null, '', url.href);
        let vehicle;
        try {
            vehicle = JSON.parse(serialized);
        } catch (error) {
            console.error('Could not read spreadsheet vehicle data', error);
            return;
        }

        let attempts = 0;
        const timer = window.setInterval(() => {
            attempts++;
            if (findField('Year', ['year']) && findField('Make', ['make'])) {
                window.clearInterval(timer);
                fillVehicleForm(vehicle);
            } else if (attempts >= 30) {
                window.clearInterval(timer);
                console.error('Marketplace listing form did not become available.');
            }
        }, 500);
    }

    if (location.hostname === 'docs.google.com') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', startSpreadsheet, {
                once: true
            });
        } else {
            startSpreadsheet();
        }
    } else {
        startMarketplace();
    }
})();
