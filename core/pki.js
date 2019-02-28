'use strict';
// This is a proof of concept. The code below is ugly, inefficient and has no tests.

// Utilities to support RS-002 (https://github.com/relaynet/specs/blob/master/rs002-pki.md)

const assert = require('assert').strict;
const {certificateFromPem} = require('node-forge').pki;
const {derCertToPem, isPemCert} = require('../_asn1_utils');

/**
 * @param {Buffer} certSerialized
 * @returns {string}
 */
function getAddressFromCert(certSerialized) {
    // The production equivalent of this function MUST validate the address.
    const pemCert = isPemCert(certSerialized) ? certSerialized : derCertToPem(certSerialized);
    const cert = certificateFromPem(pemCert);
    const extension = cert.getExtension('subjectAltName');
    assert.equal(extension.altNames.length, 1, 'There must be exactly one alt name');
    const altName = extension.altNames[0];
    assert.equal(altName.type, 6, 'The alt name must be of type URI');
    return altName.value;
}

module.exports = {
    getAddressFromCert,
};
