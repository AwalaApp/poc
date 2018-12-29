'use strict';
// This is a proof of concept. The code below is ugly, inefficient and has no tests.

const protobufjs = require('protobufjs');
const {Cargo, Parcel} = require('./index');
const BParser = require('binary-parser').Parser;

const MAX_LABELS_BLOCK_SIZE = (2 ** 12) - 1;
const MAX_PAYLOAD_SIZE = (2 ** 32) - 1;

const relaynetProtobuf = protobufjs.loadSync(__dirname + '/Relaynet.proto');

/**
 * Serializer for Relaynet Abstract Message Format v1
 *
 * The final implementation should probably use https://kaitai.io
 */
class MessageV1Serializer {

    /**
     * @param {number} signature The concrete message's signature digit
     * @param {number} version The concrete message's version digit
     * @param {protobufjs.Type} labelSetSerializer
     * @param messageClass
     */
    constructor(signature, version, labelSetSerializer, messageClass) {
        this._signature = signature;
        this._version = version;
        this._labelSetSerializer = relaynetProtobuf.lookupType(labelSetSerializer);
        this._messageClass = messageClass;

        this._parser = new BParser()
            .endianess('little')
            .string('magic', {length: 8, assert: 'Relaynet'})
            .uint8('formatSignature', {length: 1, assert: this._signature})
            .uint8('formatVersion', {length: 1, assert: this._version})
            .uint16('recipientLength', {length: 2})
            .string('recipient', {length: 'recipientLength'})
            .uint16('labelSetLength', {length: 2, assert: (v) => {
                // Can't use values defined outside function :(
                return v <= (2 ** 12) - 1
                }})
            .buffer('labelSetRaw', {length: 'labelSetLength'})
            .uint32('payloadLength', {length: 4})
            // Needless to say the payload mustn't be loaded in memory in real life
            .buffer('payloadRaw', {length: 'payloadLength'})
            .uint16('signatureLength', {length: 2})
            .buffer('signatureRaw', {length: 'signatureLength'})
            ;
    }

    /**
     * @param message
     * @returns {Buffer}
     */
    serialize(message) {
        const formatSignature = Buffer.allocUnsafe(10);
        formatSignature.write('Relaynet');
        formatSignature.writeUInt8(this._signature, 8);
        formatSignature.writeUInt8(this._version, 9);

        const recipient = Buffer.allocUnsafe(message.recipient.length + 2);
        recipient.writeUInt16LE(message.recipient.length, 0);
        recipient.write(message.recipient, 2, 'utf-8');

        const labelSet = this._serializeLabels(message.labels);
        const payload = this._serializePayload(message.payload);
        const partialMessageSerialization = Buffer.concat([formatSignature, recipient, labelSet, payload]);

        const signature = this._serializeSignature(partialMessageSerialization);
        return Buffer.concat([partialMessageSerialization, signature]);
    }

    _serializeLabels(labels) {
        // Only standard labels are supported in this PoC
        const labelSetMessage = this._labelSetSerializer.create(labels);

        const labelsSerialized = this._labelSetSerializer.encode(labelSetMessage).finish();
        const totalLength = labelsSerialized.length;
        if (MAX_LABELS_BLOCK_SIZE < totalLength) {
            throw new Error('Labels block exceeds maximum length of 12-bit');
        }
        const lengthPrefix = Buffer.allocUnsafe(2);
        lengthPrefix.writeUInt16LE(totalLength, 0);
        return Buffer.concat([lengthPrefix, labelsSerialized], totalLength + 2);
    }

    _serializePayload(payloadRaw) {
        // TODO: Encrypt when requested
        const length = payloadRaw.length;
        if (MAX_PAYLOAD_SIZE < length) {
            throw new Error('Payload exceeds maximum length of 32-bit');
        }
        const lengthPrefix = Buffer.allocUnsafe(4);
        lengthPrefix.writeUInt32LE(length, 0);
        return Buffer.concat([lengthPrefix, payloadRaw], length + 4);
    }

    _serializeSignature(partialMessageSerialization) {
        // TODO: Implement actual signing!
        const shasum = crypto.createHash('sha1');
        shasum.update(partialMessageSerialization);
        const signatureRaw = Buffer.from(shasum.digest());
        const lengthPrefix = Buffer.allocUnsafe(2);
        lengthPrefix.writeUInt16LE(signatureRaw.length, 0);
        return Buffer.concat([lengthPrefix, signatureRaw]);
    }

    deserialize(buffer) {
        const ast = this._parser.parse(buffer);
        return new this._messageClass(
            ast.recipient,
            this._labelSetSerializer.decode(ast.labelSetRaw),
            ast.payloadRaw,
            ast.signatureRaw,
        );
    }
}

const CARGO_SERIALIZER = new MessageV1Serializer('C'.charCodeAt(0), 1, 'CargoLabelSet', Cargo);
const PARCEL_SERIALIZER = new MessageV1Serializer('P'.charCodeAt(0), 1, 'ParcelLabelSet', Parcel);

module.exports = {
    CARGO_SERIALIZER,
    PARCEL_SERIALIZER,
};
