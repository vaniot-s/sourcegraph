# Tech stack

This document lists the technologies that we prefer to use by default.

If you would like to build something that does not conform to our standard tech stack:

1. Write an [RFC](rfcs/index.md) that explains why you want to use a different technology.
2. Open a PR that adds a description for the new exception to this document.

If there are enough exceptions of the same kind (i.e. at least 3), we can consider updating our policy so that these cases are no longer considered exceptions.

## Web environments

We use TypeScript and React in web environments (e.g. web apps, browser extensions).

### Exceptions

None.

## Backends

We use Go to write backend services.

## Exceptions

### syntect-server

[syntect-server](https://github.com/sourcegraph/syntect_server) is a minimal HTTP server written in Rust that wraps the [Syntect](https://github.com/trishume/syntect) syntax highlighting library (also written in Rust) to expose a JSON API. This service does not require a lot of maintance, but when it does, [it is a pain](https://sourcegraph.slack.com/archives/C02FSM7DW/p1568340378055300?thread_ts=1568340378.055300).

Why do we put up with this pain? As of October 2019, Syntect continues to be the best option for us to deliver high quality syntax highlighting to our users across a wide variety of languages. References:

- [Original rational](https://news.ycombinator.com/item?id=17932872)
- [Syntect vs. VS Code syntax highlighting
](https://docs.google.com/document/d/1MqqEgihKzRehdDS_k9kb8t_p8vROCymC2FWn1Yvj6Ng/edit)

### lsif-server

This was written in TypeScript so we could directly depend on the official [LSIF type definitions that are published by Microsoft as a TypeScript interface](https://github.com/microsoft/lsif-node/blob/master/protocol/src/protocol.ts).

### LSIF generators and language servers

LSIF generators and language servers should usually be written in the language that they are designed to analyze for two reasons:

1. This aligns the incentive to maintain the LSIF generator or language server with the community that benefits from it.
2. Existing language analysis libraries that would be useful to leverage are usually written in the target language being analyzed.
