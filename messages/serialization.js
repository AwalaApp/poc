'use strict';
// This is a proof of concept. The code below is ugly, inefficient and has no tests.

const BParser = require('binary-parser').Parser;
const cms = require('./_cms');
const {Cargo, Parcel} = require('./index');
const {pemCertToDer} = require('./_asn1_utils');

const MAX_SENDER_CERT_SIZE = (2 ** 13) - 1; // 13-bit, unsigned integer
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
            .uint32('payloadLength', {length: 4})
            // Needless to say the payload mustn't be loaded in memory in real life
            .buffer('payloadRaw', {length: 'payloadLength'})
            .uint16('signatureLength', {length: 2})
            .buffer('signature', {length: 'signatureLength'})
            ;
    }

    /**
     * @param message
     * @param {string} recipientCertPath Path to the recipient's X.509. Should be a buffer in "real life".
     * @param {string} senderKeyPath
     * @param {string} signatureHashAlgo
     * @returns {Buffer}
     */
    async serialize(message, recipientCertPath, senderKeyPath, signatureHashAlgo) {
        const formatSignature = Buffer.allocUnsafe(10);
        formatSignature.write('Relaynet');
        formatSignature.writeUInt8(this._signature, 8);
        formatSignature.writeUInt8(this._version, 9);
        const partialMessageSerialization = Buffer.concat([
            formatSignature,
            this._serializeSignatureHashAlgo(signatureHashAlgo),
            this._serializeRecipient(message),
            this._serializeSenderCert(message.senderCert),
            await this._serializePayload(message.payload, recipientCertPath),
        ]);

        const signature = await this._serializeSignature(
            partialMessageSerialization,
            senderKeyPath,
            message.senderCert,
            signatureHashAlgo,
        );
        return Buffer.concat([partialMessageSerialization, signature]);
    }

    _serializeRecipient(message) {
        const recipient = Buffer.allocUnsafe(message.recipient.length + 2);
        recipient.writeUInt16LE(message.recipient.length, 0);
        recipient.write(message.recipient, 2, 'utf-8');
        return recipient;
    }

    _serializeSignatureHashAlgo(hashAlgo) {
        const hashAlgoBuffer = Buffer.alloc(8); // Zero-filled per spec
        // Don't truncate silently in the final implementation
        hashAlgoBuffer.write(hashAlgo, 'ascii');
        return hashAlgoBuffer;
    }

    _serializeSenderCert(certPem) {
        const certDer = pemCertToDer(certPem);
        const certLength = certDer.length;
        if (MAX_SENDER_CERT_SIZE < certLength) {
            throw new Error(`Sender's certificate can't exceed ${MAX_SENDER_CERT_SIZE} octets`);
        }
        const lengthPrefix = Buffer.allocUnsafe(2);
        lengthPrefix.writeUInt16LE(certLength, 0);
        return Buffer.concat([lengthPrefix, certDer]);
    }

    async _serializePayload(payloadRaw, recipientCertPath) {
        // TODO: Support "data" type (i.e., unencrypted payload)
        const ciphertext = await cms.encrypt(payloadRaw, recipientCertPath);
        const length = ciphertext.length;
        if (MAX_PAYLOAD_SIZE < length) {
            throw new Error('Payload exceeds maximum length of 32-bit');
        }
        const lengthPrefix = Buffer.allocUnsafe(4);
        lengthPrefix.writeUInt32LE(length, 0);
        return Buffer.concat([lengthPrefix, ciphertext], length + 4);
    }

    async _serializeSignature(partialMessageSerialization, senderKeyPath, senderCert, hashAlgorithm) {
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

    async deserialize(buffer) {
        const ast = this._parser.parse(buffer);

        // Verify signature and error out if it's invalid
        const signatureBlockLength = ast.signature.length + 2;
        const plaintext = buffer.slice(0, signatureBlockLength * (-1));
        await cms.verifySignature(plaintext, ast.signature, ast.senderCert);

        return new this._messageClass(
            ast.recipient,
            ast.senderCert,
            ast.payloadRaw,
        );
    }
}

const CARGO_SERIALIZER = new MessageV1Serializer('C'.charCodeAt(0), 1, Cargo);
const PARCEL_SERIALIZER = new MessageV1Serializer('P'.charCodeAt(0), 1, Parcel);

module.exports = {
    CARGO_SERIALIZER,
    PARCEL_SERIALIZER,
};
