'use strict';
// This is a proof of concept. The code below is ugly, inefficient and has no tests.

const BParser = require('binary-parser').Parser;
const cms = require('./_cms');
const fs = require('fs');
const uuid4 = require('uuid4');
const {Cargo, Parcel} = require('./index');
const {getAddressFromCert} = require('./utils');
const {pemCertToDer} = require('./_asn1_utils');

const MAX_SENDER_CERT_SIZE = (2 ** 13) - 1; // 13-bit, unsigned integer
const MAX_ID_SIZE = (2 ** 16) - 1; // 16-bit, unsigned integer
const MAX_DATE_SIZE = (2 ** 32) - 1; // 32-bit, unsigned integer
const MAX_PAYLOAD_SIZE = (2 ** 32) - 1; // 32-bit, unsigned integer
const MAX_SIGNATURE_SIZE = (2 ** 12) - 1; // 12-bit, unsigned integer

/**
 * Serializer for Relaynet Abstract Message Format v1
 *
 * The final implementation should probably use https://kaitai.io
 */
class MessageV1Serializer {

    /**
     * @param {number} signature The concrete message's signature digit
     * @param {number} version The concrete message's version digit
     * @param messageClass
     */
    constructor(signature, version, messageClass) {
        this._signature = signature;
        this._version = version;
        this._messageClass = messageClass;

        this._parser = new BParser()
            .endianess('little')
            .string('magic', {length: 8, assert: 'Relaynet'})
            .uint8('formatSignature', {length: 1, assert: this._signature})
            .uint8('formatVersion', {length: 1, assert: this._version})
            .string('signatureHashAlgo', {length: 8})
            .uint16('recipientLength', {length: 2})
            .string('recipient', {length: 'recipientLength'})
            .uint16('senderCertLength', {length: 2})
            .buffer('senderCert', {length: 'senderCertLength'})
            .uint16('idLength', {length: 2})
            .string('id', {length: 'idLength', encoding: 'ascii'})
            .uint32('date', {length: 4})
            .uint32('payloadLength', {length: 4})
            // Needless to say the payload mustn't be loaded in memory in real life
            .buffer('payload', {length: 'payloadLength'})
            .uint16('signatureLength', {length: 2})
            .buffer('signature', {length: 'signatureLength'})
            ;
    }

    static _serializeRecipient(recipientCertPath) {
        const cert = fs.readFileSync(recipientCertPath);
        const recipientAddress = getAddressFromCert(cert);
        const recipientAddressBuffer = Buffer.from(recipientAddress, 'utf-8');
        const lengthPrefix = Buffer.allocUnsafe(2);
        lengthPrefix.writeUInt16LE(recipientAddressBuffer.length, 0);
        return Buffer.concat([lengthPrefix, recipientAddressBuffer]);
    }

    static _serializeSignatureHashAlgo(hashAlgo) {
        const hashAlgoBuffer = Buffer.alloc(8); // Zero-filled per spec
        // Don't truncate silently in the final implementation
        hashAlgoBuffer.write(hashAlgo, 'ascii');
        return hashAlgoBuffer;
    }

    static _serializeSenderCert(certPem) {
        const certDer = pemCertToDer(certPem);
        const certLength = certDer.length;
        if (MAX_SENDER_CERT_SIZE < certLength) {
            throw new Error(`Sender's certificate can't exceed ${MAX_SENDER_CERT_SIZE} octets`);
        }
        const lengthPrefix = Buffer.allocUnsafe(2);
        lengthPrefix.writeUInt16LE(certLength, 0);
        return Buffer.concat([lengthPrefix, certDer]);
    }

    static _serializeId(id) {
        const idBuffer = Buffer.from(id || uuid4());
        if (MAX_ID_SIZE < idBuffer.length) {
            throw new Error(`The message's id can't exceed ${MAX_ID_SIZE} octets`);
        }
        const lengthPrefix = Buffer.allocUnsafe(2);
        lengthPrefix.writeUInt16LE(idBuffer.length, 0);
        return Buffer.concat([lengthPrefix, idBuffer]);
    }

    static _serializeDate(date) {
        date = date || new Date();
        const timestamp = Math.floor(date.getTime() / 1000);
        if (timestamp < 0) {
            throw new Error("Message date can't be before Unix epoch");
        }
        if (MAX_DATE_SIZE < timestamp) {
            throw new Error("Date can't be represented with 32-bit unsigned integer");
        }
        const dateBuffer = Buffer.allocUnsafe(4);
        dateBuffer.writeUInt32LE(timestamp);
        return dateBuffer;
    }

    static async _serializePayload(payload, recipientCertPath) {
        // TODO: Support "data" type (i.e., unencrypted payload)
        const ciphertext = await cms.encrypt(payload, recipientCertPath);
        const length = ciphertext.length;
        if (MAX_PAYLOAD_SIZE < length) {
            throw new Error('Payload exceeds maximum length of 32-bit');
        }
        const lengthPrefix = Buffer.allocUnsafe(4);
        lengthPrefix.writeUInt32LE(length, 0);
        return Buffer.concat([lengthPrefix, ciphertext], length + 4);
    }

    static async _serializeSignature(partialMessageSerialization, senderKeyPath, senderCert, hashAlgorithm) {
        const signature = await cms.sign(
            partialMessageSerialization,
            senderKeyPath,
            senderCert,
            hashAlgorithm,
        );
        const signatureLength = signature.length;
        if (MAX_SIGNATURE_SIZE < signatureLength) {
            throw new Error(`Signature cannot exceed ${MAX_SIGNATURE_SIZE} octets`);
        }
        const lengthPrefix = Buffer.allocUnsafe(2);
        lengthPrefix.writeUInt16LE(signatureLength, 0);
        return Buffer.concat([lengthPrefix, signature]);
    }

    /**
     * @param payload
     * @param {string} recipientCertPath Path to the recipient's X.509. Should be a buffer in "real life".
     * @param {string} senderCert
     * @param {string} senderKeyPath
     * @param {string} signatureHashAlgo
     * @param {string|null} id If absent, an id will be generated
     * @param {Date|null} date When the message was created. Defaults to now.
     * @returns {Buffer}
     */
    async serialize(payload, recipientCertPath, senderCert, senderKeyPath, signatureHashAlgo, id = null, date = null) {
        const formatSignature = Buffer.allocUnsafe(10);
        formatSignature.write('Relaynet');
        formatSignature.writeUInt8(this._signature, 8);
        formatSignature.writeUInt8(this._version, 9);
        const partialMessageSerialization = Buffer.concat([
            formatSignature,
            this.constructor._serializeSignatureHashAlgo(signatureHashAlgo),
            this.constructor._serializeRecipient(recipientCertPath),
            this.constructor._serializeSenderCert(senderCert),
            this.constructor._serializeId(id),
            this.constructor._serializeDate(date),
            await this.constructor._serializePayload(payload, recipientCertPath),
        ]);

        const signature = await this.constructor._serializeSignature(
            partialMessageSerialization,
            senderKeyPath,
            senderCert,
            signatureHashAlgo,
        );
        return Buffer.concat([partialMessageSerialization, signature]);
    }

    async deserialize(buffer) {
        const ast = this._parser.parse(buffer);

        // Verify signature and error out if it's invalid
        const signatureBlockLength = ast.signature.length + 2;
        const plaintext = buffer.slice(0, signatureBlockLength * (-1));
        await cms.verifySignature(plaintext, ast.signature, ast.senderCert);

        return new this._messageClass(
            ast.recipient,
            ast.senderCert,
            ast.id,
            new Date(ast.date * 1000),
            ast.payload,
        );
    }
}

const CARGO_SERIALIZER = new MessageV1Serializer('C'.charCodeAt(0), 1, Cargo);
const PARCEL_SERIALIZER = new MessageV1Serializer('P'.charCodeAt(0), 1, Parcel);

function serializeCargoPayload(...parcels) {
    // Needless to say the final implementation won't be loading everything in memory
    const parcelsLengthPrefixed = parcels.map(parcel => {
        const parcelLength = parcel.length;
        const parcelLengthPrefixed = Buffer.allocUnsafe(4 + parcelLength);
        parcelLengthPrefixed.writeUInt32LE(parcelLength, 0);
        parcel.copy(parcelLengthPrefixed, 4);
        return parcelLengthPrefixed;
    });
    return Buffer.concat(parcelsLengthPrefixed);
}

function deserializeCargoPayload(payload) {
    const parcels = [];

    let index = 0;
    while (index < payload.length) {
        const parcelLength = payload.readUInt32LE(index);
        index += 4;
        parcels.push(payload.slice(index, index + parcelLength));
        index += parcelLength;
    }

    return parcels;
}

module.exports = {
    CARGO_SERIALIZER,
    PARCEL_SERIALIZER,
    serializeCargoPayload,
    deserializeCargoPayload,
};
