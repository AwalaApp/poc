# X.509 Certificates and Private Keys

This directory contains all the certificates and corresponding private keys used by the nodes in this PoC (see [bin/](../bin/)).

The private keys are under version control to make it easier to try this proof of concept.

All the certificates here are compliant with [RS-002 (Relaynet PKI)](https://github.com/relaynet/specs/blob/master/rs002-rpki.md), except for [`twitter-endpoint-server.cert.pem`](twitter-endpoint-server.cert.pem), which is a TLS certificate for the PogRPC binding (so it's part of the Internet PKI per [RFC-5280](https://tools.ietf.org/html/rfc5280)).
