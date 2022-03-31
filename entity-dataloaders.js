import DataLoader from "dataloader";
import { print } from "graphql";

/**
 * @template Ref, Key
 * @typedef EntityConfiguration
 * @property {string} name the name of the entity in the GraphQL Schema
 * @property {import("@neo4j/graphql-ogm").Model} model the cooresponding model in Neo4J
 * @property {(_: Ref) => Key} refToKey a function that maps a reference to a unique identifier. must align with the `@key(fields:)` directive
 * @property {(_: Key[]) => import("@neo4j/graphql-ogm").GraphQLWhereArg} whereClause a function that generates a where clause get a list of keys
 */

/**
 * Given some configuration for Entities, return a function that generates
 * dataloaders for an entities query.
 *
 * The dataloaders must be created lazily because we don't know what selection
 * set to use for each entity/model until the request is made.
 *
 * Given an entities query like this:
 *
 * query ($representations: [_Any!]!) {
 *   _entities(representations: $representations) {
 *     ... on Movie {
 *       id name
 *     }
 *   }
 * }
 *
 * We need a dataloader that passes the selection set (`{ id name }`) into the
 * Neo4J query.
 *
 * @template Ref, Key
 * @param {EntityConfiguration<Ref, Key>[]} entityConfiguration
 * @returns {(selectionSet: import("graphql").SelectionSetNode) => Map<string, DataLoader>}
 */
export function createEntityDataloaderFactory(entityConfiguration) {
  const dataloaderFactoriesByEntity = new Map();

  for (const config of entityConfiguration) {
    /** @param {string} selectionSet */
    const dataloaderFactory = (selectionSet) => {
      return new DataLoader(async (references) => {
        // Convert the entity references into key (aligns with the `@key` directive)
        const keys = references.map(config.refToKey);

        // Make a batch query for the entities, usually using a "where in" clause
        const results = await config.model.find({
          where: config.whereClause(keys),
          selectionSet,
        });

        // Sort the results according to the original order of references argument.
        // This is a requirement of the DataLoader API.
        const resultsByKey = Object.fromEntries(
          results.map((result) => [
            result.id,
            { ...result, __typename: config.name },
          ])
        );

        return keys.map((key) => resultsByKey[key]);
      });
    };

    dataloaderFactoriesByEntity.set(config.name, dataloaderFactory);
  }

  /**
   * @param {import("graphql").SelectionSetNode} selectionSet
   */
  return (selectionSet) => {
    const selectionSets = extractSelectionSetMap(selectionSet);

    const possibleTypes = [...selectionSets.keys()];

    return new Map(
      possibleTypes.map((typename) => {
        const dataloaderFactory = dataloaderFactoriesByEntity.get(typename);
        return [typename, dataloaderFactory(selectionSets.get(typename))];
      })
    );
  };
}

/**
 * Create a map of typename => selection set strings from
 * a selection set with type conditions.
 *
 * Example:
 *
 * {
 *   ... Actor {
 *     id name movies { title }
 *   }
 *   ... Movie {
 *     id title actors { name }
 *   }
 * }
 *
 * =>
 *
 * Map(
 *   "Actor" => "id name movies { title }",
 *   "Movie" => "id title actors { name }"
 * )
 *
 * @todo
 * @param {import("graphql").SelectionSetNode} selectionSet
 */
export function extractSelectionSetMap(selectionSet) {
  const map = new Map();

  for (const selection of selectionSet.selections) {
    if (selection.kind === "InlineFragment") {
      const typeName = selection.typeCondition.name.value;
      map.set(typeName, print(selection.selectionSet));
    }
  }

  return map;
}
