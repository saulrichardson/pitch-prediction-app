import { writeFile, mkdir } from "node:fs/promises";
import { fixtureEdition } from "../tests/fixtures/replay";
await mkdir(".cache", { recursive: true });
await writeFile(".cache/test-edition.json", JSON.stringify(fixtureEdition()));
