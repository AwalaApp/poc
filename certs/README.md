# X.509 Certificates and Private Keys

This directory contains all the certificates and corresponding private keys used by the nodes in this PoC (see [bin/](../bin)).

All the certificates are self-signed and the private keys are under version control to make it easier to try this proof of concept.

All the certificates here are compliant with [RS-002 (Relaynet PKI)](https://github.com/relaynet/specs/blob/master/rs002-pki.md) and were generated with [`generate-private-node-cert`](../bin-dev/generate-private-node-cert)/[`generate-public-node-cert`](../bin-dev/generate-public-node-cert), except for [`twitter-endpoint-server.cert.pem`](twitter-endpoint-server.cert.pem), which is a TLS certificate for a gRPC server supporting the PogRPC binding (so it's part of the Internet PKI per [RFC-5280](https://tools.ietf.org/html/rfc5280)).
