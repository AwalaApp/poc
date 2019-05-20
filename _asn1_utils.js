'use strict';

/**
 * @param {Buffer} pemBuffer
 * @return {Buffer}
 */
function pemToDer(pemBuffer) {
    const oneliner = pemBuffer
        .toString()
        .replace(/(-----(BEGIN|END) (CERTIFICATE|PRIVATE KEY)-----|\n)/g, '');
    return Buffer.from(oneliner, 'base64');
}

/**
 * @param {Buffer} derBuffer
 * @return {Buffer}
 */
function derCertToPem(derBuffer) {
    return derToPem(derBuffer, 'CERTIFICATE');
}

/**
 * @param {Buffer} derBuffer
 * @return {Buffer}
 */
function derKeyToPkcs8Pem(derBuffer) {
    return derToPem(derBuffer, 'PRIVATE KEY');
}

/**
 * @param {Buffer} derBuffer
 * @param {string} tagName
 * @returns {Buffer}
 */
function derToPem(derBuffer, tagName) {
    const lines = derBuffer.toString('base64').match(/.{1,64}/g);
    const pemString = [
        `-----BEGIN ${tagName}-----`,
        ...lines,
        `-----END ${tagName}-----`,
    ].join('\n');
    return Buffer.from(pemString);
}

function isPemCert(certBuffer) {
    return certBuffer.slice(0, 27).toString() === '-----BEGIN CERTIFICATE-----';
}

/**
 * @param asn1jsValue
 * @returns {Buffer}
 */
function serializeAsn1jsValue(asn1jsValue) {
    return Buffer.from(asn1jsValue.toSchema(true).toBER(false));
}

module.exports = {
    derCertToPem,
    derKeyToPkcs8Pem,
    isPemCert,
    pemToDer,
    serializeAsn1jsValue,
};
