// Version: 1.0.0
function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function setupDialog() {
    const elements = {};
    for (const id of ['settings-form', 'status', 'save-button', 'name', 'phone', 'personality',
        'warning', 'confirm-button', 'back-button', 'cancel-button']) {
        elements[id] = {
            value: '',
            hidden: id === 'warning',
            disabled: false,
            listeners: {},
            addEventListener(type, handler) { this.listeners[type] = handler; },
            fire(type) { this.listeners[type]({ preventDefault() {} }); }
        };
    }
    elements.name.value = 'Alex';
    elements.phone.value = '555-1234';
    globalThis.document = { getElementById: id => elements[id] };
    let saved;
    const runner = {
        withSuccessHandler() { return this; },
        withFailureHandler() { return this; },
        saveSalespersonSettings(settings) { saved = settings; }
    };
    globalThis.google = { script: { run: runner, host: { close() {} } } };
    const html = readFile('google-apps-script/salesperson-settings.html');
    new Function(html.match(/<script>([\s\S]*?)<\/script>/)[1])();
    return { elements, getSaved: () => saved };
}

const changed = setupDialog();
changed.elements.name.value = 'Sam';
changed.elements['settings-form'].fire('submit');
assert(!changed.elements.warning.hidden && !changed.getSaved(), 'Contact change did not show a warning before saving');
changed.elements['back-button'].fire('click');
assert(changed.elements.warning.hidden && !changed.getSaved(), 'Going back saved or cleared descriptions');
changed.elements['settings-form'].fire('submit');
changed.elements['confirm-button'].fire('click');
assert(changed.getSaved().confirmDescriptionClear === true, 'Confirmed deletion was not sent to the server');
assert(changed.getSaved().previousName === 'Alex' && changed.getSaved().previousPhone === '555-1234', 'Original contact values were not sent');

const personalityOnly = setupDialog();
personalityOnly.elements.personality.value = 'Friendly';
personalityOnly.elements['settings-form'].fire('submit');
assert(personalityOnly.elements.warning.hidden && personalityOnly.getSaved().confirmDescriptionClear === false, 'Personality-only edit required deletion');
print('Settings dialog tests passed');
