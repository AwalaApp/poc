'use strict';
// This is a proof of concept. The code below is ugly, inefficient and has no tests.

// Utilities to support RS-002 (https://github.com/relaynet/specs/blob/master/rs002-rpki.md)

const assert = require('assert').strict;
const {certificateFromPem} = require('node-forge').pki;

/**
 * @param {Buffer} certPem
 * @returns {string}
 */
function getAddressFromCert(certPem) {
    const cert = certificateFromPem(certPem);
    const extension = cert.getExtension('subjectAltName');
    assert.equal(extension.altNames.length, 1, 'There must be exactly one alt name');
    const altName = extension.altNames[0];
    assert.equal(altName.type, 6, 'The alt name must be of type URI');
    return altName.value;
}

module.exports = {
    getAddressFromCert,
};
