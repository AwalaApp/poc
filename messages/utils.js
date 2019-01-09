'use strict';
// This is a proof of concept. The code below is ugly, inefficient and has no tests.

const assert = require('assert').strict;
const {certificateFromPem} = require('node-forge').pki;

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
