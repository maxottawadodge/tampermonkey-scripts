// ==UserScript==
// @name         !DEV global phone links
// @namespace    http://tampermonkey.net/
// @version      1.2
// @updateURL   https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/!DEV-global-phone-links.user.js
// @downloadURL https://raw.githubusercontent.com/maxottawadodge/tampermonkey-scripts/main/development/!DEV-global-phone-links.user.js
// @description  Add click-to-call links and CDJR VIN tools
// @match        *://*/*
// @exclude      *://dealersocket.com/*
// @exclude      *://*.dealersocket.com/*
// @exclude      *://app.demandhub.co/*
// @exclude      *://ottawachryslerjeepdodge.com/*
// @exclude      *://*.ottawachryslerjeepdodge.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const phonePattern =
        /(^|[^A-Za-z0-9])(\+?(?:\d{1,3}[ .-]?)?(?:\(\d{2,4}\)|\d{2,4})[ .-]?\d{3,4}[ .-]?\d{4}|\d{3}[.-]\d{4}|\d{10,11}|\+\d{7,15})(?![A-Za-z0-9])/g;
    const skippedElements =
        'a, button, input, select, textarea, script, style, noscript, option, iframe, [contenteditable]:not([contenteditable="false"]), [role="textbox"]';
    const processedTextNodes = new WeakSet();
    const cdjrWmis = new Set([
        '1C3', '1C4', '1C6',
        '2C3', '2C4', '2C7',
        '3C3', '3C4', '3C6',
        'ZAC', 'ZFA'
    ]);
    let vinDetectionScheduled = false;
    let vinToolsAdded = false;

    function isSkipped(element) {
        return Boolean(element.closest(skippedElements));
    }

    function createPhoneLink(phone) {
        const link = document.createElement('a');
        const digits = phone.replace(/\D/g, '');
        link.href = `tel:${phone.startsWith('+') ? '+' : ''}${digits}`;
        link.title = `Call ${phone}`;
        link.setAttribute('aria-label', `Call ${phone}`);
        link.dataset.globalPhoneLink = 'true';
        link.style.cssText =
            'display:inline-flex;align-items:center;margin-left:4px;' +
            'vertical-align:middle;text-decoration:none;';

        const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        icon.setAttribute('viewBox', '0 0 24 24');
        icon.setAttribute('width', '16');
        icon.setAttribute('height', '16');
        icon.setAttribute('fill', 'currentColor');
        icon.setAttribute('aria-hidden', 'true');

        const handset = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        handset.setAttribute(
            'd',
            'M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24c1.12.37 2.33.56 3.58.56a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.61 21 3 13.39 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.46.56 3.58a1 1 0 0 1-.25 1.01z'
        );
        icon.appendChild(handset);
        link.appendChild(icon);
        return link;
    }

    function isCDJR(vin) {
        return cdjrWmis.has(vin.substring(0, 3).toUpperCase());
    }

    function getCDJRVIN() {
        const candidates = [];
        document.querySelectorAll('input[data-vin]').forEach(vinInput => {
            if (vinInput.dataset.vin) candidates.push(vinInput.dataset.vin);
        });

        for (const script of document.querySelectorAll(
            'script[type="application/ld+json"]'
        )) {
            try {
                const data = JSON.parse(script.textContent);
                if (data?.vehicleIdentificationNumber) {
                    candidates.push(data.vehicleIdentificationNumber);
                }
                if (Array.isArray(data)) {
                    for (const item of data) {
                        if (item?.vehicleIdentificationNumber) {
                            candidates.push(item.vehicleIdentificationNumber);
                        }
                    }
                }
            } catch (error) {
                // Ignore unrelated or malformed JSON-LD blocks.
            }
        }

        const vinPattern = /\b[A-HJ-NPR-Z0-9]{17}\b/gi;
        const bodyText = document.body?.textContent || '';
        let match;
        while ((match = vinPattern.exec(bodyText)) !== null) {
            candidates.push(match[0]);
        }

        return candidates
            .map(vin => String(vin).trim().toUpperCase())
            .find(vin => /^[A-HJ-NPR-Z0-9]{17}$/.test(vin) && isCDJR(vin)) || null;
    }

    function createVINButton(text, color, top, clickHandler) {
        const button = document.createElement('button');
        button.textContent = text;
        button.style.cssText =
            `position:fixed;top:${top}px;right:15px;z-index:999999;` +
            `background:${color};color:white;border:none;border-radius:5px;` +
            'padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;opacity:.85;';
        button.addEventListener('click', clickHandler);
        document.body.appendChild(button);
    }

    async function decodeVIN(vin) {
        const popup = window.open('', '_blank');
        if (!popup) {
            alert('Allow pop-ups to decode this VIN');
            return;
        }

        popup.document.title = `VIN Decode: ${vin}`;
        popup.document.body.textContent = `Loading VIN ${vin}...`;

        try {
            const response = await fetch(
                `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVin/${vin}?format=json`
            );
            if (!response.ok) throw new Error(`VIN decode failed: ${response.status}`);

            const json = await response.json();
            if (!Array.isArray(json.Results)) throw new Error('Invalid VIN decode response');
            const rows = json.Results.filter(row =>
                row.Value && row.Value !== '0' && row.Value !== 'Not Applicable'
            );

            const heading = popup.document.createElement('h1');
            heading.textContent = vin;
            const table = popup.document.createElement('table');
            table.style.cssText = 'border-collapse:collapse;width:100%;';

            for (const row of rows) {
                const tableRow = table.insertRow();
                for (const value of [row.Variable, row.Value]) {
                    const cell = tableRow.insertCell();
                    cell.textContent = value;
                    cell.style.cssText = 'border:1px solid #ddd;padding:8px;';
                }
            }

            popup.document.body.replaceChildren(heading, table);
        } catch (error) {
            console.error(error);
            popup.close();
            alert('VIN Decode Failed');
        }
    }

    async function copyVIN(vin) {
        try {
            await navigator.clipboard.writeText(vin);
        } catch (error) {
            console.error(error);
            alert('Failed to copy VIN');
        }
    }

    function addVINTools() {
        if (vinToolsAdded) return;
        const vin = getCDJRVIN();
        if (!vin) return;

        vinToolsAdded = true;
        createVINButton(
            'Window Sticker',
            '#c64545',
            100,
            () => window.open(
                `https://www.chrysler.com/hostd/windowsticker/getWindowStickerPdf.do?vin=${vin}`,
                '_blank'
            )
        );
        createVINButton('VIN Decode', '#2d6cdf', 135, () => decodeVIN(vin));
        createVINButton('Copy VIN', '#2f8f5b', 170, () => copyVIN(vin));
    }

    function scheduleVINDetection() {
        if (vinDetectionScheduled || vinToolsAdded) return;
        vinDetectionScheduled = true;
        requestAnimationFrame(() => {
            vinDetectionScheduled = false;
            addVINTools();
        });
    }

    function addPhoneLinks(textNode) {
        const parent = textNode.parentElement;
        const text = textNode.nodeValue;
        if (!parent || isSkipped(parent) || processedTextNodes.has(textNode) ||
            !text || !/\d{3}/.test(text)) return;

        phonePattern.lastIndex = 0;
        let match;
        const matches = [];

        while ((match = phonePattern.exec(text)) !== null) {
            const phone = match[2];
            const digits = phone.replace(/\D/g, '');
            if (digits.length < 7 || digits.length > 15) continue;
            const end = match.index + match[1].length + phone.length;
            const alreadyLinked = end === text.length &&
                textNode.nextSibling &&
                textNode.nextSibling.nodeType === Node.ELEMENT_NODE &&
                textNode.nextSibling.dataset.globalPhoneLink === 'true';
            if (alreadyLinked) continue;
            matches.push({
                phone,
                end
            });
        }

        if (matches.length === 0) return;

        for (let index = matches.length - 1; index >= 0; index--) {
            const { phone, end } = matches[index];
            const range = document.createRange();
            range.setStart(textNode, end);
            range.collapse(true);

            const link = createPhoneLink(phone);
            range.insertNode(link);
            if (link.nextSibling && link.nextSibling.nodeType === Node.TEXT_NODE) {
                processedTextNodes.add(link.nextSibling);
            }
        }

        processedTextNodes.add(textNode);
    }

    function processNode(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            addPhoneLinks(node);
            return;
        }

        if (node.nodeType !== Node.ELEMENT_NODE &&
            node.nodeType !== Node.DOCUMENT_NODE &&
            node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
        if (node.nodeType === Node.ELEMENT_NODE && isSkipped(node)) return;

        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
            acceptNode(textNode) {
                const parent = textNode.parentElement;
                return parent && !isSkipped(parent)
                    ? NodeFilter.FILTER_ACCEPT
                    : NodeFilter.FILTER_REJECT;
            }
        });
        const textNodes = [];
        let textNode;
        while ((textNode = walker.nextNode())) {
            textNodes.push(textNode);
        }
        for (const candidate of textNodes) addPhoneLinks(candidate);
    }

    function start() {
        processNode(document.body);
        scheduleVINDetection();

        const observer = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                if (mutation.type === 'characterData') {
                    processedTextNodes.delete(mutation.target);
                    processNode(mutation.target);
                } else {
                    for (const node of mutation.addedNodes) {
                        processNode(node);
                    }
                }
            }
            scheduleVINDetection();
        });
        observer.observe(document.body, {
            childList: true,
            characterData: true,
            subtree: true
        });
    }

    if (document.body) {
        start();
    } else {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    }
})();
