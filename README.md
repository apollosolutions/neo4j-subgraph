# `@neo4j/graphql` + Apollo Federation

This repo demonstrates how to add bare-bones support for the Apollo Federation
subgraph spec to a GraphQL server powered by `@neo4j/graphql`.

**The code in this repository is experimental and has been provided for reference purposes only. Community feedback is welcome but this project may not be supported in the same way that repositories in the official [Apollo GraphQL GitHub organization](https://github.com/apollographql) are. If you need help you can file an issue on this repository, [contact Apollo](https://www.apollographql.com/contact-sales) to talk to an expert, or create a ticket directly in Apollo Studio.**

---

The primary concern is generating [the Query.\_entities resolver](https://www.apollographql.com/docs/federation/entities#reference-resolvers),
which usually comes for free with `@apollo/subgraph`. However, it's not
currently possible to combine a Neo4J schema with `buildSubgraphSchema` so we
must provide our own entity resolver.

In addition, this script uses the `printSchemaWithDirectives` function from
`@graphql-tools/utils` to demonstrate how we can generate the full SDL for
composition and publishing to Apollo Studio. The SDL will contain federation
schema elements like the `_Entities` union, which is currently accepted by
composition (even though the [Subgraph Spec](https://www.apollographql.com/docs/federation/federation-spec/)
indicates otherwise).

## Setup

Add your Neo4j Aura endpoint, username, and password to the `.env` file.

```sh
yarn install
yarn nodemon
```

## Testing

### Seed data

```graphql
mutation CreateMovie {
  createMovies(input: [{ title: "Jaws" }, { title: "Psycho" }]) {
    movies {
      id
      title
    }
  }
}
```

```graphql
mutation CreateActors {
  createActors(
    input: [
      {
        name: "Richard Dreyfuss"
        connect: { where: { node: { id: "<ID FROM JAWS>" } } }
      }
      {
        name: "Janet Leigh"
        connect: { where: { node: { id: "<ID FROM PSYCHO>" } } }
      }
    ]
  ) {
    actors {
      id
      name
    }
  }
}
```

### Run an entities query

```graphql
query ($representations: [_Any!]!) {
  _entities(representations: $representations) {
    ... on Movie {
      id
      title
      actors {
        name
      }
    }
    ... on Actor {
      id
      name
      movies {
        title
      }
    }
  }
}
```

Variables:

```json
{
  "representations": [
    { "__typename": "Movie", "id": "<ID FROM JAWS>" },
    { "__typename": "Actor", "id": "<ID FROM RICHARD DREYFUSS" },
    { "__typename": "Actor", "id": "<ID FROM JANET LEIGH>" },
    { "__typename": "Movie", "id": "<ID FROM PSYCHO>" }
  ]
}
```

## Publishing to studio

```sh
node index.js print > rover subgraph publish --name neo4j --schema -
```
