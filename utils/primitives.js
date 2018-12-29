'use strict';
// This is a proof of concept. The code below is ugly, inefficient and has no tests.

/**
 * Convert `string` to a byte array.
 *
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
 * Convert `integer` to a 64-bit, unsigned byte array.
 *
 * @param {number} integer
 * @returns {Uint8Array}
 */
function serializeVarbigint(integer) {
    // Proper implementation will support 64-bit precision as per spec.
    // See: https://github.com/nodejs/node/issues/21662
    if (integer < 0) {
        throw new Error(`varbigints are unsigned. Got ${integer}`);
    }

    if (!Number.isSafeInteger(integer)) {
        // We're actually only supporting 53-bit precision for now, until there's a
        // Math.log2() for bigints.
        throw new Error(`${integer} is too large`);
    }

    const octetsCount = countMinOctetsForInteger(integer);

    if (8 < octetsCount) {
        // Can't actually happen until `integer` becomes a BigInt.
        throw new Error(`${integer} can't be represented with a 64-bit unsigned int`);
    }

    const varbigint = new Uint8Array(octetsCount + 1);
    varbigint[0] = octetsCount;

    // Encode integer in little-endian
    let bigint = integer;
    let index = 1;
    while (bigint > 0) {
        varbigint[index++] = bigint & 0xff;
        bigint >>= 8;
    }

    return varbigint;
}

function countMinOctetsForInteger(bigint) {
    const bitsCount = Math.log2(bigint + 1);
    return Math.ceil(bitsCount / 8);
}

function deserializeVarbigint(varbigint) {
    const byteLength = varbigint.length;
    if (8 < byteLength) {
        throw new Error('Varbigint cannot require more than 64 bits');
    }

    if (6 < byteLength) {
        throw new Error('56- and 64-bit varbigints are currently unsupported in this PoC');
    }

    return varbigint.readUIntLE(0, byteLength);
}

module.exports = {
    deserializeVarbigint,
    serializeVarchar,
    serializeVarbigint
};
