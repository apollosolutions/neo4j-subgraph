import { Neo4jGraphQL } from "@neo4j/graphql";
import neo4j from "neo4j-driver";
import ogmPkg from "@neo4j/graphql-ogm";
import { ApolloServer, gql } from "apollo-server";
import { config } from "dotenv";
import { extractSelectionSetMap } from "./entity-dataloaders.js";
import { getResolversFromSchema, printSchemaWithDirectives } from "@graphql-tools/utils";
import { buildSubgraphSchema } from "@apollo/subgraph";

const { OGM } = ogmPkg;

config();

// Same as the Getting Started docs (https://neo4j.com/docs/graphql-manual/current/getting-started/#_define_your_graphql_type_definitions)
// with Apollo Federation elements added.
const typeDefs = gql`
  scalar _FieldSet
  scalar _Any
  directive @key(fields: _FieldSet!) repeatable on OBJECT | INTERFACE

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

const neoSchema = new Neo4jGraphQL({
  typeDefs,
  driver
});

await ogm.init();
const schema = await neoSchema.getSchema();
const printedSchema = printSchemaWithDirectives(schema);
// print the full schema to stdout if asked
if (process.argv[2] === "print") {
  console.log(printedSchema);
} else {
  // otherwise run a server
  const resolvers = getResolversFromSchema(schema);
  const server = new ApolloServer({
    // @ts-ignore - the getResolversFromSchema type doesn't match the resolvers property type.
    schema: buildSubgraphSchema({
      typeDefs: gql(printedSchema),
      resolvers: {
        // Include all resolvers that are part of the schema...
        ...resolvers,
        Movie: {
          // Include all resolvers that are part of the movie entity...
          ...resolvers.Movie,
          // Define the reference resolver: https://www.apollographql.com/docs/federation/entities/#2-define-a-reference-resolver
          /**
           * Resolves Movie entity references.
           * @param {{ id: string }} movie
           * @param {*} context
           * @param {import("graphql").GraphQLResolveInfo} info
           */
          __resolveReference: async ({id}, context, info) => {
            console.log("Resolving Movie with Id ", id);

            const selectionSetMap = extractSelectionSetMap(info.fieldNodes[0].selectionSet);
            const selectStatement = selectionSetMap.get("Movie");
            const movies = await ogm.model("Movie").find({
              where: { id },
              selectionSet: selectStatement
            });

            console.log("Located movies ", movies);

            return movies.length ? movies[0] : null;
          }
        },
        Actor: {
          ...resolvers.Actor,
          /**
           * Resolves Actor entity references.
           * @param {{id: string}} param0
           * @param {*} context
           * @param {import("graphql").GraphQLResolveInfo} info
           */
          __resolveReference: async ({id}, context, info) => {
            console.log("Resolving Actor with Id ", id);

            const selectionSetMap = extractSelectionSetMap(info.fieldNodes[0].selectionSet);
            const selectStatement = selectionSetMap.get("Actor");
            const actors = await ogm.model("Actor").find({
              where: { id },
              selectionSet: selectStatement
            });

            console.log("Located actors ", actors)

            return actors.length ? actors[0] : null;
          }
        }
      }
    })
  });
  const { url } = await server.listen(4000);
  console.log(`🚀 Server ready at ${url}`);
}
