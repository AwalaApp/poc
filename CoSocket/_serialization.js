'use strict';
// This is a proof of concept. The code below is ugly, inefficient and has no tests.

const _MAX_INTEGER = (2 ** 32) - 1; // 32-bit

/**
 * @param {string} string
 * @returns {Uint8Array}
 */
function serializeVarchar(string) {
    const stringBuffer = Buffer.from(string);
    const stringBufferLength = stringBuffer.length;

    if (256 < stringBufferLength) {
        throw new Error(`Cannot create a varchar of more than 256 octets`);
    }

    const varchar = new Uint8Array(1 + stringBufferLength);
    varchar[0] = stringBufferLength;
    varchar.set(stringBuffer, 1);
    return varchar;
}

/**
 * @param {number} integer
 * @returns {Buffer}
 */
function serializeInteger(integer) {
    if (integer < 0) {
        throw new Error(`Integers can't be signed. Got ${integer}`);
    }

    if (_MAX_INTEGER < integer) {
        throw new Error(`${integer} can't be represented with a 32-bit unsigned int`);
    }

    const integerSerialized = Buffer.allocUnsafe(4);
    integerSerialized.writeUInt32LE(integer, 0);
    return integerSerialized;
}

/**
 * @param {Buffer} integerSerialized
 * @returns {number}
 */
function deserializeInteger(integerSerialized) {
    const byteLength = integerSerialized.length;
    if (byteLength !== 4) {
        throw new Error('Integers must use 32 bits');
    }

    return integerSerialized.readUInt32LE(0);
}

module.exports = {
    deserializeInteger,
    serializeInteger,
    serializeVarchar,
};
