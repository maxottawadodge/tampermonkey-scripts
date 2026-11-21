// Version: 1.0.0
function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function setupDialog(mode) {
    const elements = {};
    for (const id of ['copy-button', 'copy-text', 'status', 'sheet-id', 'row-number',
        'identity-key', 'identity-value', 'copied-text', 'close-button']) {
        elements[id] = {
            value: '',
            hidden: false,
            disabled: false,
            textContent: '',
            listeners: {},
            addEventListener(type, handler) { this.listeners[type] = handler; },
            fire(type) { return this.listeners[type](); },
            focus() {},
            select() { this.selected = true; }
        };
    }
    elements['sheet-id'].value = '7';
    elements['row-number'].value = '2';
    elements['identity-key'].value = 'listingId';
    elements['identity-value'].value = 'LIST-1';
    elements['copied-text'].value = '';
    let fetched = 0;
    let reference;
    let clipboardData;
    const runner = {
        withSuccessHandler(handler) { this.success = handler; return this; },
        withFailureHandler(handler) { this.failure = handler; return this; },
        getCopyTrackerRow(value) {
            fetched++;
            reference = value;
            if (mode === 'server-error') this.failure(new Error('The selected row changed.'));
            else this.success('current row\tcurrent price');
        }
    };
    globalThis.document = {
        getElementById: id => elements[id],
        execCommand: () => false
    };
    globalThis.google = { script: { run: runner, host: { close() {} } } };
    globalThis.console = { warn() {} };
    globalThis.Blob = class { constructor(parts) { this.text = parts[0]; } };
    globalThis.ClipboardItem = class { constructor(data) { this.data = data; } };
    globalThis.navigator = mode === 'clipboard'
        ? { clipboard: { write: async items => { clipboardData = (await items[0].data['text/plain']).text; } } }
        : mode === 'clipboard-blocked'
            ? { clipboard: { write: async () => { throw new Error('Permission denied'); } } }
            : {};
    const html = readFile('google-apps-script/copy-tracker-row.html');
    new Function(html.match(/<script>([\s\S]*?)<\/script>/)[1])();
    return { elements, getFetched: () => fetched, getReference: () => reference, getClipboard: () => clipboardData };
}

async function runTests() {
    const automatic = setupDialog('clipboard');
    assert(automatic.getFetched() === 0, 'Row was fetched before the copy click');
    await automatic.elements['copy-button'].fire('click');
    assert(automatic.getFetched() === 1 && automatic.getReference().rowNumber === 2, 'Copy did not request the selected row');
    assert(automatic.getClipboard() === 'current row\tcurrent price', 'Automatic copy did not use the fetched row');
    assert(automatic.elements.status.textContent.includes('Copied'), 'Automatic copy did not report success');

    const fallback = setupDialog('fallback');
    await fallback.elements['copy-button'].fire('click');
    assert(fallback.elements['copy-text'].selected, 'Fallback did not select the row text');
    assert(fallback.elements.status.textContent.includes('Command+C'), 'Blocked clipboard was not explained');

    const blocked = setupDialog('clipboard-blocked');
    await blocked.elements['copy-button'].fire('click');
    assert(blocked.elements['copy-text'].selected && blocked.elements.status.textContent.includes('Command+C'), 'Denied clipboard access did not offer manual copy');

    const failure = setupDialog('server-error');
    await failure.elements['copy-button'].fire('click');
    assert(failure.elements.status.textContent.includes('row changed'), 'Row validation error was hidden');
    assert(failure.elements['copy-text'].hidden, 'Failed row fetch exposed stale copy text');
}

let failure;
let finished = false;
runTests().then(() => { finished = true; print('Copy dialog tests passed'); }, error => { failure = error; });
drainMicrotasks();
if (failure) throw failure;
if (!finished) throw new Error('Copy dialog tests did not finish.');
