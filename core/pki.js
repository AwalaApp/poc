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
    const address = cert.subject.getField('CN').value;
    assert(address, 'There must be a CN field');
    return address;
}

module.exports = {
    getAddressFromCert,
};
