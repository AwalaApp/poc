'use strict';

function pemCertToDer(pemBuffer) {
    const oneliner = pemBuffer
        .toString()
        .replace(/(-----(BEGIN|END) CERTIFICATE-----|\n)/g, '');
    return Buffer.from(oneliner, 'base64');
}

function derCertToPem(derBuffer) {
    const lines = derBuffer.toString('base64').match(/.{1,64}/g);
    const pemString = [
        '-----BEGIN CERTIFICATE-----',
        ...lines,
        '-----END CERTIFICATE-----',
    ].join('\n');
    return Buffer.from(pemString);
}

module.exports = {
    pemCertToDer,
    derCertToPem,
};
