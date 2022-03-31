import { Neo4jGraphQL } from "@neo4j/graphql";
import neo4j from "neo4j-driver";
import ogmPkg from "@neo4j/graphql-ogm";
import { ApolloServer, gql } from "apollo-server";
import { config } from "dotenv";
import { createEntityDataloaderFactory } from "./entity-dataloaders.js";
import { printSchemaWithDirectives } from "@graphql-tools/utils";

const { OGM } = ogmPkg;

config();

// Same as the Getting Started docs (https://neo4j.com/docs/graphql-manual/current/getting-started/#_define_your_graphql_type_definitions)
// with Apollo Federation elements added.
const typeDefs = gql`
  scalar _FieldSet
  scalar _Any
  directive @key(fields: _FieldSet!) repeatable on OBJECT | INTERFACE

  union _Entity = Actor | Movie

  type Query {
    _entities(representations: [_Any!]!): [_Entity]!
  }

  type Movie @key(fields: "id") {
    id: ID! @id
    title: String
    actors: [Actor!]! @relationship(type: "ACTED_IN", direction: IN)
  }

  type Actor @key(fields: "id") {
    id: ID! @id
    name: String
    movies: [Movie!]! @relationship(type: "ACTED_IN", direction: OUT)
  }
`;

const driver = neo4j.driver(
  process.env.AURA_ENDPOINT,
  neo4j.auth.basic(process.env.AURA_USERNAME, process.env.AURA_PASSWORD)
);

const ogm = new OGM({ typeDefs, driver });

/** @type {import("./entity-dataloaders.js").EntityConfiguration<any, any>[]} */
const entityConfiguration = [
  {
    name: "Movie",
    model: ogm.model("Movie"),
    refToKey: (ref) => ref.id,
    whereClause: (keys) => ({ id_IN: keys }),
  },
  {
    name: "Actor",
    model: ogm.model("Actor"),
    refToKey: (ref) => ref.id,
    whereClause: (keys) => ({ id_IN: keys }),
  },
];

const entityDataloaderFactory =
  createEntityDataloaderFactory(entityConfiguration);

const neoSchema = new Neo4jGraphQL({
  typeDefs,
  driver,
  resolvers: {
    Query: {
      _entities(_source, { representations }, _context, info) {
        const dataloaders = entityDataloaderFactory(
          info.fieldNodes[0].selectionSet
        );

        // Using dataloader.load ensures that the entities are returned in the
        // same order as the representations argument. This is critical for
        // ensuring that entities are correctly joined across subgraphs.
        return representations.map((reference) => {
          const { __typename } = reference;
          return dataloaders.get(__typename).load(reference);
        });
      },
    },
    _Entity: {
      /**
       * @param {{ __typename: string; }} ref
       */
      __resolveType(ref) {
        return ref.__typename;
      },
    },
  },
});

await ogm.init();
const schema = await neoSchema.getSchema();

// print the full schema to stdout if asked
if (process.argv[2] === "print") {
  console.log(printSchemaWithDirectives(schema));
} else {
  // otherwise run a server
  const server = new ApolloServer({ schema });
  const { url } = await server.listen(4000);
  console.log(`🚀 Server ready at ${url}`);
}
