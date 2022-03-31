import { extractSelectionSetMap } from "./entity-dataloaders.js";
import { Kind, parse } from "graphql";

test("extractSelectionSetMap", () => {
  const doc = parse(`{
    ... on Movie {
      id title actors { name }
    }
    ... on Actor {
      id name movies { title }
    }
  }`);

  if (doc.definitions[0].kind !== Kind.OPERATION_DEFINITION) {
    throw new Error("qed");
  }

  const selectionSet = doc.definitions[0].selectionSet;
  const result = extractSelectionSetMap(selectionSet);

  expect([...result.keys()].sort()).toEqual(["Actor", "Movie"]);
  expect(result.get("Actor")).toMatchInlineSnapshot(`
    "{
      id
      name
      movies {
        title
      }
    }"
  `);
  expect(result.get("Movie")).toMatchInlineSnapshot(`
    "{
      id
      title
      actors {
        name
      }
    }"
  `);
});
