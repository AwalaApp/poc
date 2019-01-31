# Relaynet Core library

This binding-agnostic library provides some core functionality that applications and binding implementations may need:

- Data structures to represent deserialized parcels and cargoes ([`messages.js`](messages.js)).
- [RAMF](https://github.com/relaynet/specs/blob/master/rs001-ramf.md) serializers and deserializers ([`serialization.js`](serialization.js)).
- Utilities to support the [Relaynet PKI](https://github.com/relaynet/specs/blob/master/rs002-pki.md) ([`pki.js`](pki.js)).

The eventual production-ready implementation will be an NPM package (e.g., `@relaynet/core`).
