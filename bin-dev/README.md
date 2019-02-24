# Development tools

This directory contains scripts that were handy during the development of the PoC, and could also be handy early on in an eventual production-ready implementation.

## Generating keys for _private_ endpoints or gateways

Use [`generate-private-node-cert`](generate-private-node-cert) to generate a private key with a corresponding certificate for an endpoint with an opaque address:

```bash
./generate-private-node-cert rne /tmp/endpoint_cert.pem /tmp/endpoint_key.pem
```

The following will generate a private key with a corresponding certificate for a gateway with an opaque address:

```bash
./generate-private-node-cert rng /tmp/gateway_cert.pem /tmp/gateway_key.pem
```

## Generating keys for _public_ endpoints or gateways

Use [`generate-public-node-cert`](generate-public-node-cert) to generate a private key with a corresponding certificate for a public endpoint:

```bash
./generate-public-node-cert rne://api.example.com /tmp/endpoint_cert.pem /tmp/endpoint_key.pem
```

The following will generate a private key with a corresponding certificate for a public gateway:

```bash
./generate-public-node-cert rng://relayer.com /tmp/gateway_cert.pem /tmp/gateway_key.pem
```

If you want to use a parcel delivery or cargo relay _binding_ over TLS, you also have to generate a separate pair of keys for the server as usual. For example:

```bash
# Generate self-signed certificate for api.example.com
openssl req -x509 -newkey \
    rsa:4096 \
    -subj '/CN=api.example.com' \
    -keyout key.pem \
    -out cert.pem \
    -days 365
```

## Generating and inspecting parcels

[`generate-parcel`](generate-parcel) can be used to create parcels. The following will generate a _parcel_ from the _endpoint_ E1 to the _endpoint_ E2, encrypted with E2's X.509 certificate and signed with E1's private key. The payload will be the ASCII string `Winter is coming` (but it could be anything, even a binary stream).

```bash
./generate-private-node-cert rne /tmp/e1_cert.pem /tmp/e1_key.pem
./generate-private-node-cert rne /tmp/e2_cert.pem /tmp/e2_key.pem

echo "Winter is coming" | ./generate-parcel \
    --recipient-cert /tmp/e2_cert.pem \
    --sender-cert /tmp/e1_cert.pem \
    --sender-key /tmp/e1_key.pem \
    --type text/plain \
    > /tmp/output.parcel
```

The parcel would've been saved to `/tmp/output.parcel`. Its contents could then be inspected and (optionally) decrypted with [`inspect-message`](inspect-message) -- for example:

```bash
./inspect-message \
    --recipient-key /tmp/e2_key.pem \
    --decode-payload \
    < /tmp/output.parcel
```

Also handy during development, to detect regressions as soon as possible:

```bash
echo "Winter is coming" | ./generate-parcel \
    --recipient-cert /tmp/e2_cert.pem \
    --sender-cert /tmp/e1_cert.pem \
    --sender-key /tmp/e1_key.pem \
    --type text/plain \
    | \
    ./inspect-message \
        --recipient-key /tmp/e2_key.pem \
        --decode-payload
```

## Generating and inspecting cargoes

[`generate-parcel`](generate-cargo) can be used to create cargoes. The following will generate a _cargo_ from _gateway_ G1 to _gateway_ G2, encrypted with G2's X.509 certificate and signed with G1's private key. The payload will be two parcels: `/tmp/01.parcel` and `/tmp/02.parcel`, which could've been created with `generate-parcel`.

```bash
./generate-private-node-cert rng /tmp/g1_cert.pem /tmp/g1_key.pem
./generate-private-node-cert rng /tmp/g2_cert.pem /tmp/g2_key.pem

./generate-cargo \
    --recipient-cert /tmp/g2_cert.pem \
    --sender-cert /tmp/g1_cert.pem \
    --sender-key /tmp/g1_key.pem \
    /tmp/01.parcel \
    /tmp/02.parcel \
    > /tmp/output.cargo
```

The cargo would've been saved to `/tmp/output.cargo`. Its contents could then be inspected and (optionally) decrypted with [`inspect-message`](inspect-message) -- for example:

```bash
./inspect-message \
  --recipient-key /tmp/g2_key.pem \
  --decode-payload \
  < /tmp/output.cargo
```
