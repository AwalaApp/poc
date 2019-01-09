# Relaynet's Proof of Concept

This monorepo implements a proof of concept of Twitter running on [Relaynet](https://relaynet.link). It lacks  most of the basic functionality and has an unfriendly UI. Its purpose is just to validate and then improve Relaynet's effectiveness beyond the theory.

# High-Level Intro to Relaynet

Relaynet is a message-passing protocol suite that will make it possible to relay data outside the Internet, via [sneakernets](https://en.wikipedia.org/wiki/Sneakernet) or wireless systems, using end-to-end encryption. **Its designed to circumvent government-sponsored [Internet blackouts](https://www.accessnow.org/keepiton/).**

To achieve this, it will make existing and future Internet-dependent systems (e.g., social networks) tolerant to latencies lasting anywhere from hours to weeks by helping them adopt an asynchronous messaging pattern -- as opposed to the Remote Procedure Call (RPC) pattern that HTTP-based APIs depend on, which assumes a reliable connection.

The architecture draws heavily on the fields of [Delay-Tolerant Networking](https://en.wikipedia.org/wiki/Delay-tolerant_networking) and cryptography, and builds on pre-existing standards and technologies where possible, such as [X.509](https://en.wikipedia.org/wiki/X.509) and the [Cryptographic Message Syntax (CMS)](https://en.wikipedia.org/wiki/Cryptographic_Message_Syntax).

Relaynet is also the name of the [overlay](https://en.wikipedia.org/wiki/Overlay_network), [store-and-forward](https://en.wikipedia.org/wiki/Store_and_forward), [onion](https://en.wikipedia.org/wiki/Onion_routing) network resulting from the protocol suite.

## Protocol Suite Overview

TODO

## Example

There are various ways that Twitter could support Relaynet, whether officially or through a third party integration. The latter is undesirable because the communication wouldn't be completely encrypted end-to-end.

Let's consider a scenario where Twitter deployed a Relaynet _adapter_ on top of its pre-existing API. The overall system, including the user's computer or phone, would look like this:

![](diagrams/relaynet-twitter-level1.png)

Same example, presented as a sequence diagram:

![](diagrams/twitter-sequence.png)

## High-Level, Incomplete Spec

TODO

# Proof of Concept

Similar to the example above, but using an adapter run by a third party (so not completely end-to-end encrypted).

![](diagrams/relaynet-twitter-level3.png)

## Development utilities

### Generating messages

The following will generate a parcel for the endpoint `rne:targetEndpointAddr`, from the endpoint whose X.509 certificate (chain) is available at `samples/alice_cert.der`. The payload will be the contents of `samples/payload.txt`.

```bash
./bin/generate-message \
    --type parcel \
    --recipient rneo:targetEndpointAddr \
    --recipient-cert samples/bob_cert.pem \
    --sender-cert samples/alice_cert.pem \
    --sender-key samples/alice_key.pem \
    < samples/payload.txt \
    > /tmp/output.parcel
```

The parcel would've been saved to `/tmp/output.parcel`.

### Inspecting messages

Example with the parcel generated above:

```bash
./bin/inspect-message \
    --recipient-key samples/bob_key.pem \
    --decode-payload \
    /tmp/output.parcel
```
